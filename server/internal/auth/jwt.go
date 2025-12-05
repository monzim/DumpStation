package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// TokenType represents the type of JWT token
type TokenType string

const (
	TokenTypeFull TokenType = "full" // Full access token (after 2FA verification if enabled)
	TokenType2FA  TokenType = "2fa"  // Temporary token requiring 2FA verification
)

// Claims represents JWT claims
type Claims struct {
	UserID            uuid.UUID `json:"user_id"`
	DiscordUserID     string    `json:"discord_user_id"`
	TwoFactorVerified bool      `json:"two_factor_verified,omitempty"` // True if 2FA was verified for this session
	TokenType         TokenType `json:"token_type,omitempty"`          // Type of token (full or 2fa)
	IsDemo            bool      `json:"is_demo,omitempty"`             // True if this is a demo account
	IsAdmin           bool      `json:"is_admin,omitempty"`            // True if user has admin privileges
	jwt.RegisteredClaims
}

// JWTManager handles JWT operations
type JWTManager struct {
	secret          string
	expiration      time.Duration
	twoFAExpiration time.Duration // Shorter expiration for 2FA pending tokens
}

// NewJWTManager creates a new JWT manager
func NewJWTManager(secret string, expirationMinutes int) *JWTManager {
	return &JWTManager{
		secret:          secret,
		expiration:      time.Duration(expirationMinutes) * time.Minute,
		twoFAExpiration: 5 * time.Minute, // 5 minutes to complete 2FA
	}
}

// GenerateToken generates a new JWT token
func (jm *JWTManager) GenerateToken(userID uuid.UUID, discordUserID string, isAdmin bool) (string, time.Time, error) {
	return jm.GenerateTokenWithOptions(userID, discordUserID, true, TokenTypeFull, false, isAdmin)
}

// GenerateDemoToken generates a JWT token for a demo account
func (jm *JWTManager) GenerateDemoToken(userID uuid.UUID, discordUserID string) (string, time.Time, error) {
	return jm.GenerateTokenWithOptions(userID, discordUserID, true, TokenTypeFull, true, false)
}

// GenerateTokenWithOptions generates a JWT token with additional options
func (jm *JWTManager) GenerateTokenWithOptions(userID uuid.UUID, discordUserID string, twoFactorVerified bool, tokenType TokenType, isDemo bool, isAdmin bool) (string, time.Time, error) {
	var expiration time.Duration
	if tokenType == TokenType2FA {
		expiration = jm.twoFAExpiration
	} else {
		expiration = jm.expiration
	}

	expiresAt := time.Now().Add(expiration)

	claims := &Claims{
		UserID:            userID,
		DiscordUserID:     discordUserID,
		TwoFactorVerified: twoFactorVerified,
		TokenType:         tokenType,
		IsDemo:            isDemo,
		IsAdmin:           isAdmin,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(jm.secret))
	if err != nil {
		return "", time.Time{}, fmt.Errorf("failed to sign token: %w", err)
	}

	return tokenString, expiresAt, nil
}

// Generate2FAToken generates a temporary token for 2FA verification
func (jm *JWTManager) Generate2FAToken(userID uuid.UUID, discordUserID string, isAdmin bool) (string, time.Time, error) {
	return jm.GenerateTokenWithOptions(userID, discordUserID, false, TokenType2FA, false, isAdmin)
}

// ValidateToken validates a JWT token and returns the claims
func (jm *JWTManager) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(jm.secret), nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to parse token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}

	return claims, nil
}

// Validate2FAToken validates a 2FA pending token
func (jm *JWTManager) Validate2FAToken(tokenString string) (*Claims, error) {
	claims, err := jm.ValidateToken(tokenString)
	if err != nil {
		return nil, err
	}

	if claims.TokenType != TokenType2FA {
		return nil, fmt.Errorf("invalid token type: expected 2fa token")
	}

	return claims, nil
}
