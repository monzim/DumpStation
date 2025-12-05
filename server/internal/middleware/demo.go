package middleware

import (
	"net/http"

	"github.com/monzim/db_proxy/v1/internal/auth"
)

// DemoRestrictionMiddleware blocks write operations for demo accounts
// This middleware should be applied to routes that modify data
func DemoRestrictionMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Only check for write operations (POST, PUT, DELETE, PATCH)
		if r.Method == "GET" || r.Method == "OPTIONS" || r.Method == "HEAD" {
			next.ServeHTTP(w, r)
			return
		}

		// Get claims from context
		claims := r.Context().Value(UserContextKey)
		if claims == nil {
			// No claims in context, let auth middleware handle it
			next.ServeHTTP(w, r)
			return
		}

		authClaims, ok := claims.(*auth.Claims)
		if !ok {
			next.ServeHTTP(w, r)
			return
		}

		// Check if this is a demo account
		if authClaims.IsDemo {
			writeError(w, http.StatusForbidden, "demo accounts cannot perform write operations")
			return
		}

		next.ServeHTTP(w, r)
	})
}

// DemoBlockMiddleware completely blocks access for demo accounts
// Use this for sensitive endpoints like 2FA setup, password changes, etc.
func DemoBlockMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Allow OPTIONS for CORS preflight
		if r.Method == "OPTIONS" {
			next.ServeHTTP(w, r)
			return
		}

		// Get claims from context
		claims := r.Context().Value(UserContextKey)
		if claims == nil {
			next.ServeHTTP(w, r)
			return
		}

		authClaims, ok := claims.(*auth.Claims)
		if !ok {
			next.ServeHTTP(w, r)
			return
		}

		// Block demo accounts from accessing this endpoint
		if authClaims.IsDemo {
			writeError(w, http.StatusForbidden, "this feature is not available for demo accounts")
			return
		}

		next.ServeHTTP(w, r)
	})
}

// IsDemoAccount checks if the current request is from a demo account
func IsDemoAccount(r *http.Request) bool {
	claims := r.Context().Value(UserContextKey)
	if claims == nil {
		return false
	}

	authClaims, ok := claims.(*auth.Claims)
	if !ok {
		return false
	}

	return authClaims.IsDemo
}
