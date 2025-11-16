package storage

import (
	"fmt"
	"io"
	"os"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/credentials"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/monzim/db_proxy/v1/internal/models"
)

// StorageClient handles cloud storage operations
type StorageClient struct {
	s3Client *s3.S3
	bucket   string
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

	return &StorageClient{
		s3Client: s3.New(sess),
		bucket:   config.Bucket,
	}, nil
}

// UploadFile uploads a file to cloud storage
func (sc *StorageClient) UploadFile(filePath, objectKey string, metadata map[string]string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	// Convert metadata to AWS format
	awsMetadata := make(map[string]*string)
	for k, v := range metadata {
		awsMetadata[k] = aws.String(v)
	}

	_, err = sc.s3Client.PutObject(&s3.PutObjectInput{
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

// DownloadFile downloads a file from cloud storage
func (sc *StorageClient) DownloadFile(objectKey, destinationPath string) error {
	result, err := sc.s3Client.GetObject(&s3.GetObjectInput{
		Bucket: aws.String(sc.bucket),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return fmt.Errorf("failed to download from S3: %w", err)
	}
	defer result.Body.Close()

	file, err := os.Create(destinationPath)
	if err != nil {
		return fmt.Errorf("failed to create destination file: %w", err)
	}
	defer file.Close()

	_, err = io.Copy(file, result.Body)
	if err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}

	return nil
}

// DeleteFile deletes a file from cloud storage
func (sc *StorageClient) DeleteFile(objectKey string) error {
	_, err := sc.s3Client.DeleteObject(&s3.DeleteObjectInput{
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
	result, err := sc.s3Client.ListObjectsV2(&s3.ListObjectsV2Input{
		Bucket: aws.String(sc.bucket),
		Prefix: aws.String(prefix),
	})

	if err != nil {
		return nil, fmt.Errorf("failed to list objects: %w", err)
	}

	return result.Contents, nil
}

// GetObjectKey generates the S3 key for a backup file
func GetObjectKey(dbName, filename string) string {
	return fmt.Sprintf("backups/%s/%s", dbName, filename)
}
