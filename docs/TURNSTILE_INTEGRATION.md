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
| `TURNSTILE_TIMEOUT`    | API verification timeout in seconds   | `10`    | No               |

### Frontend Configuration

Add the Turnstile site key to your frontend `.env` file:

```bash
# Cloudflare Turnstile Site Key
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

**Note:** The frontend automatically detects if Turnstile is enabled based on whether `VITE_TURNSTILE_SITE_KEY` is set.

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
5. Update environment variables in both backend and frontend

## Implementation Details

### Backend Flow

1. **Configuration Loading** - Load Turnstile settings from environment variables in `config.go`
2. **Handler Initialization** - Pass Turnstile config to the handler
3. **Login Verification** - Before generating OTP:
   - Check if `TURNSTILE_ENABLED=true`
   - Verify `turnstile_token` from request using Cloudflare API
   - Extract client IP from `X-Forwarded-For`, `X-Real-IP`, or `RemoteAddr`
   - Call `https://challenges.cloudflare.com/turnstile/v0/siteverify`
   - Return error if verification fails
4. **Demo Bypass** - Demo login handler does not require Turnstile verification

**Key Files:**

- [`server/internal/config/config.go`](../server/internal/config/config.go) - Configuration structure
- [`server/internal/auth/turnstile.go`](../server/internal/auth/turnstile.go) - Verification logic
- [`server/internal/handlers/handlers.go`](../server/internal/handlers/handlers.go) - Login handler with verification

### Frontend Flow

1. **Environment Detection** - Check if `VITE_TURNSTILE_SITE_KEY` is set
2. **Widget Rendering** - Display Turnstile widget on login page
3. **Token Capture** - Capture token on successful verification
4. **Login Submission** - Include `turnstile_token` in login request
5. **Error Handling** - Reset token on verification failure or expiration

**Key Files:**

- [`web/src/routes/login.tsx`](../web/src/routes/login.tsx) - Login page with Turnstile widget
- [`web/src/lib/types/api.ts`](../web/src/lib/types/api.ts) - TypeScript type definitions

## Security Considerations

### Error Messages

The implementation uses generic error messages to avoid leaking information:

- ❌ Don't show: "Turnstile verification failed with error: timeout-or-duplicate"
- ✅ Do show: "Security verification failed"

This prevents attackers from understanding the verification process.

### Verification Timeout

The default timeout is **10 seconds** to prevent long waits during login attempts. This can be adjusted via `TURNSTILE_TIMEOUT` environment variable.

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

1. Check that `VITE_TURNSTILE_SITE_KEY` is set in frontend `.env`
2. Verify the site key is correct
3. Check browser console for JavaScript errors
4. Ensure `@marsidev/react-turnstile` package is installed

### Verification Always Fails

**Problem:** Login fails with "security verification failed"

**Solutions:**

1. Verify `TURNSTILE_SECRET_KEY` matches the site key
2. Check that keys are not expired (production keys)
3. Ensure backend can reach `https://challenges.cloudflare.com`
4. Check logs for specific error codes from Cloudflare API
5. Verify timeout setting is reasonable (default: 10s)

### Token Expired

**Problem:** "Security verification expired" error

**Solutions:**

1. Users should complete login within a few minutes
2. Token automatically resets on error - user can try again
3. Widget will automatically request new token

### CORS Issues

**Problem:** Turnstile API calls blocked by CORS

**Solutions:**

1. Turnstile widget handles CORS automatically
2. Ensure frontend is served from allowed origin
3. Check CORS configuration in backend

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

1. **Update Backend:**

   ```bash
   # Pull latest code
   git pull origin main

   # Add Turnstile config to .env
   echo "TURNSTILE_ENABLED=true" >> .env
   echo "TURNSTILE_SITE_KEY=1x00000000000000000000AA" >> .env
   echo "TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA" >> .env

   # Rebuild and restart
   docker-compose down
   docker-compose up -d --build
   ```

2. **Update Frontend:**

   ```bash
   # Add Turnstile site key to .env
   echo "VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA" >> .env

   # Rebuild
   npm run build
   npm run deploy
   ```

3. **Test Integration:**
   - Verify widget appears on login page
   - Test login flow end-to-end
   - Check backend logs for verification success

### Rollback Plan

To disable Turnstile:

1. Set `TURNSTILE_ENABLED=false` in backend `.env`
2. Remove `VITE_TURNSTILE_SITE_KEY` from frontend `.env`
3. Restart services

**Note:** No code changes needed - feature flag controls everything.

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
