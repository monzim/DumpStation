# 🚀 DumpStation Deployment Guide

Complete guide for deploying DumpStation in production environments.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Deployment (Docker Compose)](#quick-deployment-docker-compose)
- [Production Deployment](#production-deployment)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Storage Provider Setup](#storage-provider-setup)
- [Discord Webhook Configuration](#discord-webhook-configuration)
- [Reverse Proxy Setup](#reverse-proxy-setup)
- [SSL/TLS Configuration](#ssltls-configuration)
- [Monitoring and Logging](#monitoring-and-logging)
- [Backup and Recovery](#backup-and-recovery)
- [Security Hardening](#security-hardening)
- [Troubleshooting](#troubleshooting)
- [Scaling](#scaling)

---

## Prerequisites

### System Requirements

**Minimum Requirements:**

- **CPU**: 2 cores
- **RAM**: 2 GB
- **Storage**: 20 GB (plus space for backups if using local storage)
- **OS**: Linux (Ubuntu 20.04+, Debian 11+, CentOS 8+, or similar)

**Recommended for Production:**

- **CPU**: 4+ cores
- **RAM**: 4-8 GB
- **Storage**: SSD with 50+ GB
- **OS**: Ubuntu 22.04 LTS or Debian 12

### Required Software

- **Docker** 24.0+ ([installation guide](https://docs.docker.com/engine/install/))
- **Docker Compose** 2.20+ ([installation guide](https://docs.docker.com/compose/install/))
- **Git** (for cloning the repository)

### Required Services

- **PostgreSQL Database** (15+ recommended) - Can be self-hosted or managed service
- **Discord Webhook** - For authentication and notifications
- **Cloud Storage** - AWS S3, Cloudflare R2, or MinIO

### Network Requirements

- **Outbound Access**:

  - Discord API (discord.com)
  - Your cloud storage provider (AWS, Cloudflare, etc.)
  - Docker Hub (for pulling images)
  - Target databases to backup

- **Inbound Access** (if exposing publicly):
  - Port 80 (HTTP) - Redirects to HTTPS
  - Port 443 (HTTPS) - API and web interface

---

## Quick Deployment (Docker Compose)

Perfect for testing, development, or small-scale production deployments.

### 1. Clone Repository

```bash
git clone https://github.com/monzim/DumpStation.git
cd dumpstation/server
```

### 2. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit configuration
nano .env
```

**Minimal `.env` configuration:**

```env
# Server Configuration
SERVER_HOST=0.0.0.0
SERVER_PORT=8080

# Database (DumpStation's internal database)
DB_HOST=postgres
DB_PORT=5432
DB_USER=dumpstation
DB_PASSWORD=CHANGE_THIS_SECURE_PASSWORD
DB_NAME=dumpstation_prod
DB_SSLMODE=disable

# JWT Configuration
JWT_SECRET=CHANGE_THIS_TO_RANDOM_64_CHAR_STRING
JWT_EXPIRATION_MINUTES=10

# Discord Webhook (required)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN
OTP_EXPIRATION_MINUTES=5

# CORS Configuration
CORS_ALLOWED_ORIGINS=https://yourdomain.com
CORS_ALLOWED_METHODS=GET,POST,PUT,DELETE,OPTIONS,PATCH
CORS_ALLOWED_HEADERS=Origin,Content-Type,Accept,Authorization,X-Requested-With,X-2FA-Token
CORS_ALLOW_CREDENTIALS=true
CORS_MAX_AGE=86400

# System User
SYSTEM_USERNAME=admin
SYSTEM_EMAIL=admin@yourdomain.com
```

### 3. Generate Secure Secrets

```bash
# Generate JWT secret (64 characters)
openssl rand -base64 48

# Alternative using /dev/urandom
cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 64 | head -n 1
```

### 4. Deploy

```bash
# Start services
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f backup-service

# Check status
docker-compose -f docker-compose.prod.yml ps
```

### 5. Verify Deployment

```bash
# Check health endpoint
curl http://localhost:8080/health

# Expected response:
# {"status":"healthy","timestamp":"2025-12-08T..."}

# Check API documentation
curl http://localhost:8080/swagger/index.html
```

---

## Production Deployment

### Architecture Options

#### Option 1: All-in-One Server

Single server running DumpStation, PostgreSQL, and optional MinIO.

```
┌─────────────────────────────────────┐
│         Production Server            │
├─────────────────────────────────────┤
│  ┌────────────┐  ┌──────────────┐   │
│  │ DumpStation│  │  PostgreSQL  │   │
│  │   (API)    │  │  (Internal)  │   │
│  └────────────┘  └──────────────┘   │
│         │                            │
│         └──────┐                     │
│                ▼                     │
│         ┌──────────┐                 │
│         │  MinIO   │ (Optional)      │
│         │ (Local)  │                 │
│         └──────────┘                 │
└─────────────────────────────────────┘
```

**Best for**: Small deployments, testing, personal use

#### Option 2: Separate Database

DumpStation on one server, PostgreSQL on managed service.

```
┌──────────────┐         ┌────────────────┐
│ DumpStation  │────────▶│   AWS RDS      │
│   Server     │         │   PostgreSQL   │
└──────────────┘         └────────────────┘
       │
       ├────────────▶ AWS S3 / Cloudflare R2
       │
       └────────────▶ Discord Webhooks
```

**Best for**: Production deployments, better reliability

#### Option 3: Kubernetes/Container Orchestration

For high availability and scalability.

```
┌────────────────────────────────────────┐
│         Kubernetes Cluster             │
├────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐        │
│  │DumpStation │  │DumpStation │        │
│  │  Pod 1     │  │  Pod 2     │        │
│  └────────────┘  └────────────┘        │
│         │              │                │
│         └──────┬───────┘                │
│                ▼                        │
│       ┌────────────────┐                │
│       │   PostgreSQL   │                │
│       │  StatefulSet   │                │
│       └────────────────┘                │
└────────────────────────────────────────┘
```

**Best for**: Enterprise deployments, high traffic

### Production Docker Compose Setup

#### 1. Create Production Directory

```bash
mkdir -p /opt/dumpstation
cd /opt/dumpstation

# Clone repository
git clone https://github.com/monzim/DumpStation.git .
cd server
```

#### 2. Configure for Production

Create `docker-compose.prod.yml`:

```yaml
version: "3.8"

services:
  backup-service:
    image: dumpstation:latest
    build:
      context: .
      dockerfile: Dockerfile
      target: runtime
    container_name: dumpstation-api
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:8080" # Only expose to localhost
    environment:
      - SERVER_HOST=0.0.0.0
      - SERVER_PORT=8080
      - DB_HOST=${DB_HOST}
      - DB_PORT=${DB_PORT}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_NAME=${DB_NAME}
      - DB_SSLMODE=${DB_SSLMODE:-require}
      - JWT_SECRET=${JWT_SECRET}
      - JWT_EXPIRATION_MINUTES=${JWT_EXPIRATION_MINUTES:-10}
      - DISCORD_WEBHOOK_URL=${DISCORD_WEBHOOK_URL}
      - OTP_EXPIRATION_MINUTES=${OTP_EXPIRATION_MINUTES:-5}
      - CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS}
      - SYSTEM_USERNAME=${SYSTEM_USERNAME:-admin}
      - SYSTEM_EMAIL=${SYSTEM_EMAIL}
    volumes:
      - backup-data:/app/backups
      - ./logs:/app/logs
    networks:
      - dumpstation-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G
        reservations:
          cpus: "1"
          memory: 1G
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  # Optional: Include PostgreSQL if not using external database
  postgres:
    image: postgres:15-alpine
    container_name: dumpstation-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - dumpstation-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          cpus: "1"
          memory: 1G

volumes:
  backup-data:
    driver: local
  postgres-data:
    driver: local

networks:
  dumpstation-network:
    driver: bridge
```

#### 3. Deploy

```bash
# Build and start
docker-compose -f docker-compose.prod.yml up -d --build

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Verify all services are healthy
docker-compose -f docker-compose.prod.yml ps
```

---

## Environment Configuration

### Complete Environment Variables Reference

```env
# ==========================================
# Server Configuration
# ==========================================
SERVER_HOST=0.0.0.0                    # Listen address (0.0.0.0 = all interfaces)
SERVER_PORT=8080                       # API server port

# ==========================================
# Database Configuration (DumpStation DB)
# ==========================================
DB_HOST=postgres                       # PostgreSQL host
DB_PORT=5432                          # PostgreSQL port
DB_USER=dumpstation                   # Database username
DB_PASSWORD=your_secure_password       # Database password (REQUIRED)
DB_NAME=dumpstation_prod              # Database name
DB_SSLMODE=require                    # SSL mode: disable, require, verify-ca, verify-full

# ==========================================
# JWT Authentication
# ==========================================
JWT_SECRET=your_64_char_random_secret  # REQUIRED: Use `openssl rand -base64 48`
JWT_EXPIRATION_MINUTES=10             # Token lifetime in minutes

# ==========================================
# Discord Integration
# ==========================================
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...  # REQUIRED
OTP_EXPIRATION_MINUTES=5              # OTP code validity

# ==========================================
# CORS Configuration
# ==========================================
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
CORS_ALLOWED_METHODS=GET,POST,PUT,DELETE,OPTIONS,PATCH
CORS_ALLOWED_HEADERS=Origin,Content-Type,Accept,Authorization,X-Requested-With,X-2FA-Token
CORS_ALLOW_CREDENTIALS=true
CORS_MAX_AGE=86400

# ==========================================
# System Configuration
# ==========================================
SYSTEM_USERNAME=admin                  # Initial admin username
SYSTEM_EMAIL=admin@yourdomain.com     # Initial admin email

# ==========================================
# Optional: Logging
# ==========================================
LOG_LEVEL=info                        # debug, info, warn, error
LOG_FORMAT=json                       # json, text
```

### Environment-Specific Configurations

#### Development

```env
DB_SSLMODE=disable
JWT_EXPIRATION_MINUTES=1440  # 24 hours for easier development
CORS_ALLOWED_ORIGINS=*
LOG_LEVEL=debug
```

#### Staging

```env
DB_SSLMODE=require
JWT_EXPIRATION_MINUTES=60
CORS_ALLOWED_ORIGINS=https://staging.yourdomain.com
LOG_LEVEL=info
```

#### Production

```env
DB_SSLMODE=verify-full
JWT_EXPIRATION_MINUTES=10
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
LOG_LEVEL=warn
LOG_FORMAT=json
```

---

## Database Setup

### Option 1: Docker PostgreSQL (Included)

Already configured in `docker-compose.prod.yml`. No additional setup needed.

### Option 2: External PostgreSQL

#### AWS RDS

1. **Create RDS Instance**:

   - Engine: PostgreSQL 15+
   - Instance class: db.t3.medium (or larger)
   - Storage: 20 GB SSD (auto-scaling enabled)
   - Enable automated backups
   - Multi-AZ for high availability

2. **Configure Security Group**:

   ```
   Inbound Rules:
   - Type: PostgreSQL
   - Protocol: TCP
   - Port: 5432
   - Source: Your server's security group
   ```

3. **Update `.env`**:
   ```env
   DB_HOST=your-rds-endpoint.region.rds.amazonaws.com
   DB_PORT=5432
   DB_USER=dumpstation
   DB_PASSWORD=your_secure_password
   DB_NAME=dumpstation_prod
   DB_SSLMODE=require
   ```

#### Self-Hosted PostgreSQL

1. **Install PostgreSQL**:

   ```bash
   # Ubuntu/Debian
   sudo apt update
   sudo apt install postgresql-15 postgresql-contrib

   # Start service
   sudo systemctl enable postgresql
   sudo systemctl start postgresql
   ```

2. **Create Database and User**:

   ```bash
   sudo -u postgres psql
   ```

   ```sql
   CREATE DATABASE dumpstation_prod;
   CREATE USER dumpstation WITH ENCRYPTED PASSWORD 'your_secure_password';
   GRANT ALL PRIVILEGES ON DATABASE dumpstation_prod TO dumpstation;
   \q
   ```

3. **Configure PostgreSQL** (`/etc/postgresql/15/main/postgresql.conf`):

   ```conf
   listen_addresses = '*'
   max_connections = 100
   shared_buffers = 256MB
   ```

4. **Allow Remote Connections** (`/etc/postgresql/15/main/pg_hba.conf`):

   ```conf
   host    dumpstation_prod    dumpstation    your_server_ip/32    md5
   ```

5. **Restart PostgreSQL**:
   ```bash
   sudo systemctl restart postgresql
   ```

---

## Storage Provider Setup

### AWS S3

#### 1. Create S3 Bucket

```bash
aws s3 mb s3://dumpstation-backups --region us-east-1
```

Or via AWS Console:

- Navigate to S3
- Create bucket: `dumpstation-backups`
- Enable versioning (recommended)
- Enable encryption (AES-256 or KMS)

#### 2. Create IAM User

```bash
aws iam create-user --user-name dumpstation-backup
```

#### 3. Create IAM Policy

Save as `dumpstation-s3-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::dumpstation-backups",
        "arn:aws:s3:::dumpstation-backups/*"
      ]
    }
  ]
}
```

Apply policy:

```bash
aws iam create-policy \
  --policy-name DumpStationS3Access \
  --policy-document file://dumpstation-s3-policy.json

aws iam attach-user-policy \
  --user-name dumpstation-backup \
  --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/DumpStationS3Access
```

#### 4. Create Access Keys

```bash
aws iam create-access-key --user-name dumpstation-backup
```

Save the `AccessKeyId` and `SecretAccessKey`.

#### 5. Configure in DumpStation

Add storage via API or web interface:

```json
{
  "name": "AWS S3 Production",
  "provider": "s3",
  "bucket": "dumpstation-backups",
  "region": "us-east-1",
  "access_key": "AKIAIOSFODNN7EXAMPLE",
  "secret_key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
}
```

### Cloudflare R2

#### 1. Create R2 Bucket

- Go to Cloudflare Dashboard → R2
- Click "Create bucket"
- Name: `dumpstation-backups`
- Location: Automatic (or choose specific region)

#### 2. Create API Token

- Navigate to R2 → Manage R2 API Tokens
- Click "Create API Token"
- Name: `DumpStation Access`
- Permissions: Object Read & Write
- Scope: Apply to specific bucket (`dumpstation-backups`)
- Create token

You'll receive:

- Access Key ID
- Secret Access Key
- Endpoint URL (e.g., `https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com`)

#### 3. Configure in DumpStation

```json
{
  "name": "Cloudflare R2 Production",
  "provider": "r2",
  "bucket": "dumpstation-backups",
  "region": "auto",
  "endpoint": "https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com",
  "access_key": "YOUR_R2_ACCESS_KEY_ID",
  "secret_key": "YOUR_R2_SECRET_ACCESS_KEY"
}
```

### MinIO (Self-Hosted)

Perfect for on-premises deployments or cost-effective cloud storage.

#### 1. Deploy MinIO

```yaml
# Add to docker-compose.prod.yml
  minio:
    image: minio/minio:latest
    container_name: dumpstation-minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    ports:
      - "127.0.0.1:9000:9000"
      - "127.0.0.1:9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin123
    volumes:
      - minio-data:/data
    networks:
      - dumpstation-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3

volumes:
  minio-data:
    driver: local
```

#### 2. Create Bucket

Access MinIO Console at `http://localhost:9001`:

- Login with `minioadmin` / `minioadmin123`
- Create bucket: `backups`
- Set access policy to private

#### 3. Create Access Keys

- Navigate to Access Keys
- Create new access key
- Save credentials

#### 4. Configure in DumpStation

```json
{
  "name": "MinIO Local Storage",
  "provider": "s3",
  "bucket": "backups",
  "region": "us-east-1",
  "endpoint": "http://minio:9000",
  "access_key": "YOUR_MINIO_ACCESS_KEY",
  "secret_key": "YOUR_MINIO_SECRET_KEY"
}
```

---

## Discord Webhook Configuration

### 1. Create Discord Server (if needed)

- Open Discord
- Click "+" to create a server
- Choose "Create My Own"
- Name it (e.g., "DumpStation Alerts")

### 2. Create Webhook

1. Go to Server Settings → Integrations → Webhooks
2. Click "New Webhook"
3. Name: `DumpStation`
4. Select channel: `#backups` (or create one)
5. Copy Webhook URL

Format: `https://discord.com/api/webhooks/123456789/abcdefg-hijklmn`

### 3. Test Webhook

```bash
curl -X POST "YOUR_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "🎉 DumpStation webhook test successful!"
  }'
```

You should see the message in your Discord channel.

### 4. Configure DumpStation

Add to `.env`:

```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_TOKEN
```

### 5. Notification Examples

**OTP Authentication:**

```
🔐 DumpStation Login

Your OTP code is: 123456

This code expires in 5 minutes.
```

**Backup Success:**

```
✅ Backup Successful

Database: production_db
Backup: swift-falcon-20251208
Size: 245.3 MB
Duration: 2m 34s
Storage: AWS S3
```

**Backup Failure:**

```
❌ Backup Failed

Database: staging_db
Error: Connection timeout
Details: Unable to connect to database after 30s
```

---

## Reverse Proxy Setup

### Nginx

#### 1. Install Nginx

```bash
sudo apt update
sudo apt install nginx
```

#### 2. Create Configuration

Create `/etc/nginx/sites-available/dumpstation`:

```nginx
# HTTP → HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name dumpstation.yourdomain.com;

    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name dumpstation.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/dumpstation.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dumpstation.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/dumpstation_access.log;
    error_log /var/log/nginx/dumpstation_error.log;

    # API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # Buffer settings
        proxy_buffering off;
        proxy_request_buffering off;
    }

    # Swagger UI
    location /swagger/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:8080;
        access_log off;
    }

    # Static files (if serving web app from same domain)
    location / {
        root /var/www/dumpstation;
        try_files $uri $uri/ /index.html;
    }
}
```

#### 3. Enable Site

```bash
sudo ln -s /etc/nginx/sites-available/dumpstation /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Caddy

Caddy automatically handles HTTPS with Let's Encrypt.

#### 1. Install Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

#### 2. Create Caddyfile

Create `/etc/caddy/Caddyfile`:

```caddy
dumpstation.yourdomain.com {
    # Automatic HTTPS

    # API endpoints
    handle /api/* {
        reverse_proxy localhost:8080
    }

    # Swagger UI
    handle /swagger/* {
        reverse_proxy localhost:8080
    }

    # Health check
    handle /health {
        reverse_proxy localhost:8080
    }

    # Static files (web app)
    handle {
        root * /var/www/dumpstation
        try_files {path} /index.html
        file_server
    }

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        X-XSS-Protection "1; mode=block"
    }

    # Logging
    log {
        output file /var/log/caddy/dumpstation.log
    }
}
```

#### 3. Start Caddy

```bash
sudo systemctl enable caddy
sudo systemctl start caddy
sudo systemctl status caddy
```

---

## SSL/TLS Configuration

### Let's Encrypt with Certbot

#### 1. Install Certbot

```bash
sudo apt install certbot python3-certbot-nginx
```

#### 2. Obtain Certificate

```bash
sudo certbot --nginx -d dumpstation.yourdomain.com
```

Follow prompts to configure HTTPS.

#### 3. Auto-Renewal

Certbot automatically sets up renewal. Test it:

```bash
sudo certbot renew --dry-run
```

### Cloudflare SSL

If using Cloudflare as DNS:

1. **Set SSL/TLS mode** to "Full (strict)" in Cloudflare dashboard
2. **Generate Origin Certificate** in Cloudflare
3. **Install certificate** on your server:

```nginx
ssl_certificate /etc/ssl/cloudflare/cert.pem;
ssl_certificate_key /etc/ssl/cloudflare/key.pem;
```

---

## Monitoring and Logging

### Application Logs

```bash
# View Docker logs
docker-compose -f docker-compose.prod.yml logs -f backup-service

# Tail logs
tail -f /opt/dumpstation/logs/app.log

# Search logs
grep "ERROR" /opt/dumpstation/logs/app.log
```

### Health Checks

```bash
# Manual health check
curl http://localhost:8080/health

# Set up monitoring endpoint
curl http://localhost:8080/api/v1/stats
```

### System Monitoring

#### Prometheus + Grafana (Recommended)

Add to `docker-compose.prod.yml`:

```yaml
prometheus:
  image: prom/prometheus:latest
  container_name: prometheus
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml
    - prometheus-data:/prometheus
  command:
    - "--config.file=/etc/prometheus/prometheus.yml"
  ports:
    - "127.0.0.1:9090:9090"
  networks:
    - dumpstation-network

grafana:
  image: grafana/grafana:latest
  container_name: grafana
  ports:
    - "127.0.0.1:3000:3000"
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=admin
  volumes:
    - grafana-data:/var/lib/grafana
  networks:
    - dumpstation-network
```

### Log Rotation

Create `/etc/logrotate.d/dumpstation`:

```conf
/opt/dumpstation/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 root root
    sharedscripts
    postrotate
        docker-compose -f /opt/dumpstation/server/docker-compose.prod.yml restart backup-service > /dev/null 2>&1 || true
    endscript
}
```

---

## Backup and Recovery

### DumpStation Database Backup

```bash
# Backup DumpStation's own database
docker exec dumpstation-db pg_dump -U dumpstation dumpstation_prod > dumpstation_backup_$(date +%Y%m%d).sql

# Restore
cat dumpstation_backup_20251208.sql | docker exec -i dumpstation-db psql -U dumpstation dumpstation_prod
```

### Configuration Backup

```bash
# Backup environment and configs
tar -czf dumpstation_config_$(date +%Y%m%d).tar.gz \
    /opt/dumpstation/server/.env \
    /opt/dumpstation/server/docker-compose.prod.yml \
    /etc/nginx/sites-available/dumpstation
```

### Disaster Recovery

1. **Install Docker and Docker Compose** on new server
2. **Restore configuration files**
3. **Restore database backup**
4. **Start services**:
   ```bash
   cd /opt/dumpstation/server
   docker-compose -f docker-compose.prod.yml up -d
   ```

---

## Security Hardening

### Firewall (UFW)

```bash
# Enable firewall
sudo ufw enable

# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow PostgreSQL (only from DumpStation server if external)
sudo ufw allow from YOUR_SERVER_IP to any port 5432

# Check status
sudo ufw status verbose
```

### Docker Security

```bash
# Run container as non-root (already configured in Dockerfile)
# Limit resources in docker-compose.yml (already configured)
# Use read-only file system where possible
```

### Database Security

```sql
-- Create backup user with minimal permissions
CREATE USER backup_user WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE your_database TO backup_user;
GRANT USAGE ON SCHEMA public TO backup_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO backup_user;
```

### API Security

- **Rate limiting**: Use nginx `limit_req` module
- **Authentication**: Always use JWT tokens
- **CORS**: Restrict to your domain only
- **HTTPS**: Always use HTTPS in production

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs backup-service

# Common issues:
# 1. Port already in use
sudo lsof -i :8080

# 2. Environment variables missing
docker-compose -f docker-compose.prod.yml config

# 3. Database connection failed
docker-compose -f docker-compose.prod.yml exec backup-service nc -zv postgres 5432
```

### Database Connection Errors

```bash
# Test connection from container
docker-compose -f docker-compose.prod.yml exec backup-service \
  psql -h $DB_HOST -U $DB_USER -d $DB_NAME

# Check PostgreSQL logs
docker-compose -f docker-compose.prod.yml logs postgres
```

### Backup Failures

```bash
# Check backup logs
docker-compose -f docker-compose.prod.yml logs backup-service | grep -i backup

# Test pg_dump manually
docker-compose -f docker-compose.prod.yml exec backup-service \
  pg_dump -h target_db_host -U target_user -d target_db
```

### Storage Upload Errors

```bash
# Test S3 connectivity
docker-compose -f docker-compose.prod.yml exec backup-service \
  curl -I https://s3.amazonaws.com

# Verify credentials
# Check AWS credentials in storage configuration
```

### Discord Webhook Not Working

```bash
# Test webhook manually
curl -X POST "YOUR_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"content": "Test message"}'

# Check webhook URL format
# Should be: https://discord.com/api/webhooks/ID/TOKEN
```

### High Memory Usage

```bash
# Check container stats
docker stats dumpstation-api

# Increase memory limit in docker-compose.yml
# Set appropriate limits based on your backup sizes
```

---

## Scaling

### Horizontal Scaling

DumpStation can be scaled horizontally using:

1. **Load Balancer**: Distribute requests across multiple instances
2. **Shared Database**: All instances connect to the same PostgreSQL
3. **Distributed Locking**: Use Redis for job locking (future enhancement)

```nginx
# Nginx load balancing
upstream dumpstation_backend {
    least_conn;
    server 127.0.0.1:8080;
    server 127.0.0.1:8081;
    server 127.0.0.1:8082;
}

server {
    location /api/ {
        proxy_pass http://dumpstation_backend;
    }
}
```

### Vertical Scaling

Increase resources for single instance:

```yaml
# docker-compose.prod.yml
deploy:
  resources:
    limits:
      cpus: "4"
      memory: 8G
    reservations:
      cpus: "2"
      memory: 4G
```

### Database Optimization

```sql
-- Create indexes for frequently queried fields
CREATE INDEX idx_backups_database_id ON backups(database_id);
CREATE INDEX idx_backups_created_at ON backups(created_at);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);

-- Vacuum and analyze
VACUUM ANALYZE;
```

---

## Next Steps

After deployment:

1. ✅ **Test authentication** - Login via Discord OTP
2. ✅ **Add storage provider** - Configure S3/R2/MinIO
3. ✅ **Add first database** - Configure backup schedule
4. ✅ **Test manual backup** - Verify backup process works
5. ✅ **Monitor logs** - Watch for any errors
6. ✅ **Set up monitoring** - Configure Grafana dashboards
7. ✅ **Document credentials** - Store securely (password manager)
8. ✅ **Test restore** - Verify backups can be restored

---

## Support

Need help?

- 📖 **Documentation**: [README.md](../README.md)
- 💬 **GitHub Discussions**: [Ask questions](https://github.com/monzim/dumpstation/discussions)
- 🐛 **GitHub Issues**: [Report bugs](https://github.com/monzim/dumpstation/issues)
- 📧 **Email**: [me@monzim.com](mailto:me@monzim.com)

---

**Happy Deploying! 🚀**
