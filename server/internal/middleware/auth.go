package middleware

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/monzim/db_proxy/v1/internal/auth"
	"github.com/monzim/db_proxy/v1/internal/models"
)

type contextKey string

const UserContextKey contextKey = "user"

// UserFlagsLookup returns a user's current role flags from the database.
type UserFlagsLookup func(userID uuid.UUID) (isAdmin, isDemo, exists bool)

// AuthMiddleware validates JWT tokens
func AuthMiddleware(jwtManager *auth.JWTManager) func(http.Handler) http.Handler {
	return AuthMiddlewareWithLookup(jwtManager, nil)
}

// AuthMiddlewareWithLookup validates JWTs and, when lookup is set, replaces
// the role claims with the user's current database values so demotions and
// deletions take effect immediately rather than when the token expires.
func AuthMiddlewareWithLookup(jwtManager *auth.JWTManager, lookup UserFlagsLookup) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				writeError(w, http.StatusUnauthorized, "missing authorization header")
				return
			}

			// Extract token from "Bearer <token>"
			parts := strings.Split(authHeader, " ")
			// log the parts for debugging
			if len(parts) != 2 || parts[0] != "Bearer" {
				log.Printf("[AUTH] ❌ Invalid authorization header format - %s %s", r.Method, r.URL.Path)
				writeError(w, http.StatusUnauthorized, "invalid authorization header format")
				return
			}

			token := parts[1]

			// Validate token
			claims, err := jwtManager.ValidateToken(token)
			if err != nil {
				log.Printf("[AUTH] ❌ Invalid or expired token - %s %s - Error: %v", r.Method, r.URL.Path, err)
				writeError(w, http.StatusUnauthorized, "invalid or expired token")
				return
			}

			// A pending-2FA token only authorizes /auth/2fa/verify (which reads
			// it from X-2FA-Token, not this middleware). Reject it everywhere
			// else so a password/OTP step alone never grants API access.
			if claims.TokenType == auth.TokenType2FA {
				writeError(w, http.StatusUnauthorized, "two-factor verification required")
				return
			}
			if lookup != nil {
				isAdmin, isDemo, exists := lookup(claims.UserID)
				if !exists {
					writeError(w, http.StatusUnauthorized, "user no longer exists")
					return
				}
				c := *claims
				c.IsAdmin, c.IsDemo = isAdmin, isDemo
				claims = &c
			}

			// Add claims to request context
			ctx := context.WithValue(r.Context(), UserContextKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// responseWriter wraps http.ResponseWriter to capture status code
type responseWriter struct {
	http.ResponseWriter
	statusCode int
	written    int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

func (rw *responseWriter) Write(b []byte) (int, error) {
	if rw.statusCode == 0 {
		rw.statusCode = http.StatusOK
	}
	n, err := rw.ResponseWriter.Write(b)
	rw.written += n
	return n, err
}

// Logger middleware
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Wrap response writer to capture status
		wrapped := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}

		// Log incoming request
		log.Printf("[REQUEST] ➡️  %s %s from %s", r.Method, r.URL.Path, r.RemoteAddr)

		// Process request
		next.ServeHTTP(wrapped, r)

		// Calculate duration
		duration := time.Since(start)

		// Log response with status indicator
		statusEmoji := "✅"
		if wrapped.statusCode >= 400 && wrapped.statusCode < 500 {
			statusEmoji = "⚠️ "
		} else if wrapped.statusCode >= 500 {
			statusEmoji = "❌"
		}

		log.Printf("[RESPONSE] ⬅️  %s %s %d %s - %v - %d bytes",
			statusEmoji,
			r.Method,
			wrapped.statusCode,
			r.URL.Path,
			duration,
			wrapped.written,
		)
	})
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(models.APIError{
		Code:    http.StatusText(status),
		Message: message,
	})
}
