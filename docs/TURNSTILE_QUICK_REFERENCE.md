# Cloudflare Turnstile - Quick Reference

## Environment Variables

### Backend (Required)

```bash
TURNSTILE_ENABLED=true
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
TURNSTILE_TIMEOUT=10
```

### Frontend (Required)

```bash
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

## Test Keys

| Purpose         | Site Key                   | Secret Key                            |
| --------------- | -------------------------- | ------------------------------------- |
| Always Passes   | `1x00000000000000000000AA` | `1x0000000000000000000000000000000AA` |
| Always Fails    | `2x00000000000000000000AB` | `2x0000000000000000000000000000000AB` |
| Force Challenge | `3x00000000000000000000FF` | `3x0000000000000000000000000000000FF` |

## Quick Commands

### Development Setup

```bash
# Backend
cd server
cp .env.example .env
docker-compose up -d

# Frontend
cd web
cp .env.example .env
npm install
npm run dev
```

### Disable Turnstile

```bash
# Backend
TURNSTILE_ENABLED=false

# Frontend
# Remove VITE_TURNSTILE_SITE_KEY from .env
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
| Widget not showing | Check `VITE_TURNSTILE_SITE_KEY` is set |
| Always fails       | Verify secret key matches site key     |
| Token expired      | Widget auto-resets, user can retry     |

## Documentation

📖 Full Guide: `docs/TURNSTILE_INTEGRATION.md`  
📋 Summary: `docs/IMPLEMENTATION_SUMMARY.md`

## Resources

- [Cloudflare Turnstile Docs](https://developers.cloudflare.com/turnstile/)
- [Test Keys Reference](https://developers.cloudflare.com/turnstile/reference/testing/)
- [React Turnstile](https://github.com/marsidev/react-turnstile)
