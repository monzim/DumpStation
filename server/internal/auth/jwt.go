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

// Claims represents JWT claims. SessionStartedAt is the unix-seconds
// timestamp of the *original* login and is preserved across refreshes so the
// absolute session cap (see SessionAbsoluteMax) can be enforced.
type Claims struct {
	UserID            uuid.UUID `json:"user_id"`
	DiscordUserID     string    `json:"discord_user_id,omitempty"`
	TwoFactorVerified bool      `json:"two_factor_verified,omitempty"` // True if 2FA was verified for this session
	TokenType         TokenType `json:"token_type,omitempty"`          // Type of token (full or 2fa)
	IsDemo            bool      `json:"is_demo,omitempty"`             // True if this is a demo account
	IsAdmin           bool      `json:"is_admin,omitempty"`            // True if user has admin privileges
	SessionStartedAt  int64     `json:"sst,omitempty"`                 // Unix seconds; carried across refreshes to enforce absolute cap
	jwt.RegisteredClaims
}

// SessionAbsoluteMax is the maximum total wall-clock time a single login can
// be extended for via refresh. Hard cap regardless of how often the user is
// active. Keeps long-running stolen sessions bounded.
const SessionAbsoluteMax = 12 * time.Hour

// ErrSessionExpired is returned by RefreshToken when the absolute session
// cap has been hit. The caller should force a fresh login.
var ErrSessionExpired = fmt.Errorf("session has exceeded absolute lifetime; please log in again")

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

// Expiration exposes the configured per-token TTL so callers (e.g. the
// refresh handler) can report it back to the frontend.
func (jm *JWTManager) Expiration() time.Duration { return jm.expiration }

// GenerateToken generates a new JWT token with a fresh session start.
func (jm *JWTManager) GenerateToken(userID uuid.UUID, discordUserID string, isAdmin bool) (string, time.Time, error) {
	return jm.generateToken(userID, discordUserID, true, TokenTypeFull, false, isAdmin, 0)
}

// GenerateDemoToken generates a JWT token for a demo account.
func (jm *JWTManager) GenerateDemoToken(userID uuid.UUID, discordUserID string) (string, time.Time, error) {
	return jm.generateToken(userID, discordUserID, true, TokenTypeFull, true, false, 0)
}

// GenerateTokenWithOptions generates a JWT token with additional options.
// Kept for callers that need fine-grained control; new code should prefer
// GenerateToken / RefreshToken.
func (jm *JWTManager) GenerateTokenWithOptions(userID uuid.UUID, discordUserID string, twoFactorVerified bool, tokenType TokenType, isDemo bool, isAdmin bool) (string, time.Time, error) {
	return jm.generateToken(userID, discordUserID, twoFactorVerified, tokenType, isDemo, isAdmin, 0)
}

// generateToken builds and signs a JWT. sessionStartedAt = 0 means "this is
// a fresh login" and is filled with the current time; non-zero means "this
// is a refresh" and the original session timestamp is preserved.
func (jm *JWTManager) generateToken(
	userID uuid.UUID,
	discordUserID string,
	twoFactorVerified bool,
	tokenType TokenType,
	isDemo bool,
	isAdmin bool,
	sessionStartedAt int64,
) (string, time.Time, error) {
	var expiration time.Duration
	if tokenType == TokenType2FA {
		expiration = jm.twoFAExpiration
	} else {
		expiration = jm.expiration
	}

	now := time.Now()
	expiresAt := now.Add(expiration)
	if sessionStartedAt == 0 {
		sessionStartedAt = now.Unix()
	}

	claims := &Claims{
		UserID:            userID,
		DiscordUserID:     discordUserID,
		TwoFactorVerified: twoFactorVerified,
		TokenType:         tokenType,
		IsDemo:            isDemo,
		IsAdmin:           isAdmin,
		SessionStartedAt:  sessionStartedAt,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(now),
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
	return jm.generateToken(userID, discordUserID, false, TokenType2FA, false, isAdmin, 0)
}

// RefreshToken issues a new full-access JWT that preserves the original
// SessionStartedAt and identity claims. It refuses to refresh:
//   - a 2FA-pending token (TokenType2FA) — that token must be exchanged via
//     /auth/2fa/verify, not refreshed,
//   - a session that has exceeded SessionAbsoluteMax — the user must log in
//     again from scratch.
//
// SessionExpiresAt is returned so the frontend can show "session ends at X".
func (jm *JWTManager) RefreshToken(claims *Claims) (token string, expiresAt time.Time, sessionExpiresAt time.Time, err error) {
	if claims == nil {
		return "", time.Time{}, time.Time{}, fmt.Errorf("nil claims")
	}
	if claims.TokenType == TokenType2FA {
		return "", time.Time{}, time.Time{}, fmt.Errorf("2FA-pending tokens cannot be refreshed")
	}

	sessionStart := claims.SessionStartedAt
	if sessionStart == 0 {
		// Old tokens issued before the SessionStartedAt claim existed treat
		// "now" as the session start so users aren't kicked out at upgrade.
		sessionStart = time.Now().Unix()
	}
	sessionEnds := time.Unix(sessionStart, 0).Add(SessionAbsoluteMax)
	if time.Now().After(sessionEnds) {
		return "", time.Time{}, time.Time{}, ErrSessionExpired
	}

	tokenString, exp, err := jm.generateToken(
		claims.UserID,
		claims.DiscordUserID,
		claims.TwoFactorVerified,
		TokenTypeFull,
		claims.IsDemo,
		claims.IsAdmin,
		sessionStart,
	)
	if err != nil {
		return "", time.Time{}, time.Time{}, err
	}
	return tokenString, exp, sessionEnds, nil
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
