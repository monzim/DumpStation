package middleware

import "net/http"

// SecurityHeaders sets a baseline of HTTP response headers that protect
// against common web vulnerabilities (clickjacking, MIME sniffing, mixed
// content, referrer leakage). Applied globally so every response — including
// errors and Swagger — inherits the policy.
//
// Notes:
//   - HSTS is only meaningful over HTTPS; the header is harmless over HTTP
//     during local development and required in production.
//   - CSP is intentionally NOT set here because it depends on whether the
//     same origin serves a UI bundle. The web frontend (Cloudflare Worker)
//     sets CSP for its own asset responses.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		h.Set("Cross-Origin-Resource-Policy", "same-site")
		next.ServeHTTP(w, r)
	})
}
