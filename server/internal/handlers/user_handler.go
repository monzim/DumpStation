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
	Image string `json:"image"` // Base64-encoded image data (data URL format)
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

// GetUserAvatar godoc
// @Summary Get user avatar image
// @Description Retrieve the profile picture of the currently authenticated user as binary image data
// @Tags User
// @Produce image/jpeg,image/png,image/gif,image/webp
// @Security BearerAuth
// @Success 200 {file} binary "Avatar image"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Failure 404 {object} map[string]string "No avatar found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /users/me/avatar [get]
func (h *Handler) GetUserAvatar(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

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

	if len(user.ProfilePictureData) == 0 {
		writeError(w, http.StatusNotFound, "no avatar found")
		return
	}

	// Set content type and cache headers
	w.Header().Set("Content-Type", user.ProfilePictureMimeType)
	w.Header().Set("Cache-Control", "private, max-age=3600") // Cache for 1 hour
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(user.ProfilePictureData)))

	w.WriteHeader(http.StatusOK)
	w.Write(user.ProfilePictureData)
}

// UploadAvatar godoc
// @Summary Upload user avatar
// @Description Upload a profile picture for the currently authenticated user. Accepts base64-encoded image data. The image is stored directly in the database.
// @Tags User
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body AvatarUploadRequest true "Base64-encoded image data (data URL format)"
// @Success 200 {object} models.UserProfileResponse "Updated user profile"
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

	if _, ok := AllowedImageTypes[mimeInfo]; !ok {
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

	// Store image data in database
	if err := h.repo.UpdateUserProfilePicture(*userID, imageData, mimeInfo); err != nil {
		logError("Failed to update user profile picture", err)
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

	log.Printf("[AVATAR] ✅ Avatar uploaded for user %s (size: %d bytes, type: %s)", userID, len(imageData), mimeInfo)

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

	// Clear the profile picture in database
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
// @Summary Upload user avatar (multipart form)
// @Description Upload a profile picture using multipart form data. The image is stored directly in the database.
// @Tags User
// @Accept multipart/form-data
// @Produce json
// @Security BearerAuth
// @Param avatar formData file true "Avatar image file"
// @Success 200 {object} models.UserProfileResponse "Updated user profile"
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

	if _, ok := AllowedImageTypes[contentType]; !ok {
		writeError(w, http.StatusBadRequest, "unsupported image type - allowed: jpeg, png, gif, webp")
		return
	}

	// Read entire file
	imageData, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read file")
		return
	}

	// Store image data in database
	if err := h.repo.UpdateUserProfilePicture(*userID, imageData, contentType); err != nil {
		logError("Failed to update user profile picture", err)
		writeError(w, http.StatusInternalServerError, "failed to update profile")
		return
	}

	// Get updated profile
	updatedUser, err := h.repo.GetUserByID(*userID)
	if err != nil {
		logError("Failed to get updated user profile", err)
		writeError(w, http.StatusInternalServerError, "avatar uploaded but failed to fetch updated profile")
		return
	}

	log.Printf("[AVATAR] ✅ Avatar uploaded for user %s (size: %d bytes, type: %s)", userID, len(imageData), contentType)

	writeJSON(w, http.StatusOK, updatedUser.ToProfileResponse())
}

// Unused import placeholder to avoid compile errors when not all are needed
var _ = time.Now
