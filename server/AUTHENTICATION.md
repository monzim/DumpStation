# Authentication Guide

This service uses a simplified, single-user authentication system designed for personal use with Discord webhook integration.

## Overview

The authentication flow uses **One-Time Passwords (OTP)** delivered via a Discord webhook, combined with **JWT tokens** for API access.

### Key Features

- **Single-user design**: Optimized for personal use (default user: "admin")
- **Discord webhook**: Single webhook for both OTP delivery and system notifications
- **No Discord bot required**: Uses simple webhook POST requests
- **JWT tokens**: Secure, time-limited API access (default: 24 hours)

## How It Works

### 1. Request an OTP

Make a POST request to `/api/v1/auth/login`:

```bash
curl -X POST http://localhost:8080/api/v1/auth/login
```

**What happens:**
1. System generates a 6-digit OTP code
2. OTP is sent to your configured Discord webhook
3. OTP is stored in database with 5-minute expiration (configurable)
4. You receive a success response

**Discord Message:**
```
🔐 Login OTP Code: 123456
⏰ This code expires in 5 minutes.

Requested at: [timestamp]
```

**Optional:** You can specify a username (though not needed for single-user):
```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin"}'
```

### 2. Verify OTP and Get JWT

Check your Discord channel for the OTP, then verify it:

```bash
curl -X POST http://localhost:8080/api/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"otp": "123456"}'
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": "2025-11-17T22:00:00Z"
}
```

### 3. Use JWT for API Requests

Include the JWT token in the `Authorization` header for all protected endpoints:

```bash
curl -X GET http://localhost:8080/api/v1/databases \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Configuration

Set these environment variables in your `.env` file:

```bash
# Discord webhook URL (required for OTP delivery)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your_webhook_url

# OTP expiration in minutes (default: 5)
OTP_EXPIRATION_MINUTES=5

# JWT secret (required - use a strong random string)
JWT_SECRET=your_super_secret_jwt_key_here

# JWT expiration in hours (default: 24)
JWT_EXPIRATION_HOURS=24
```

## Security Considerations

### OTP Security

1. **Short expiration**: OTPs expire after 5 minutes by default
2. **Single use**: Each OTP can only be used once
3. **Secure generation**: Uses crypto/rand for random number generation
4. **Database storage**: OTPs are stored with expiration timestamps

### JWT Security

1. **Strong secret**: Use a long, random JWT_SECRET (generate with `openssl rand -base64 32`)
2. **Time-limited**: Tokens expire after 24 hours by default
3. **HMAC signing**: Uses HS256 algorithm
4. **Stateless**: No server-side session storage needed

### Discord Webhook Security

1. **Keep webhook URL private**: Anyone with the URL can send messages
2. **Use webhook permissions**: Limit Discord channel access
3. **Monitor activity**: Check Discord for unauthorized OTP requests

## Troubleshooting

### OTP not received in Discord

- Verify `DISCORD_WEBHOOK_URL` is correct
- Check Discord webhook permissions
- Test webhook manually:
  ```bash
  curl -X POST YOUR_WEBHOOK_URL \
    -H "Content-Type: application/json" \
    -d '{"content": "Test message"}'
  ```

### "Invalid or expired OTP"

- OTP expires after 5 minutes - request a new one
- OTP can only be used once - request a new one if already used
- Ensure you're using the most recent OTP

### "Invalid or expired token"

- JWT tokens expire after 24 hours (configurable)
- Request a new OTP and verify to get a fresh token
- Check `JWT_SECRET` hasn't changed (would invalidate all tokens)

### "Missing authorization header"

- Include the JWT in the Authorization header:
  ```
  Authorization: Bearer YOUR_JWT_TOKEN
  ```
- Ensure "Bearer " prefix is included
- Check token isn't corrupted (no extra spaces/newlines)

## Advanced Usage

### Custom Username

While designed for single-user, you can specify different usernames:

```bash
# Login with custom username
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "myname"}'

# Verify OTP for that username
curl -X POST http://localhost:8080/api/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"username": "myname", "otp": "123456"}'
```

### Automation

For automated scripts, you can:

1. Store JWT token in environment variable
2. Renew before expiration
3. Use Discord API to fetch OTP programmatically (requires bot)

Example script:
```bash
#!/bin/bash

# Request OTP
curl -X POST http://localhost:8080/api/v1/auth/login

# Wait for user to check Discord and enter OTP
read -p "Enter OTP from Discord: " OTP

# Get JWT token
RESPONSE=$(curl -s -X POST http://localhost:8080/api/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d "{\"otp\": \"$OTP\"}")

TOKEN=$(echo $RESPONSE | jq -r '.token')

# Use token
curl -X GET http://localhost:8080/api/v1/databases \
  -H "Authorization: Bearer $TOKEN"
```

## API Endpoints

### Public Endpoints (No Auth Required)

- `POST /api/v1/auth/login` - Request OTP
- `POST /api/v1/auth/verify` - Verify OTP and get JWT

### Protected Endpoints (JWT Required)

All other endpoints require a valid JWT token in the Authorization header:

- `/api/v1/storage/*` - Storage configurations
- `/api/v1/notifications/*` - Notification configurations
- `/api/v1/databases/*` - Database configurations
- `/api/v1/backups/*` - Backup operations
- `/api/v1/stats` - System statistics

## Database Schema

The authentication system uses these tables:

```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY,
    discord_user_id VARCHAR(255) UNIQUE,  -- Stores username
    discord_username VARCHAR(255),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- OTP tokens table
CREATE TABLE otp_tokens (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    otp_code VARCHAR(6),
    expires_at TIMESTAMP,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP
);
```

## Example: Complete Authentication Flow

```bash
# 1. Request OTP
$ curl -X POST http://localhost:8080/api/v1/auth/login
{"message":"OTP sent to Discord webhook"}

# 2. Check Discord for OTP (e.g., 742891)

# 3. Verify OTP
$ curl -X POST http://localhost:8080/api/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"otp": "742891"}'
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMTIzNDU2Nzg5MCIsImRpc2NvcmRfdXNlcl9pZCI6ImFkbWluIiwiZXhwIjoxNzAwMTIzNDU2fQ.abc123",
  "expires_at": "2025-11-17T22:00:00Z"
}

# 4. Use token for API requests
$ export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
$ curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/v1/databases
[...]
```

That's it! You now have a secure, time-limited session to manage your backups.
