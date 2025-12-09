package auth

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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

// GetIPAddress extracts the client's IP address from the HTTP request
// Checks X-Forwarded-For and X-Real-IP headers first, falls back to RemoteAddr
func GetIPAddress(r *http.Request) string {
	// Check X-Forwarded-For header (common with proxies/load balancers)
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		// X-Forwarded-For can contain multiple IPs, take the first one
		return forwarded
	}

	// Check X-Real-IP header
	if realIP := r.Header.Get("X-Real-IP"); realIP != "" {
		return realIP
	}

	// Fall back to RemoteAddr
	return r.RemoteAddr
}
