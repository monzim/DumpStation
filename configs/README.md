# 🚀 DumpStation Production Deployment

This directory contains production-ready Docker Compose configuration for deploying DumpStation.

## 📦 What's Included

- **compose.yml** - Production-ready Docker Compose configuration
- **.env.example** - Environment variable template
- **deploy.sh** - Automated deployment script

## 🏗️ Architecture

The production setup includes:

```
┌─────────────────────────────────────────┐
│         dumpstation_external             │  (Public Network)
│  ┌──────────────┐    ┌──────────────┐   │
│  │   Backend    │    │      Web     │   │
│  │   :8080      │    │     :3000    │   │
│  └──────┬───────┘    └──────────────┘   │
└─────────┼──────────────────────────────┘
          │
┌─────────┼──────────────────────────────┐
│         │  dumpstation_internal         │  (Internal Network)
│  ┌──────┴───────┐                       │
│  │  PostgreSQL  │                       │
│  │    :5432     │                       │
│  └──────────────┘                       │
└──────────────────────────────────────────┘
```

### Services

1. **PostgreSQL** (Internal Database)

   - Image: `postgres:15-alpine`
   - Purpose: Stores DumpStation's internal data
   - Network: Internal only (not exposed to internet)
   - Volume: `postgres_data` for persistence

2. **Backend API** (DumpStation Server)

   - Image: `ghcr.io/monzim/dumpstation:latest`
   - Port: `8080` (configurable)
   - Networks: Both internal (DB access) and external (API access)
   - Features: JWT auth, Discord integration, backup management

3. **Web Frontend** (React UI)

   - Image: `ghcr.io/monzim/dumpstation/web:latest`
   - Port: `3000` (configurable)
   - Network: External only
   - Features: Modern UI, responsive design, real-time updates

4. **MinIO** (Optional, commented out)
   - Purpose: Local S3-compatible storage for testing
   - Ports: `9000` (API), `9001` (Console)
   - Uncomment in compose.yml to enable

### Networks

- **dumpstation_internal** (`172.20.0.0/16`)

  - Internal-only network for backend ↔ database communication
  - Not exposed to external traffic
  - Enhanced security

- **dumpstation_external** (`172.21.0.0/16`)
  - External network for public-facing services
  - Backend API and Web frontend
  - Connected to host ports

## 🚀 Quick Start

### Prerequisites

- Docker 20.10+ and Docker Compose 2.0+
- Discord webhook URL ([Create one](https://support.discord.com/hc/en-us/articles/228383668))
- (Optional) Domain name with SSL certificate for production

### Option 1: Automated Deployment (Recommended)

```bash
cd configs
./deploy.sh
```

The script will:

1. Check Docker installation
2. Create `.env` from template if needed
3. Validate environment variables
4. Pull latest images
5. Start all services
6. Wait for health checks
7. Display access information

### Option 2: Manual Deployment

```bash
# 1. Create environment file
cd configs
cp .env.example .env

# 2. Edit configuration (REQUIRED)
nano .env
# Set at minimum:
# - POSTGRES_PASSWORD
# - JWT_SECRET
# - DISCORD_WEBHOOK_URL

# 3. Pull latest images
docker compose pull

# 4. Start services
docker compose up -d

# 5. Check status
docker compose ps

# 6. View logs
docker compose logs -f
```

## ⚠️ Important Configuration Notes

> **🔴 CRITICAL: Update These Variables for Your Setup**
>
> Before deploying to production, you **MUST** update the following variables according to your actual setup:
>
> 1. **`CORS_ALLOWED_ORIGINS`** - Update this in your `.env` file to match your frontend domain(s)
>
>    ```bash
>    # ❌ Don't use wildcard in production
>    CORS_ALLOWED_ORIGINS=*
>
>    # ✅ Use your actual domain(s)
>    CORS_ALLOWED_ORIGINS=https://dumpstation.yourdomain.com,https://www.yourdomain.com
>    ```
>
> 2. **`VITE_API_BASE_URL`** - Update this in your `.env` file to point to your backend API
>
>    ```bash
>    # ❌ Don't use localhost in production
>    VITE_API_BASE_URL=http://localhost:8080
>
>    # ✅ Use your actual API domain
>    VITE_API_BASE_URL=https://api.yourdomain.com
>    ```
>
> **Failure to update these values will result in:**
>
> - CORS errors preventing frontend-backend communication
> - API calls pointing to wrong/unreachable endpoints
> - Security vulnerabilities from overly permissive CORS settings

## ⚙️ Configuration

### Required Environment Variables

| Variable              | Description                            | Example                                |
| --------------------- | -------------------------------------- | -------------------------------------- |
| `POSTGRES_PASSWORD`   | PostgreSQL database password           | `MySecurePass123!`                     |
| `JWT_SECRET`          | Secret for signing JWT tokens          | `openssl rand -base64 64`              |
| `DISCORD_WEBHOOK_URL` | Discord webhook for auth/notifications | `https://discord.com/api/webhooks/...` |

### Optional Environment Variables

| Variable                 | Default     | Description                      |
| ------------------------ | ----------- | -------------------------------- |
| `BACKEND_PORT`           | `8080`      | Backend API port (external)      |
| `WEB_PORT`               | `3000`      | Web frontend port (external)     |
| `JWT_EXPIRATION_MINUTES` | `10`        | JWT token lifetime               |
| `TURNSTILE_ENABLED`      | `false`     | Enable Cloudflare bot protection |
| `CORS_ALLOWED_ORIGINS`   | `*`         | Allowed CORS origins             |
| `SYSTEM_USERNAME`        | `admin`     | Initial admin username           |
| `SYSTEM_EMAIL`           | `admin@...` | Initial admin email              |

See [.env.example](.env.example) for complete configuration options.

### Generating Secure Secrets

```bash
# Generate JWT secret
openssl rand -base64 64

# Generate PostgreSQL password
openssl rand -base64 32

# Generate MinIO password
openssl rand -base64 24
```

## 🔒 Security Best Practices

### 1. **Change Default Values**

Never use default passwords or secrets in production:

```bash
# Bad ❌
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production

# Good ✅
JWT_SECRET=$(openssl rand -base64 64)
```

### 2. **Use Reverse Proxy with Traefik**

Use Traefik as a reverse proxy with automatic SSL/TLS via Let's Encrypt:

**Add Traefik labels to your services in `compose.yml`:**

```yaml
services:
  backend:
    image: ghcr.io/monzim/dumpstation:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dumpstation-api.rule=Host(`api.yourdomain.com`)"
      - "traefik.http.routers.dumpstation-api.entrypoints=websecure"
      - "traefik.http.routers.dumpstation-api.tls.certresolver=letsencrypt"
      - "traefik.http.services.dumpstation-api.loadbalancer.server.port=8080"
    networks:
      - dumpstation_internal
      - dumpstation_external
      - traefik # Add Traefik network

  web:
    image: ghcr.io/monzim/dumpstation/web:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dumpstation-web.rule=Host(`dumpstation.yourdomain.com`)"
      - "traefik.http.routers.dumpstation-web.entrypoints=websecure"
      - "traefik.http.routers.dumpstation-web.tls.certresolver=letsencrypt"
      - "traefik.http.services.dumpstation-web.loadbalancer.server.port=3000"
    networks:
      - dumpstation_external
      - traefik # Add Traefik network

networks:
  traefik:
    external: true # Assumes you have a Traefik network already set up
```

**Traefik Static Configuration Example (`traefik.yml`):**

```yaml
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

certificatesResolvers:
  letsencrypt:
    acme:
      email: your-email@example.com
      storage: /letsencrypt/acme.json
      httpChallenge:
        entryPoint: web

providers:
  docker:
    exposedByDefault: false
    network: traefik
```

### 3. **Configure CORS Properly**

```bash
# Development (permissive)
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:7511

# Production (restrictive)
CORS_ALLOWED_ORIGINS=https://dumpstation.yourdomain.com,https://www.yourdomain.com
```

### 4. **Enable Firewall**

```bash
# Allow only necessary ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (for Let's Encrypt)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Backend and Web ports should NOT be exposed directly
# Access them through reverse proxy only
```

### 5. **Enable Turnstile (Optional)**

Protect against bots with Cloudflare Turnstile:

```bash
TURNSTILE_ENABLED=true
TURNSTILE_SITE_KEY=your_site_key_here
TURNSTILE_SECRET_KEY=your_secret_key_here
```

Get keys from: https://dash.cloudflare.com/?to=/:account/turnstile

## 📊 Monitoring & Maintenance

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f postgres
docker compose logs -f web

# Last 100 lines
docker compose logs --tail=100 backend
```

### Check Service Health

```bash
# Service status
docker compose ps

# Resource usage
docker stats

# Health checks
docker inspect dumpstation_backend | grep -A 5 Health
```

### Backup DumpStation Database

```bash
# Create backup directory
mkdir -p backups

# Backup PostgreSQL volume
docker compose exec postgres pg_dump -U postgres backup_service > backups/dumpstation_$(date +%Y%m%d_%H%M%S).sql

# Or backup entire volume
docker run --rm -v dumpstation_postgres_data:/data -v $(pwd)/backups:/backup alpine tar czf /backup/postgres_data_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .
```

### Update to Latest Version

```bash
# Pull latest images
docker compose pull

# Recreate containers (no data loss)
docker compose up -d

# Clean old images
docker image prune -f
```

### Restart Services

```bash
# Restart all
docker compose restart

# Restart specific service
docker compose restart backend

# Full restart with fresh containers
docker compose down
docker compose up -d
```

## 🔧 Troubleshooting

### Services Won't Start

```bash
# Check logs
docker compose logs

# Verify .env file
cat .env | grep -v '^#' | grep -v '^$'

# Validate compose file
docker compose config
```

### Database Connection Issues

```bash
# Check if PostgreSQL is healthy
docker compose ps postgres

# Test database connection
docker compose exec postgres pg_isready -U postgres

# Connect to database
docker compose exec postgres psql -U postgres -d backup_service
```

### Backend API Not Responding

```bash
# Check backend logs
docker compose logs backend

# Verify environment variables
docker compose exec backend env | grep DB_

# Test health endpoint
curl http://localhost:8080/api/v1/health
```

### Web Frontend Not Loading

```bash
# Check web logs
docker compose logs web

# Verify API URL
docker compose exec web env | grep VITE_API_BASE_URL

# Test direct access
curl http://localhost:3000
```

### Network Issues

```bash
# List networks
docker network ls

# Inspect networks
docker network inspect dumpstation_internal
docker network inspect dumpstation_external

# Recreate networks
docker compose down
docker network prune
docker compose up -d
```

### Permission Issues

```bash
# Fix volume permissions
docker compose down
docker volume rm dumpstation_postgres_data
docker compose up -d
```

## 📈 Performance Tuning

### PostgreSQL Optimization

Add to compose.yml under postgres service:

```yaml
command:
  - "postgres"
  - "-c"
  - "shared_buffers=256MB"
  - "-c"
  - "effective_cache_size=1GB"
  - "-c"
  - "max_connections=200"
```

### Resource Limits

Add to services in compose.yml:

```yaml
deploy:
  resources:
    limits:
      cpus: "2"
      memory: 2G
    reservations:
      cpus: "1"
      memory: 512M
```

### Log Rotation

Already configured in compose.yml:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "50m"
    max-file: "5"
```

## 🌐 Production Deployment Checklist

- [ ] Change all default passwords and secrets
- [ ] Set up reverse proxy (Traefik) with SSL/TLS
- [ ] Configure proper CORS origins (no wildcards)
- [ ] Enable firewall and close unnecessary ports
- [ ] Set up automated backups for postgres_data volume
- [ ] Configure Discord webhook for notifications
- [ ] Test backup and restore functionality
- [ ] Set up monitoring and alerting
- [ ] Document deployment for team
- [ ] Test disaster recovery procedures
- [ ] Update DNS records if using custom domain
- [ ] Configure log aggregation (optional)
- [ ] Set up health check monitoring (optional)
- [ ] Enable Turnstile for bot protection (optional)

## 📚 Additional Resources

- **[Main README](../README.md)** - Project overview
- **[Deployment Guide](../docs/DEPLOYMENT.md)** - Detailed deployment instructions
- **[API Documentation](http://localhost:8080/swagger/)** - API reference (when running)
- **[Contributing Guide](../CONTRIBUTING.md)** - How to contribute
- **[Roadmap](../ROADMAP.md)** - Future features

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/monzim/dumpstation/issues)
- **Discussions**: [GitHub Discussions](https://github.com/monzim/dumpstation/discussions)
- **Email**: [me@monzim.com](mailto:me@monzim.com)
- **Live Demo**: [dumpstation.monzim.com](https://dumpstation.monzim.com)

---

**Made with ❤️ for the open-source community**
