# Cloudflare Turnstile Integration

This document describes the Cloudflare Turnstile integration for bot protection on the login page.

## Overview

Cloudflare Turnstile is a user-friendly CAPTCHA alternative that helps protect the login endpoint from bot attacks and automated abuse. The integration verifies users on the frontend before allowing OTP generation on the backend.

## Features

- ✅ **Bot Protection** - Prevents automated login attempts and brute force attacks
- ✅ **Seamless UX** - User-friendly challenge with minimal friction
- ✅ **Configurable** - Feature flag to enable/disable in different environments
- ✅ **Demo Bypass** - Demo login automatically bypasses Turnstile verification
- ✅ **Error Handling** - Graceful handling of verification failures and timeouts
- ✅ **Test Mode** - Cloudflare provides test keys for development

## Configuration

### Backend Configuration

Add the following environment variables to your `.env` file or deployment configuration:

```bash
# Cloudflare Turnstile Configuration
TURNSTILE_ENABLED=true
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
TURNSTILE_TIMEOUT=10
```

**Environment Variables:**

| Variable               | Description                           | Default | Required         |
| ---------------------- | ------------------------------------- | ------- | ---------------- |
| `TURNSTILE_ENABLED`    | Enable/disable Turnstile verification | `false` | No               |
| `TURNSTILE_SITE_KEY`   | Public site key for frontend          | -       | Yes (if enabled) |
| `TURNSTILE_SECRET_KEY` | Secret key for backend verification   | -       | Yes (if enabled) |
| `TURNSTILE_TIMEOUT`    | API verification timeout in seconds   | `5`     | No               |

### Frontend Configuration

None. Since v2 the web UI is served by the DumpStation server, which publishes
`TURNSTILE_SITE_KEY` to the browser through `/config.js`
(`window.APP_CONFIG.TURNSTILE_SITE_KEY`) when `TURNSTILE_ENABLED=true`. The
login page renders the widget only when that key is present. The old
`VITE_TURNSTILE_SITE_KEY` variable is no longer used.

With `configs/compose.yml`, `TURNSTILE_ENABLED`, `TURNSTILE_SITE_KEY` and
`TURNSTILE_SECRET_KEY` are passed through; add `TURNSTILE_TIMEOUT` to the
`dumpstation` service's `environment:` block if you want to change it.

## Cloudflare Turnstile Keys

### Test Keys (Development)

Cloudflare provides test keys that always pass or fail for testing purposes:

| Key Type             | Site Key                   | Secret Key                            | Behavior                           |
| -------------------- | -------------------------- | ------------------------------------- | ---------------------------------- |
| **Always Passes**    | `1x00000000000000000000AA` | `1x0000000000000000000000000000000AA` | Always returns success             |
| **Always Fails**     | `2x00000000000000000000AB` | `2x0000000000000000000000000000000AB` | Always returns failure             |
| **Forces Challenge** | `3x00000000000000000000FF` | `3x0000000000000000000000000000000FF` | Always shows interactive challenge |

**References:**

- [Cloudflare Turnstile Testing Documentation](https://developers.cloudflare.com/turnstile/reference/testing/)

### Production Keys

To get production keys:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/?to=/:account/turnstile)
2. Create a new Turnstile site
3. Configure your domain
4. Copy the **Site Key** (public) and **Secret Key** (private)
5. Set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` on the server and restart it

## Implementation Details

### Backend Flow

1. **Configuration Loading** - Load Turnstile settings from environment variables in `config.go`
2. **Handler Initialization** - Pass Turnstile config to the handler
3. **Login Verification** - Before generating OTP:
   - Check if `TURNSTILE_ENABLED=true`
   - Verify `turnstile_token` from request using Cloudflare API
   - Use the client IP from `RemoteAddr`, or from `X-Forwarded-For` / `X-Real-IP` when `TRUST_PROXY_HEADERS=true`
   - Call `https://challenges.cloudflare.com/turnstile/v0/siteverify`
   - Return error if verification fails
4. **Demo Bypass** - Demo login handler does not require Turnstile verification

**Key Files:**

- [`server/internal/config/config.go`](../server/internal/config/config.go) - Configuration structure
- [`server/internal/auth/turnstile.go`](../server/internal/auth/turnstile.go) - Verification logic
- [`server/internal/handlers/handlers.go`](../server/internal/handlers/handlers.go) - Login handler with verification

### Frontend Flow

1. **Runtime config** - Read `window.APP_CONFIG.TURNSTILE_SITE_KEY` from `/config.js`
2. **Widget Rendering** - Display Turnstile widget on login page
3. **Token Capture** - Capture token on successful verification
4. **Login Submission** - Include `turnstile_token` in login request
5. **Error Handling** - Reset token on verification failure or expiration

**Key Files:**

- [`web/src/routes/login.tsx`](../web/src/routes/login.tsx) - Login page with Turnstile widget
- [`server/internal/handlers/web.go`](../server/internal/handlers/web.go) - `/config.js` and the CSP that allows `challenges.cloudflare.com`

## Security Considerations

### Error Messages

The implementation uses generic error messages to avoid leaking information:

- ❌ Don't show: "Turnstile verification failed with error: timeout-or-duplicate"
- ✅ Do show: "Security verification failed"

This prevents attackers from understanding the verification process.

### Verification Timeout

The default timeout is **5 seconds** to prevent long waits during login attempts. This can be adjusted via `TURNSTILE_TIMEOUT` environment variable.

### Feature Flag Behavior

When `TURNSTILE_ENABLED=false`:

- **Backend:** Skips verification entirely (no token required)
- **Frontend:** Widget is not rendered

This allows for easy development and testing without Turnstile.

### Demo Mode Compatibility

The demo login endpoint (`/auth/demo-login`) is a separate handler and automatically bypasses Turnstile verification to ensure smooth demonstration access.

## Testing

### Manual Testing

1. **Test with "Always Passes" key:**

   ```bash
   TURNSTILE_SITE_KEY=1x00000000000000000000AA
   TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
   ```

   - Login should succeed immediately

2. **Test with "Always Fails" key:**

   ```bash
   TURNSTILE_SITE_KEY=2x00000000000000000000AB
   TURNSTILE_SECRET_KEY=2x0000000000000000000000000000000AB
   ```

   - Login should fail with "security verification failed" error

3. **Test with "Forces Challenge" key:**
   ```bash
   TURNSTILE_SITE_KEY=3x00000000000000000000FF
   TURNSTILE_SECRET_KEY=3x0000000000000000000000000000000FF
   ```
   - Should display interactive challenge before allowing login

### Automated Testing

For CI/CD pipelines, disable Turnstile:

```bash
TURNSTILE_ENABLED=false
```

Or use the "Always Passes" test keys.

## Troubleshooting

### Widget Not Showing

**Problem:** Turnstile widget doesn't appear on login page

**Solutions:**

1. Check that `TURNSTILE_ENABLED=true` and `TURNSTILE_SITE_KEY` are set on the server, then open `/config.js` and confirm the key appears
2. Verify the site key is correct and allowed for your hostname
3. Check browser console for JavaScript errors
4. Ensure `@marsidev/react-turnstile` package is installed

### Verification Always Fails

**Problem:** Login fails with "security verification failed"

**Solutions:**

1. Verify `TURNSTILE_SECRET_KEY` matches the site key
2. Check that keys are not expired (production keys)
3. Ensure backend can reach `https://challenges.cloudflare.com`
4. Check logs for specific error codes from Cloudflare API
5. Verify timeout setting is reasonable (default: 5s)

### Token Expired

**Problem:** "Security verification expired" error

**Solutions:**

1. Users should complete login within a few minutes
2. Token automatically resets on error - user can try again
3. Widget will automatically request new token

### Widget blocked by the browser

**Problem:** The widget iframe or script is blocked (console shows a CSP error)

**Solutions:**

1. The server's CSP allows `https://challenges.cloudflare.com` for scripts and frames; if a reverse proxy adds its own `Content-Security-Policy`, allow the same origin there
2. Browser extensions that block third-party scripts can also hide the widget

## API Reference

### Backend Verification Function

```go
func VerifyTurnstileToken(secretKey, token, remoteIP string, timeout int) error
```

**Parameters:**

- `secretKey` - Cloudflare Turnstile secret key
- `token` - Token received from frontend widget
- `remoteIP` - Client's IP address (optional but recommended)
- `timeout` - Verification timeout in seconds

**Returns:**

- `nil` on success
- `error` on verification failure

### Cloudflare Siteverify API

**Endpoint:** `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`

**Request:**

```json
{
  "secret": "your-secret-key",
  "response": "token-from-frontend",
  "remoteip": "client-ip-address"
}
```

**Response:**

```json
{
  "success": true,
  "challenge_ts": "2025-12-09T15:00:00Z",
  "hostname": "example.com",
  "error-codes": [],
  "action": "login",
  "cdata": ""
}
```

## Migration Guide

### Existing Deployments

To add Turnstile to an existing deployment:

1. Set on the server (in `.env` with `configs/compose.yml`):

   ```bash
   TURNSTILE_ENABLED=true
   TURNSTILE_SITE_KEY=<site key>
   TURNSTILE_SECRET_KEY=<secret key>
   ```

2. Recreate the container: `docker compose up -d`.
3. Test: the widget appears on the login page, a code request succeeds, and
   the server log shows a successful verification.

### Rollback Plan

Set `TURNSTILE_ENABLED=false` and recreate the container. The UI stops
rendering the widget because `/config.js` no longer carries a site key.

## References

- [Cloudflare Turnstile Documentation](https://developers.cloudflare.com/turnstile/)
- [Turnstile Testing Keys](https://developers.cloudflare.com/turnstile/reference/testing/)
- [React Turnstile Library](https://github.com/marsidev/react-turnstile)
- [Cloudflare Dashboard](https://dash.cloudflare.com/)

## Support

For issues related to Cloudflare Turnstile integration:

1. Check this documentation first
2. Review Cloudflare Turnstile documentation
3. Check application logs for error details
4. Create an issue in the project repository
