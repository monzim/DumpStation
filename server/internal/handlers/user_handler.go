package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/credentials"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/google/uuid"
	"github.com/monzim/db_proxy/v1/internal/models"
)

// MaxAvatarSize is the maximum allowed size for avatar uploads (2MB)
const MaxAvatarSize = 2 * 1024 * 1024

// AllowedImageTypes are the allowed MIME types for avatar uploads
var AllowedImageTypes = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/gif":  ".gif",
	"image/webp": ".webp",
}

// AvatarUploadRequest represents the request body for avatar upload
type AvatarUploadRequest struct {
	Image string `json:"image"` // Base64-encoded image data
}

// GetUserProfile godoc
// @Summary Get current user profile
// @Description Retrieve the profile information of the currently authenticated user
// @Tags User
// @Produce json
// @Security BearerAuth
// @Success 200 {object} models.UserProfileResponse "User profile information"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 404 {object} map[string]string "User not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /users/me [get]
func (h *Handler) GetUserProfile(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	user, err := h.repo.GetUserByID(*userID)
	if err != nil {
		logError("Failed to get user profile", err)
		writeError(w, http.StatusInternalServerError, "failed to get user profile")
		return
	}

	if user == nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	writeJSON(w, http.StatusOK, user.ToProfileResponse())
}

// UploadAvatar godoc
// @Summary Upload user avatar
// @Description Upload a profile picture for the currently authenticated user. Accepts base64-encoded image data.
// @Tags User
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body AvatarUploadRequest true "Base64-encoded image data"
// @Success 200 {object} models.UserProfileResponse "Updated user profile with new avatar URL"
// @Failure 400 {object} map[string]string "Bad request - invalid image format or size"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 403 {object} map[string]string "Forbidden - demo users cannot upload avatars"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /users/me/avatar [post]
func (h *Handler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Demo users cannot upload avatars
	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot upload avatars")
		return
	}

	var req AvatarUploadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		logError("Invalid JSON in avatar upload request", err)
		writeError(w, http.StatusBadRequest, "invalid JSON in request body")
		return
	}

	if req.Image == "" {
		writeError(w, http.StatusBadRequest, "image data is required")
		return
	}

	// Parse the base64 image data
	// Format: data:image/png;base64,iVBORw0KGgo...
	parts := strings.SplitN(req.Image, ",", 2)
	if len(parts) != 2 {
		writeError(w, http.StatusBadRequest, "invalid image format - expected data URL")
		return
	}

	// Extract MIME type from the data URL
	mimeInfo := strings.TrimPrefix(parts[0], "data:")
	mimeInfo = strings.TrimSuffix(mimeInfo, ";base64")

	ext, ok := AllowedImageTypes[mimeInfo]
	if !ok {
		writeError(w, http.StatusBadRequest, "unsupported image type - allowed: jpeg, png, gif, webp")
		return
	}

	// Decode base64 data
	imageData, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		logError("Failed to decode base64 image", err)
		writeError(w, http.StatusBadRequest, "invalid base64 image data")
		return
	}

	// Check image size
	if len(imageData) > MaxAvatarSize {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("image too large - maximum size is %d MB", MaxAvatarSize/(1024*1024)))
		return
	}

	// Get user's first storage config for uploading avatar
	isAdmin := getIsAdminFromContext(r)
	storageConfigs, err := h.repo.ListStorageConfigsByUser(*userID, isAdmin)
	if err != nil || len(storageConfigs) == 0 {
		logError("No storage config found for user", err)
		writeError(w, http.StatusBadRequest, "no storage configuration found - please add a storage config first")
		return
	}

	// Use the first storage config
	storageConfig := storageConfigs[0]

	// Create S3 client
	awsConfig := &aws.Config{
		Credentials: credentials.NewStaticCredentials(storageConfig.AccessKey, storageConfig.SecretKey, ""),
	}

	if storageConfig.Region != "" {
		awsConfig.Region = aws.String(storageConfig.Region)
	}

	if storageConfig.Endpoint != "" {
		awsConfig.Endpoint = aws.String(storageConfig.Endpoint)
		awsConfig.S3ForcePathStyle = aws.Bool(true)
	}

	sess, err := session.NewSession(awsConfig)
	if err != nil {
		logError("Failed to create AWS session", err)
		writeError(w, http.StatusInternalServerError, "failed to upload avatar")
		return
	}

	s3Client := s3.New(sess)

	// Generate unique filename
	filename := fmt.Sprintf("avatars/%s/%s%s", userID.String(), uuid.New().String(), ext)

	// Upload to S3
	_, err = s3Client.PutObject(&s3.PutObjectInput{
		Bucket:      aws.String(storageConfig.Bucket),
		Key:         aws.String(filename),
		Body:        strings.NewReader(string(imageData)),
		ContentType: aws.String(mimeInfo),
		ACL:         aws.String("public-read"), // Make avatar publicly accessible
	})

	if err != nil {
		logError("Failed to upload avatar to S3", err)
		writeError(w, http.StatusInternalServerError, "failed to upload avatar")
		return
	}

	// Construct the public URL
	var avatarURL string
	if storageConfig.Endpoint != "" {
		// R2 or custom endpoint
		avatarURL = fmt.Sprintf("%s/%s/%s", strings.TrimSuffix(storageConfig.Endpoint, "/"), storageConfig.Bucket, filename)
	} else {
		// Standard S3
		avatarURL = fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", storageConfig.Bucket, storageConfig.Region, filename)
	}

	// Delete old avatar if exists
	user, _ := h.repo.GetUserByID(*userID)
	if user != nil && user.ProfilePictureURL != "" {
		go func() {
			oldKey := extractKeyFromURL(user.ProfilePictureURL, storageConfig)
			if oldKey != "" {
				if _, err := s3Client.DeleteObject(&s3.DeleteObjectInput{
					Bucket: aws.String(storageConfig.Bucket),
					Key:    aws.String(oldKey),
				}); err != nil {
					log.Printf("[AVATAR] ⚠️  Failed to delete old avatar: %v", err)
				}
			}
		}()
	}

	// Update user profile with new avatar URL
	if err := h.repo.UpdateUserProfilePicture(*userID, avatarURL); err != nil {
		logError("Failed to update user profile picture URL", err)
		writeError(w, http.StatusInternalServerError, "failed to update profile")
		return
	}

	// Get updated user profile
	updatedUser, err := h.repo.GetUserByID(*userID)
	if err != nil {
		logError("Failed to get updated user profile", err)
		writeError(w, http.StatusInternalServerError, "avatar uploaded but failed to fetch updated profile")
		return
	}

	log.Printf("[AVATAR] ✅ Avatar uploaded for user %s: %s", userID, avatarURL)

	writeJSON(w, http.StatusOK, updatedUser.ToProfileResponse())
}

// DeleteAvatar godoc
// @Summary Delete user avatar
// @Description Remove the profile picture of the currently authenticated user
// @Tags User
// @Produce json
// @Security BearerAuth
// @Success 200 {object} models.UserProfileResponse "Updated user profile without avatar"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 403 {object} map[string]string "Forbidden - demo users cannot delete avatars"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /users/me/avatar [delete]
func (h *Handler) DeleteAvatar(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Demo users cannot delete avatars
	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot delete avatars")
		return
	}

	// Get current user to find avatar URL
	user, err := h.repo.GetUserByID(*userID)
	if err != nil {
		logError("Failed to get user", err)
		writeError(w, http.StatusInternalServerError, "failed to get user")
		return
	}

	if user == nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	// Delete from S3 if avatar exists
	if user.ProfilePictureURL != "" {
		isAdmin := getIsAdminFromContext(r)
		storageConfigs, err := h.repo.ListStorageConfigsByUser(*userID, isAdmin)
		if err == nil && len(storageConfigs) > 0 {
			storageConfig := storageConfigs[0]

			awsConfig := &aws.Config{
				Credentials: credentials.NewStaticCredentials(storageConfig.AccessKey, storageConfig.SecretKey, ""),
			}

			if storageConfig.Region != "" {
				awsConfig.Region = aws.String(storageConfig.Region)
			}

			if storageConfig.Endpoint != "" {
				awsConfig.Endpoint = aws.String(storageConfig.Endpoint)
				awsConfig.S3ForcePathStyle = aws.Bool(true)
			}

			sess, err := session.NewSession(awsConfig)
			if err == nil {
				s3Client := s3.New(sess)
				key := extractKeyFromURL(user.ProfilePictureURL, storageConfig)
				if key != "" {
					if _, err := s3Client.DeleteObject(&s3.DeleteObjectInput{
						Bucket: aws.String(storageConfig.Bucket),
						Key:    aws.String(key),
					}); err != nil {
						log.Printf("[AVATAR] ⚠️  Failed to delete avatar from S3: %v", err)
					}
				}
			}
		}
	}

	// Clear the profile picture URL in database
	if err := h.repo.DeleteUserProfilePicture(*userID); err != nil {
		logError("Failed to delete user profile picture", err)
		writeError(w, http.StatusInternalServerError, "failed to delete avatar")
		return
	}

	// Get updated user profile
	updatedUser, err := h.repo.GetUserByID(*userID)
	if err != nil {
		logError("Failed to get updated user profile", err)
		writeError(w, http.StatusInternalServerError, "avatar deleted but failed to fetch updated profile")
		return
	}

	log.Printf("[AVATAR] ✅ Avatar deleted for user %s", userID)

	writeJSON(w, http.StatusOK, updatedUser.ToProfileResponse())
}

// UploadAvatarMultipart handles multipart form upload for avatars
// This is an alternative endpoint that accepts file uploads directly
// @Summary Upload user avatar (multipart form)
// @Description Upload a profile picture using multipart form data
// @Tags User
// @Accept multipart/form-data
// @Produce json
// @Security BearerAuth
// @Param avatar formData file true "Avatar image file"
// @Success 200 {object} models.UserProfileResponse "Updated user profile with new avatar URL"
// @Failure 400 {object} map[string]string "Bad request"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 403 {object} map[string]string "Forbidden"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /users/me/avatar/upload [post]
func (h *Handler) UploadAvatarMultipart(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Demo users cannot upload avatars
	if isDemoUserFromContext(r) {
		writeError(w, http.StatusForbidden, "demo users cannot upload avatars")
		return
	}

	// Parse multipart form with max size
	if err := r.ParseMultipartForm(MaxAvatarSize); err != nil {
		writeError(w, http.StatusBadRequest, "file too large or invalid form data")
		return
	}

	file, header, err := r.FormFile("avatar")
	if err != nil {
		writeError(w, http.StatusBadRequest, "avatar file is required")
		return
	}
	defer file.Close()

	// Check file size
	if header.Size > MaxAvatarSize {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("image too large - maximum size is %d MB", MaxAvatarSize/(1024*1024)))
		return
	}

	// Detect content type
	buffer := make([]byte, 512)
	_, err = file.Read(buffer)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read file")
		return
	}
	contentType := http.DetectContentType(buffer)

	// Reset file pointer
	file.Seek(0, 0)

	ext, ok := AllowedImageTypes[contentType]
	if !ok {
		writeError(w, http.StatusBadRequest, "unsupported image type - allowed: jpeg, png, gif, webp")
		return
	}

	// Read entire file
	imageData, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read file")
		return
	}

	// Get user's storage config
	isAdmin := getIsAdminFromContext(r)
	storageConfigs, err := h.repo.ListStorageConfigsByUser(*userID, isAdmin)
	if err != nil || len(storageConfigs) == 0 {
		writeError(w, http.StatusBadRequest, "no storage configuration found - please add a storage config first")
		return
	}

	storageConfig := storageConfigs[0]

	// Create S3 client
	awsConfig := &aws.Config{
		Credentials: credentials.NewStaticCredentials(storageConfig.AccessKey, storageConfig.SecretKey, ""),
	}

	if storageConfig.Region != "" {
		awsConfig.Region = aws.String(storageConfig.Region)
	}

	if storageConfig.Endpoint != "" {
		awsConfig.Endpoint = aws.String(storageConfig.Endpoint)
		awsConfig.S3ForcePathStyle = aws.Bool(true)
	}

	sess, err := session.NewSession(awsConfig)
	if err != nil {
		logError("Failed to create AWS session", err)
		writeError(w, http.StatusInternalServerError, "failed to upload avatar")
		return
	}

	s3Client := s3.New(sess)

	// Generate unique filename
	filename := fmt.Sprintf("avatars/%s/%s%s", userID.String(), uuid.New().String(), ext)

	// Upload to S3
	_, err = s3Client.PutObject(&s3.PutObjectInput{
		Bucket:      aws.String(storageConfig.Bucket),
		Key:         aws.String(filename),
		Body:        strings.NewReader(string(imageData)),
		ContentType: aws.String(contentType),
		ACL:         aws.String("public-read"),
	})

	if err != nil {
		logError("Failed to upload avatar to S3", err)
		writeError(w, http.StatusInternalServerError, "failed to upload avatar")
		return
	}

	// Construct the public URL
	var avatarURL string
	if storageConfig.Endpoint != "" {
		avatarURL = fmt.Sprintf("%s/%s/%s", strings.TrimSuffix(storageConfig.Endpoint, "/"), storageConfig.Bucket, filename)
	} else {
		avatarURL = fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", storageConfig.Bucket, storageConfig.Region, filename)
	}

	// Delete old avatar
	user, _ := h.repo.GetUserByID(*userID)
	if user != nil && user.ProfilePictureURL != "" {
		go func() {
			oldKey := extractKeyFromURL(user.ProfilePictureURL, storageConfig)
			if oldKey != "" {
				s3Client.DeleteObject(&s3.DeleteObjectInput{
					Bucket: aws.String(storageConfig.Bucket),
					Key:    aws.String(oldKey),
				})
			}
		}()
	}

	// Update database
	if err := h.repo.UpdateUserProfilePicture(*userID, avatarURL); err != nil {
		logError("Failed to update user profile picture URL", err)
		writeError(w, http.StatusInternalServerError, "failed to update profile")
		return
	}

	// Get updated profile
	updatedUser, _ := h.repo.GetUserByID(*userID)

	log.Printf("[AVATAR] ✅ Avatar uploaded for user %s: %s", userID, avatarURL)

	writeJSON(w, http.StatusOK, updatedUser.ToProfileResponse())
}

// extractKeyFromURL extracts the S3 key from a full URL
func extractKeyFromURL(url string, config *models.StorageConfig) string {
	if url == "" {
		return ""
	}

	// Try to extract key from the URL
	if config.Endpoint != "" {
		prefix := fmt.Sprintf("%s/%s/", strings.TrimSuffix(config.Endpoint, "/"), config.Bucket)
		if strings.HasPrefix(url, prefix) {
			return strings.TrimPrefix(url, prefix)
		}
	}

	// Standard S3 URL format
	prefix := fmt.Sprintf("https://%s.s3.%s.amazonaws.com/", config.Bucket, config.Region)
	if strings.HasPrefix(url, prefix) {
		return strings.TrimPrefix(url, prefix)
	}

	return ""
}

// Unused import placeholder to avoid compile errors when not all are needed
var _ = time.Now
