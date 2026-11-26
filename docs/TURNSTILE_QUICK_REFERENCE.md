# Cloudflare Turnstile - Quick Reference

## Environment Variables

### Server (the only place to configure it)

```bash
TURNSTILE_ENABLED=true
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
TURNSTILE_TIMEOUT=5   # seconds, default 5
```

The UI receives the site key at runtime from `/config.js`; there is no
frontend variable.

## Test Keys

| Purpose         | Site Key                   | Secret Key                            |
| --------------- | -------------------------- | ------------------------------------- |
| Always Passes   | `1x00000000000000000000AA` | `1x0000000000000000000000000000000AA` |
| Always Fails    | `2x00000000000000000000AB` | `2x0000000000000000000000000000000AB` |
| Force Challenge | `3x00000000000000000000FF` | `3x0000000000000000000000000000000FF` |

## Quick Commands

### Development Setup

```bash
# Server (see server/QUICKSTART.md)
cd server
set -a && . ./.env && set +a   # with the TURNSTILE_* values above
go run ./cmd/server

# UI with hot reload (proxies /api and /config.js to the server)
cd web
pnpm install
pnpm dev
```

### Disable Turnstile

```bash
TURNSTILE_ENABLED=false
```

### Get Production Keys

Visit: https://dash.cloudflare.com/?to=/:account/turnstile

## Key Features

✅ Bot protection on login  
✅ Demo login bypass  
✅ Feature flag support  
✅ Configurable timeout  
✅ Auto theme matching  
✅ Generic error messages

## Troubleshooting

| Issue              | Solution                               |
| ------------------ | -------------------------------------- |
| Widget not showing | Check `TURNSTILE_ENABLED=true` and that `/config.js` contains the site key |
| Always fails       | Verify secret key matches site key     |
| Token expired      | Widget auto-resets, user can retry     |

## Documentation

Full guide: `docs/TURNSTILE_INTEGRATION.md`

## Resources

- [Cloudflare Turnstile Docs](https://developers.cloudflare.com/turnstile/)
- [Test Keys Reference](https://developers.cloudflare.com/turnstile/reference/testing/)
- [React Turnstile](https://github.com/marsidev/react-turnstile)
