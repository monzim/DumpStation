package auth

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"image"
	"image/png"
	"strings"
	"time"

	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
)

// TOTPConfig holds configuration for TOTP generation
type TOTPConfig struct {
	Issuer    string
	Digits    int
	Period    uint
	Algorithm otp.Algorithm
}

// DefaultTOTPConfig returns the default TOTP configuration
func DefaultTOTPConfig() *TOTPConfig {
	return &TOTPConfig{
		Issuer:    "dumpstation.monzim.com",
		Digits:    8,
		Period:    30, // 30 seconds
		Algorithm: otp.AlgorithmSHA256,
	}
}

// TOTPManager handles TOTP operations for 2FA
type TOTPManager struct {
	config *TOTPConfig
}

// NewTOTPManager creates a new TOTP manager with the given configuration
func NewTOTPManager(config *TOTPConfig) *TOTPManager {
	if config == nil {
		config = DefaultTOTPConfig()
	}
	return &TOTPManager{config: config}
}

// TOTPSetupResult contains the data needed for user to set up 2FA
type TOTPSetupResult struct {
	Secret        string `json:"secret"`           // Base32-encoded secret for manual entry
	QRCodeDataURL string `json:"qr_code_data_url"` // Data URL for QR code image (base64 PNG)
	Issuer        string `json:"issuer"`
	AccountName   string `json:"account_name"`
}

// GenerateSecret generates a new TOTP secret for a user
func (tm *TOTPManager) GenerateSecret(accountName string) (*TOTPSetupResult, error) {
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      tm.config.Issuer,
		AccountName: accountName,
		Period:      tm.config.Period,
		Digits:      otp.Digits(tm.config.Digits),
		Algorithm:   tm.config.Algorithm,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to generate TOTP key: %w", err)
	}

	// Generate QR code as PNG
	qrImage, err := key.Image(200, 200)
	if err != nil {
		return nil, fmt.Errorf("failed to generate QR code image: %w", err)
	}

	// Convert image to base64 data URL
	var buf strings.Builder
	buf.WriteString("data:image/png;base64,")

	// Encode image to PNG and then to base64
	pngData, err := encodePNG(qrImage)
	if err != nil {
		return nil, fmt.Errorf("failed to encode QR code as PNG: %w", err)
	}
	buf.WriteString(base64.StdEncoding.EncodeToString(pngData))

	return &TOTPSetupResult{
		Secret:        key.Secret(),
		QRCodeDataURL: buf.String(),
		Issuer:        tm.config.Issuer,
		AccountName:   accountName,
	}, nil
}

// ValidateCode validates a TOTP code against the secret
func (tm *TOTPManager) ValidateCode(secret, code string) bool {
	return totp.Validate(code, secret)
}

// ValidateCodeWithWindow validates a TOTP code with a time window for clock skew
func (tm *TOTPManager) ValidateCodeWithWindow(secret, code string) (bool, error) {
	// Allow 1 period before and after for clock skew tolerance
	valid, err := totp.ValidateCustom(code, secret, time.Now(), totp.ValidateOpts{
		Period:    tm.config.Period,
		Skew:      1,
		Digits:    otp.Digits(tm.config.Digits),
		Algorithm: tm.config.Algorithm,
	})
	return valid, err
}

// BackupCodesResult contains generated backup codes
type BackupCodesResult struct {
	Codes       []string `json:"codes"` // Plain text codes to show user once
	HashedCodes []string `json:"-"`     // Hashed codes to store in database
}

// GenerateBackupCodes generates a set of backup recovery codes
func (tm *TOTPManager) GenerateBackupCodes(count int) (*BackupCodesResult, error) {
	if count <= 0 {
		count = 10 // Default to 10 backup codes
	}

	codes := make([]string, count)
	hashedCodes := make([]string, count)

	for i := 0; i < count; i++ {
		// Generate 8 random bytes for each code
		randomBytes := make([]byte, 8)
		if _, err := rand.Read(randomBytes); err != nil {
			return nil, fmt.Errorf("failed to generate random bytes: %w", err)
		}

		// Create a readable code format: XXXX-XXXX-XXXX
		codeBytes := make([]byte, 12)
		base32Encoded := base32.StdEncoding.EncodeToString(randomBytes)
		copy(codeBytes, strings.ToUpper(base32Encoded[:12]))

		code := fmt.Sprintf("%s-%s-%s", string(codeBytes[0:4]), string(codeBytes[4:8]), string(codeBytes[8:12]))
		codes[i] = code

		// Hash the code for storage
		hashedCodes[i] = hashBackupCode(code)
	}

	return &BackupCodesResult{
		Codes:       codes,
		HashedCodes: hashedCodes,
	}, nil
}

// ValidateBackupCode checks if a backup code is valid and returns the index if found
func (tm *TOTPManager) ValidateBackupCode(code string, hashedCodes []string) (int, bool) {
	// Normalize the code (remove dashes, uppercase)
	normalizedCode := strings.ToUpper(strings.ReplaceAll(code, "-", ""))

	// Also try with the formatted version
	formattedCode := code
	if len(normalizedCode) == 12 {
		formattedCode = fmt.Sprintf("%s-%s-%s", normalizedCode[0:4], normalizedCode[4:8], normalizedCode[8:12])
	}

	hashedInput := hashBackupCode(formattedCode)
	hashedInputNormalized := hashBackupCode(normalizedCode)

	for i, hashedCode := range hashedCodes {
		if hashedCode == hashedInput || hashedCode == hashedInputNormalized {
			return i, true
		}
	}
	return -1, false
}

// hashBackupCode creates a SHA-256 hash of a backup code
func hashBackupCode(code string) string {
	hash := sha256.Sum256([]byte(strings.ToUpper(code)))
	return hex.EncodeToString(hash[:])
}

// RemoveBackupCode removes a used backup code from the list
func RemoveBackupCode(codes []string, index int) []string {
	if index < 0 || index >= len(codes) {
		return codes
	}
	return append(codes[:index], codes[index+1:]...)
}

// encodePNG encodes an image.Image to PNG bytes
func encodePNG(img image.Image) ([]byte, error) {
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, fmt.Errorf("failed to encode PNG: %w", err)
	}
	return buf.Bytes(), nil
}
