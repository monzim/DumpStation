package middleware

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/monzim/db_proxy/v1/internal/auth"
	"github.com/monzim/db_proxy/v1/internal/models"
)

type contextKey string

const UserContextKey contextKey = "user"

// AuthMiddleware validates JWT tokens
func AuthMiddleware(jwtManager *auth.JWTManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				log.Printf("[AUTH] ❌ Missing authorization header - %s %s", r.Method, r.URL.Path)
				writeError(w, http.StatusUnauthorized, "missing authorization header")
				return
			}

			// Extract token from "Bearer <token>"
			parts := strings.Split(authHeader, " ")
			// log the parts for debugging
			log.Printf("Auth Header Parts: %v", parts)
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

			log.Printf("[AUTH] ✅ Token validated - User: %s - %s %s", claims.UserID, r.Method, r.URL.Path)

			// Add claims to request context
			ctx := context.WithValue(r.Context(), UserContextKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// CORS middleware
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
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
