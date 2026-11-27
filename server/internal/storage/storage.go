// Package storage wraps S3-compatible object storage (AWS S3, Cloudflare R2,
// MinIO and other compatible services).
package storage

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/awserr"
	"github.com/aws/aws-sdk-go/aws/credentials"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/aws/aws-sdk-go/service/s3/s3manager"
	"github.com/google/uuid"
	"github.com/monzim/db_proxy/v1/internal/models"
)

// Per-operation timeouts. Backups can be many GB, so the upload/download
// budget is generous; head/delete/list are cheap and short.
const (
	storageUploadTimeout   = 6 * time.Hour
	storageDownloadTimeout = 6 * time.Hour
	storageMetaTimeout     = 30 * time.Second

	multipartPartSize    = 16 * 1024 * 1024
	multipartConcurrency = 4

	// AgentPartSize is the part size agents use for presigned multipart
	// uploads. 64 MiB keeps the part count under S3's 10,000 limit up to
	// ~625 GiB while bounding agent memory to one part.
	AgentPartSize = 64 * 1024 * 1024
	// MaxParts is the S3 multipart part-count limit.
	MaxParts = 10000
)

// StorageClient handles cloud storage operations
type StorageClient struct {
	s3Client   *s3.S3
	uploader   *s3manager.Uploader
	downloader *s3manager.Downloader
	bucket     string
}

// NewStorageClient creates a new storage client based on configuration
func NewStorageClient(config *models.StorageConfig) (*StorageClient, error) {
	if config == nil {
		return nil, errors.New("storage config is nil")
	}
	awsConfig := &aws.Config{
		Credentials: credentials.NewStaticCredentials(config.AccessKey, config.SecretKey, ""),
	}

	region := config.Region
	if region == "" {
		if config.Endpoint != "" {
			region = "auto"
		} else {
			region = "us-east-1"
		}
	}
	awsConfig.Region = aws.String(region)

	if config.Endpoint != "" {
		awsConfig.Endpoint = aws.String(config.Endpoint)
		awsConfig.S3ForcePathStyle = aws.Bool(true) // Required for R2, MinIO and most S3-compatible services
	}

	sess, err := session.NewSession(awsConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create AWS session: %w", err)
	}

	s3Client := s3.New(sess)

	return &StorageClient{
		s3Client: s3Client,
		uploader: s3manager.NewUploaderWithClient(s3Client, func(u *s3manager.Uploader) {
			u.PartSize = multipartPartSize
			u.Concurrency = multipartConcurrency
		}),
		downloader: s3manager.NewDownloaderWithClient(s3Client, func(d *s3manager.Downloader) {
			d.PartSize = multipartPartSize
			d.Concurrency = multipartConcurrency
		}),
		bucket: config.Bucket,
	}, nil
}

func toAWSMeta(metadata map[string]string) map[string]*string {
	m := make(map[string]*string, len(metadata))
	for k, v := range metadata {
		m[k] = aws.String(v)
	}
	return m
}

// UploadFile uploads a local file using multipart upload.
func (sc *StorageClient) UploadFile(filePath, objectKey string, metadata map[string]string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()
	ctx, cancel := context.WithTimeout(context.Background(), storageUploadTimeout)
	defer cancel()
	return sc.UploadReader(ctx, file, objectKey, metadata)
}

// UploadReader streams r to objectKey. Memory use is bounded by the part
// size times concurrency regardless of the object size.
func (sc *StorageClient) UploadReader(ctx context.Context, r io.Reader, objectKey string, metadata map[string]string) error {
	_, err := sc.uploader.UploadWithContext(ctx, &s3manager.UploadInput{
		Bucket:   aws.String(sc.bucket),
		Key:      aws.String(objectKey),
		Body:     r,
		Metadata: toAWSMeta(metadata),
	})
	if err != nil {
		return fmt.Errorf("failed to upload to storage: %w", err)
	}
	return nil
}

// DownloadFile downloads an object to a local path.
func (sc *StorageClient) DownloadFile(objectKey, destinationPath string) error {
	file, err := os.Create(destinationPath)
	if err != nil {
		return fmt.Errorf("failed to create destination file: %w", err)
	}
	defer file.Close()

	ctx, cancel := context.WithTimeout(context.Background(), storageDownloadTimeout)
	defer cancel()

	if _, err := sc.downloader.DownloadWithContext(ctx, file, &s3.GetObjectInput{
		Bucket: aws.String(sc.bucket),
		Key:    aws.String(objectKey),
	}); err != nil {
		return fmt.Errorf("failed to download from storage: %w", err)
	}
	return nil
}

// OpenReader returns a streaming reader for objectKey and its size.
func (sc *StorageClient) OpenReader(ctx context.Context, objectKey string) (io.ReadCloser, int64, error) {
	out, err := sc.s3Client.GetObjectWithContext(ctx, &s3.GetObjectInput{
		Bucket: aws.String(sc.bucket),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return nil, 0, fmt.Errorf("failed to open object: %w", err)
	}
	return out.Body, aws.Int64Value(out.ContentLength), nil
}

// Head returns the size of objectKey.
func (sc *StorageClient) Head(ctx context.Context, objectKey string) (int64, error) {
	ctx, cancel := context.WithTimeout(ctx, storageMetaTimeout)
	defer cancel()
	out, err := sc.s3Client.HeadObjectWithContext(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(sc.bucket),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return 0, fmt.Errorf("failed to stat object: %w", err)
	}
	return aws.Int64Value(out.ContentLength), nil
}

// DeleteFile deletes a file from cloud storage
func (sc *StorageClient) DeleteFile(objectKey string) error {
	ctx, cancel := context.WithTimeout(context.Background(), storageMetaTimeout)
	defer cancel()

	_, err := sc.s3Client.DeleteObjectWithContext(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(sc.bucket),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return fmt.Errorf("failed to delete from storage: %w", err)
	}
	return nil
}

// TestResult reports a storage connectivity check.
type TestResult struct {
	OK        bool   `json:"ok"`
	Stage     string `json:"stage,omitempty"`
	Message   string `json:"message"`
	LatencyMS int64  `json:"latency_ms"`
}

// Test verifies credentials and write permissions by writing, reading and
// deleting a small probe object under ".dumpstation/".
func (sc *StorageClient) Test(ctx context.Context) TestResult {
	start := time.Now()
	key := fmt.Sprintf(".dumpstation/healthcheck-%s", uuid.NewString())
	body := []byte("dumpstation storage check")
	res := func(ok bool, stage, msg string) TestResult {
		return TestResult{OK: ok, Stage: stage, Message: msg, LatencyMS: time.Since(start).Milliseconds()}
	}
	cctx, cancel := context.WithTimeout(ctx, storageMetaTimeout)
	defer cancel()
	if _, err := sc.s3Client.PutObjectWithContext(cctx, &s3.PutObjectInput{
		Bucket: aws.String(sc.bucket), Key: aws.String(key), Body: bytes.NewReader(body),
	}); err != nil {
		return res(false, "write", DescribeError(err))
	}
	if _, err := sc.s3Client.HeadObjectWithContext(cctx, &s3.HeadObjectInput{
		Bucket: aws.String(sc.bucket), Key: aws.String(key),
	}); err != nil {
		return res(false, "read", DescribeError(err))
	}
	if _, err := sc.s3Client.DeleteObjectWithContext(cctx, &s3.DeleteObjectInput{
		Bucket: aws.String(sc.bucket), Key: aws.String(key),
	}); err != nil {
		return res(false, "delete", DescribeError(err))
	}
	return res(true, "", "Write, read and delete succeeded")
}

// DescribeError turns an S3 error into a short, credential-free message.
func DescribeError(err error) string {
	var aerr awserr.Error
	if errors.As(err, &aerr) {
		switch aerr.Code() {
		case "NoSuchBucket":
			return "Bucket does not exist"
		case "InvalidAccessKeyId":
			return "Access key is not valid"
		case "SignatureDoesNotMatch":
			return "Secret key does not match the access key"
		case "AccessDenied", "Forbidden":
			return "Access denied: the credentials lack permission for this bucket"
		case "RequestError":
			return "Could not reach the storage endpoint"
		}
		msg := aerr.Message()
		if msg == "" {
			msg = aerr.Code()
		}
		return aerr.Code() + ": " + msg
	}
	msg := err.Error()
	if len(msg) > 300 {
		msg = msg[:300]
	}
	return msg
}

// GetObjectKey generates the S3 key for a backup file
func GetObjectKey(configID, filename string) string {
	return fmt.Sprintf("backups/%s/%s", configID, filename)
}

// PresignDownload returns a time-limited GET URL for objectKey.
func (sc *StorageClient) PresignDownload(objectKey, downloadFilename string, ttl time.Duration) (string, error) {
	in := &s3.GetObjectInput{Bucket: aws.String(sc.bucket), Key: aws.String(objectKey)}
	if downloadFilename != "" {
		in.ResponseContentDisposition = aws.String(fmt.Sprintf(`attachment; filename="%s"`, downloadFilename))
	}
	req, _ := sc.s3Client.GetObjectRequest(in)
	url, err := req.Presign(ttl)
	if err != nil {
		return "", fmt.Errorf("failed to presign download: %w", err)
	}
	return url, nil
}

// CreateMultipartUpload starts a multipart upload for objectKey.
func (sc *StorageClient) CreateMultipartUpload(ctx context.Context, objectKey string, metadata map[string]string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, storageMetaTimeout)
	defer cancel()
	out, err := sc.s3Client.CreateMultipartUploadWithContext(ctx, &s3.CreateMultipartUploadInput{
		Bucket:   aws.String(sc.bucket),
		Key:      aws.String(objectKey),
		Metadata: toAWSMeta(metadata),
	})
	if err != nil {
		return "", fmt.Errorf("failed to start multipart upload: %w", err)
	}
	return aws.StringValue(out.UploadId), nil
}

// PresignUploadPart returns a URL authorising an HTTP PUT of exactly one part
// of one multipart upload. The URL cannot be used for any other object.
func (sc *StorageClient) PresignUploadPart(objectKey, uploadID string, partNumber int64, ttl time.Duration) (string, error) {
	req, _ := sc.s3Client.UploadPartRequest(&s3.UploadPartInput{
		Bucket:     aws.String(sc.bucket),
		Key:        aws.String(objectKey),
		UploadId:   aws.String(uploadID),
		PartNumber: aws.Int64(partNumber),
	})
	url, err := req.Presign(ttl)
	if err != nil {
		return "", fmt.Errorf("failed to presign upload part: %w", err)
	}
	return url, nil
}

// CompletedPart identifies an uploaded part.
type CompletedPart struct {
	PartNumber int64  `json:"part_number"`
	ETag       string `json:"etag"`
}

// CompleteMultipartUpload assembles the uploaded parts into the final object.
func (sc *StorageClient) CompleteMultipartUpload(ctx context.Context, objectKey, uploadID string, parts []CompletedPart) error {
	if len(parts) == 0 {
		return errors.New("no parts uploaded")
	}
	sort.Slice(parts, func(i, j int) bool { return parts[i].PartNumber < parts[j].PartNumber })
	cp := make([]*s3.CompletedPart, len(parts))
	for i, p := range parts {
		etag := p.ETag
		if !strings.HasPrefix(etag, `"`) {
			etag = `"` + etag + `"`
		}
		cp[i] = &s3.CompletedPart{PartNumber: aws.Int64(p.PartNumber), ETag: aws.String(etag)}
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	_, err := sc.s3Client.CompleteMultipartUploadWithContext(ctx, &s3.CompleteMultipartUploadInput{
		Bucket:          aws.String(sc.bucket),
		Key:             aws.String(objectKey),
		UploadId:        aws.String(uploadID),
		MultipartUpload: &s3.CompletedMultipartUpload{Parts: cp},
	})
	if err != nil {
		return fmt.Errorf("failed to complete multipart upload: %w", err)
	}
	return nil
}

// AbortMultipartUpload discards an incomplete multipart upload.
func (sc *StorageClient) AbortMultipartUpload(ctx context.Context, objectKey, uploadID string) error {
	ctx, cancel := context.WithTimeout(ctx, storageMetaTimeout)
	defer cancel()
	_, err := sc.s3Client.AbortMultipartUploadWithContext(ctx, &s3.AbortMultipartUploadInput{
		Bucket:   aws.String(sc.bucket),
		Key:      aws.String(objectKey),
		UploadId: aws.String(uploadID),
	})
	if err != nil {
		return fmt.Errorf("failed to abort multipart upload: %w", err)
	}
	return nil
}
