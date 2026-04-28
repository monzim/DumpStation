package auth

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

const turnstileSiteverifyURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

// TurnstileVerifyResponse represents Cloudflare Turnstile API response
type TurnstileVerifyResponse struct {
	Success     bool     `json:"success"`
	ChallengeTS string   `json:"challenge_ts,omitempty"`
	Hostname    string   `json:"hostname,omitempty"`
	ErrorCodes  []string `json:"error-codes,omitempty"`
	Action      string   `json:"action,omitempty"`
	CData       string   `json:"cdata,omitempty"`
}

// TurnstileVerifyRequest represents the request payload for Turnstile verification
type TurnstileVerifyRequest struct {
	Secret   string `json:"secret"`
	Response string `json:"response"`
	RemoteIP string `json:"remoteip,omitempty"`
}

// VerifyTurnstileToken verifies a Turnstile token with Cloudflare's API
// Returns nil if verification succeeds, error otherwise
func VerifyTurnstileToken(secretKey, token, remoteIP string, timeout int) error {
	if secretKey == "" {
		return fmt.Errorf("turnstile secret key not configured")
	}

	if token == "" {
		return fmt.Errorf("turnstile token is required")
	}

	// Prepare request payload
	reqPayload := TurnstileVerifyRequest{
		Secret:   secretKey,
		Response: token,
		RemoteIP: remoteIP,
	}

	jsonData, err := json.Marshal(reqPayload)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	// Create HTTP client with timeout
	client := &http.Client{
		Timeout: time.Duration(timeout) * time.Second,
	}

	// Make request to Cloudflare Turnstile API
	resp, err := client.Post(turnstileSiteverifyURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to verify turnstile token: %w", err)
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read verification response: %w", err)
	}

	// Parse response
	var verifyResp TurnstileVerifyResponse
	if err := json.Unmarshal(body, &verifyResp); err != nil {
		return fmt.Errorf("failed to parse verification response: %w", err)
	}

	// Check if verification was successful
	if !verifyResp.Success {
		if len(verifyResp.ErrorCodes) > 0 {
			return fmt.Errorf("turnstile verification failed: %v", verifyResp.ErrorCodes)
		}
		return fmt.Errorf("turnstile verification failed")
	}

	return nil
}

// trustedProxyHeaders is true when the operator has explicitly opted in to
// trusting X-Forwarded-For / X-Real-IP. Without this opt-in any client could
// spoof their source IP, defeating rate limiting and poisoning audit logs.
//
// Set TRUST_PROXY_HEADERS=true (or =1) in the environment when the service
// runs behind a load balancer that strips/sets these headers.
var trustedProxyHeaders = func() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("TRUST_PROXY_HEADERS")))
	return v == "1" || v == "true" || v == "yes"
}()

// GetIPAddress extracts the client's IP address from the HTTP request.
// When TRUST_PROXY_HEADERS is set, parses X-Forwarded-For (taking the first
// valid IP) or X-Real-IP. Otherwise uses only RemoteAddr. Returns an IP
// string with no port — never the raw, unparsed header value, so log
// injection via crafted headers is impossible.
func GetIPAddress(r *http.Request) string {
	if trustedProxyHeaders {
		if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
			for candidate := range strings.SplitSeq(forwarded, ",") {
				if ip := net.ParseIP(strings.TrimSpace(candidate)); ip != nil {
					return ip.String()
				}
			}
		}
		if realIP := r.Header.Get("X-Real-IP"); realIP != "" {
			if ip := net.ParseIP(strings.TrimSpace(realIP)); ip != nil {
				return ip.String()
			}
		}
	}

	// Fall back to RemoteAddr; strip the port if present.
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if ip := net.ParseIP(host); ip != nil {
		return ip.String()
	}
	return ""
}
