package storage

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/credentials"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/aws/aws-sdk-go/service/s3/s3manager"
	"github.com/monzim/db_proxy/v1/internal/models"
)

// Per-operation timeouts. Backups can be many GB, so the upload/download
// budget is generous; head/delete/list are cheap and short.
const (
	storageUploadTimeout   = 30 * time.Minute
	storageDownloadTimeout = 30 * time.Minute
	storageMetaTimeout     = 30 * time.Second

	// multipartPartSize triggers AWS SDK multipart uploads above ~5 MB,
	// which the SDK requires anyway. Larger parts mean fewer roundtrips
	// for big backups.
	multipartPartSize    = 16 * 1024 * 1024
	multipartConcurrency = 4
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
	awsConfig := &aws.Config{
		Credentials: credentials.NewStaticCredentials(config.AccessKey, config.SecretKey, ""),
	}

	// Set region for S3
	if config.Region != "" {
		awsConfig.Region = aws.String(config.Region)
	}

	// Set custom endpoint for R2 or custom S3-compatible storage
	if config.Endpoint != "" {
		awsConfig.Endpoint = aws.String(config.Endpoint)
		awsConfig.S3ForcePathStyle = aws.Bool(true) // Required for R2 and some S3-compatible services
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

// UploadFile uploads a file to cloud storage using s3manager so large files
// are streamed via multipart and the call is bounded by a hard timeout.
// Without the timeout a stuck connection could pin a backup goroutine
// forever and exhaust the worker pool.
func (sc *StorageClient) UploadFile(filePath, objectKey string, metadata map[string]string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	awsMetadata := make(map[string]*string, len(metadata))
	for k, v := range metadata {
		awsMetadata[k] = aws.String(v)
	}

	ctx, cancel := context.WithTimeout(context.Background(), storageUploadTimeout)
	defer cancel()

	_, err = sc.uploader.UploadWithContext(ctx, &s3manager.UploadInput{
		Bucket:   aws.String(sc.bucket),
		Key:      aws.String(objectKey),
		Body:     file,
		Metadata: awsMetadata,
	})
	if err != nil {
		return fmt.Errorf("failed to upload to S3: %w", err)
	}
	return nil
}

// DownloadFile downloads from cloud storage with a bounded timeout. Uses
// the s3manager downloader, which transparently parallelises range reads
// for large objects.
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
		return fmt.Errorf("failed to download from S3: %w", err)
	}
	return nil
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
		return fmt.Errorf("failed to delete from S3: %w", err)
	}
	return nil
}

// ListFiles lists files with a given prefix
func (sc *StorageClient) ListFiles(prefix string) ([]*s3.Object, error) {
	ctx, cancel := context.WithTimeout(context.Background(), storageMetaTimeout)
	defer cancel()

	result, err := sc.s3Client.ListObjectsV2WithContext(ctx, &s3.ListObjectsV2Input{
		Bucket: aws.String(sc.bucket),
		Prefix: aws.String(prefix),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list objects: %w", err)
	}
	return result.Contents, nil
}

// GetObjectKey generates the S3 key for a backup file
func GetObjectKey(configID, filename string) string {
	return fmt.Sprintf("backups/%s/%s", configID, filename)
}
