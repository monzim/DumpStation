package handlers

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/monzim/db_proxy/v1/internal/models"
)

// githubStateCookie is the name of the short-lived cookie that holds the
// random state value during the OAuth round trip. We HMAC the state with
// the JWT secret so we don't need server-side state storage and a stolen
// cookie cannot be replayed without also knowing the server secret.
const githubStateCookie = "ds_gh_oauth_state"

// githubStateTTL bounds how long an OAuth round trip can pause for. Five
// minutes covers the slowest human "approve this app" interaction without
// leaving the cookie viable indefinitely.
const githubStateTTL = 5 * time.Minute

// AuthConfigResponse advertises which login methods this deployment has
// enabled. The frontend uses this to render only the buttons that will
// actually work.
type AuthConfigResponse struct {
	DiscordEnabled bool `json:"discord_enabled"`
	GitHubEnabled  bool `json:"github_enabled"`
	DemoEnabled    bool `json:"demo_enabled"`
}

// AuthConfig returns which login methods are enabled in this deployment.
//
// @Summary  List enabled login methods
// @Tags     Authentication
// @Produce  json
// @Success  200 {object} AuthConfigResponse
// @Router   /auth/config [get]
func (h *Handler) AuthConfig(w http.ResponseWriter, _ *http.Request) {
	cfg := h.cfg
	writeJSON(w, http.StatusOK, AuthConfigResponse{
		DiscordEnabled: cfg != nil && cfg.Discord.WebhookURL != "",
		GitHubEnabled:  cfg != nil && cfg.GitHub.Enabled,
		// Demo is on whenever a demo user exists; we keep this simple: if
		// DemoLogin endpoint is mounted, return true. The frontend treats
		// this as a hint and gracefully handles a 500 from /auth/demo-login.
		DemoEnabled: true,
	})
}

// GitHubLogin starts the OAuth handshake by 302-ing the user to GitHub's
// authorize URL. We mint a random state, HMAC-bind it to the JWT secret,
// store it in a short-lived HTTP-only cookie, and include the same state
// value as a query parameter. The callback rejects any request whose state
// doesn't match.
//
// @Summary  Begin GitHub OAuth login
// @Tags     Authentication
// @Router   /auth/github/login [get]
func (h *Handler) GitHubLogin(w http.ResponseWriter, r *http.Request) {
	if h.cfg == nil || !h.cfg.GitHub.Enabled {
		writeError(w, http.StatusServiceUnavailable, "GitHub OAuth is not enabled on this deployment")
		return
	}

	state, err := newRandomState()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to mint state")
		return
	}
	signedState := signState(state, h.cfg.JWT.Secret)

	http.SetCookie(w, &http.Cookie{
		Name:     githubStateCookie,
		Value:    signedState,
		Path:     "/api/v1/auth/github",
		Expires:  time.Now().Add(githubStateTTL),
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteLaxMode,
	})

	q := url.Values{}
	q.Set("client_id", h.cfg.GitHub.ClientID)
	q.Set("redirect_uri", h.cfg.GitHub.RedirectURL)
	q.Set("scope", "read:user user:email")
	q.Set("state", state)
	q.Set("allow_signup", "false")

	http.Redirect(w, r, "https://github.com/login/oauth/authorize?"+q.Encode(), http.StatusFound)
}

// GitHubCallback finishes the OAuth handshake. It validates state, swaps
// code for an access token, fetches the GitHub user, refuses anyone whose
// login doesn't match cfg.GitHub.AllowedLogin, upserts the local user row,
// and 302s back to the frontend with a freshly minted JWT.
//
// On error the user lands on `<WebOrigin>/login?github_error=<reason>` so
// the frontend can surface a readable message.
//
// @Summary  GitHub OAuth callback
// @Tags     Authentication
// @Router   /auth/github/callback [get]
func (h *Handler) GitHubCallback(w http.ResponseWriter, r *http.Request) {
	if h.cfg == nil || !h.cfg.GitHub.Enabled {
		writeError(w, http.StatusServiceUnavailable, "GitHub OAuth is not enabled on this deployment")
		return
	}

	gotState := r.URL.Query().Get("state")
	if gotState == "" {
		h.redirectGitHubError(w, r, "missing_state")
		return
	}

	cookie, err := r.Cookie(githubStateCookie)
	if err != nil || cookie.Value == "" {
		h.redirectGitHubError(w, r, "missing_state_cookie")
		return
	}
	if !verifyState(gotState, cookie.Value, h.cfg.JWT.Secret) {
		h.redirectGitHubError(w, r, "state_mismatch")
		return
	}
	// Consume the cookie regardless of what happens next.
	http.SetCookie(w, &http.Cookie{
		Name:    githubStateCookie,
		Value:   "",
		Path:    "/api/v1/auth/github",
		Expires: time.Unix(0, 0),
	})

	code := r.URL.Query().Get("code")
	if code == "" {
		h.redirectGitHubError(w, r, "missing_code")
		return
	}

	ghUser, err := h.exchangeGitHubCode(r.Context(), code)
	if err != nil {
		log.Printf("github oauth: token exchange failed: %v", err)
		h.redirectGitHubError(w, r, "exchange_failed")
		return
	}

	if !strings.EqualFold(ghUser.Login, h.cfg.GitHub.AllowedLogin) {
		// Surface this as an audit-log error so an unexpected GitHub login
		// attempt is visible in the activity feed even though no user row
		// gets created.
		_ = h.repo.LogActivity(nil, models.ActionLogin, models.LogLevelError,
			"user", nil, ghUser.Login,
			fmt.Sprintf("Rejected GitHub login for %q (allow-list is %q)", ghUser.Login, h.cfg.GitHub.AllowedLogin),
			"", getIPAddress(r))
		h.redirectGitHubError(w, r, "not_allowed")
		return
	}

	// Upsert local user record. We look up by GitHub user id (numeric,
	// stable, never recycled) first; if not found, by GitHub login; if not
	// found, create. Email is best-effort because users may have hidden it.
	user, err := h.repo.UpsertGitHubUser(ghUser.ID, ghUser.Login, ghUser.Email, ghUser.AvatarURL)
	if err != nil {
		log.Printf("github oauth: upsert user failed: %v", err)
		h.redirectGitHubError(w, r, "upsert_failed")
		return
	}

	token, expiresAt, err := h.jwtMgr.GenerateToken(user.ID, user.DiscordUserID, user.IsAdmin)
	if err != nil {
		log.Printf("github oauth: jwt sign failed: %v", err)
		h.redirectGitHubError(w, r, "token_failed")
		return
	}

	_ = h.repo.LogActivity(&user.ID, models.ActionLogin, models.LogLevelSuccess,
		"user", &user.ID, user.GitHubLogin,
		fmt.Sprintf("User %q logged in via GitHub OAuth", user.GitHubLogin),
		"", getIPAddress(r))

	dest, err := url.Parse(strings.TrimRight(h.cfg.WebOrigin, "/") + "/auth/github/return")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "invalid WEB_ORIGIN")
		return
	}
	q := dest.Query()
	q.Set("token", token)
	q.Set("exp", expiresAt.UTC().Format(time.RFC3339))
	dest.RawQuery = q.Encode()

	http.Redirect(w, r, dest.String(), http.StatusFound)
}

// redirectGitHubError sends the user back to the login page with an error
// code in the query string so the frontend can render a friendly message.
func (h *Handler) redirectGitHubError(w http.ResponseWriter, r *http.Request, reason string) {
	if h.cfg == nil || h.cfg.WebOrigin == "" {
		writeError(w, http.StatusForbidden, reason)
		return
	}
	dest := strings.TrimRight(h.cfg.WebOrigin, "/") + "/login?github_error=" + url.QueryEscape(reason)
	http.Redirect(w, r, dest, http.StatusFound)
}

// gitHubUser is the subset of the GitHub /user response we care about.
type gitHubUser struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	Email     string `json:"email"`
	AvatarURL string `json:"avatar_url"`
}

// exchangeGitHubCode swaps the OAuth code for an access token and fetches
// the corresponding GitHub user. We hit the API directly instead of pulling
// in golang.org/x/oauth2 because the protocol is two HTTPS calls — adding
// a dependency for that would be overkill.
func (h *Handler) exchangeGitHubCode(ctx context.Context, code string) (*gitHubUser, error) {
	client := &http.Client{Timeout: 10 * time.Second}

	// 1) Exchange code → access token.
	tokenForm := url.Values{}
	tokenForm.Set("client_id", h.cfg.GitHub.ClientID)
	tokenForm.Set("client_secret", h.cfg.GitHub.ClientSecret)
	tokenForm.Set("code", code)
	tokenForm.Set("redirect_uri", h.cfg.GitHub.RedirectURL)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://github.com/login/oauth/access_token",
		strings.NewReader(tokenForm.Encode()))
	if err != nil {
		return nil, fmt.Errorf("build token request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token request: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token endpoint returned %d: %s", resp.StatusCode, string(body))
	}
	var tok struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
	}
	if err := json.Unmarshal(body, &tok); err != nil {
		return nil, fmt.Errorf("decode token: %w", err)
	}
	if tok.AccessToken == "" {
		return nil, fmt.Errorf("token endpoint returned no access_token (error=%q)", tok.Error)
	}

	// 2) Fetch GitHub user.
	userReq, err := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://api.github.com/user", nil)
	if err != nil {
		return nil, fmt.Errorf("build user request: %w", err)
	}
	userReq.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	userReq.Header.Set("Accept", "application/vnd.github+json")
	userReq.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	userResp, err := client.Do(userReq)
	if err != nil {
		return nil, fmt.Errorf("user request: %w", err)
	}
	defer userResp.Body.Close()

	if userResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(userResp.Body)
		return nil, fmt.Errorf("user endpoint returned %d: %s", userResp.StatusCode, string(body))
	}
	var u gitHubUser
	if err := json.NewDecoder(userResp.Body).Decode(&u); err != nil {
		return nil, fmt.Errorf("decode user: %w", err)
	}
	return &u, nil
}

// newRandomState returns a 32-byte hex-encoded random string for the OAuth
// state parameter.
func newRandomState() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// signState binds a state value to the server secret via HMAC-SHA256 so a
// stolen state cookie can't be replayed against a different deployment.
// The cookie value carries "state.hmac"; the URL parameter carries the
// state half only.
func signState(state, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(state))
	return state + "." + hex.EncodeToString(mac.Sum(nil))
}

func verifyState(rawState, cookieValue, secret string) bool {
	parts := strings.SplitN(cookieValue, ".", 2)
	if len(parts) != 2 {
		return false
	}
	if parts[0] != rawState {
		return false
	}
	expected := signState(rawState, secret)
	// Constant-time compare on the full "state.hmac" string is fine because
	// the state half is already known to match.
	return hmac.Equal([]byte(expected), []byte(cookieValue))
}
