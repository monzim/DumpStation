<div align="center">
  <img src="web/public/images/og.webp" alt="DumpStation Logo" />
  
  # 🗄️ DumpStation
  
  **Self-Hosted PostgreSQL Backup Management System**
  
  Automate your database backups with cloud storage integration, Discord notifications, and a modern web interface.
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Go Version](https://img.shields.io/badge/Go-1.24+-00ADD8?logo=go)](https://go.dev/)
  [![React Version](https://img.shields.io/badge/React-19.2-61DAFB?logo=react)](https://react.dev/)
  [![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://www.docker.com/)
  [![Live Demo](https://img.shields.io/badge/Live-Demo-success?logo=google-chrome)](https://dumpstation.monzim.com)
  
  [Features](#-features) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [Contributing](#-contributing) • [License](#-license)
  
</div>

---

## 📖 Overview

**DumpStation** is a production-ready, self-hosted solution for managing PostgreSQL database backups. It combines automated scheduling, cloud storage integration, and real-time notifications in a single, easy-to-deploy application.

Perfect for DevOps teams, solo developers, and organizations that need reliable, automated database backups without vendor lock-in.

### 🎯 Why DumpStation?

- **🔒 Self-Hosted**: Full control over your data and backups
- **☁️ Cloud Native**: Native support for AWS S3, Cloudflare R2, and MinIO
- **🤖 Automated**: Set it and forget it with cron-based scheduling
- **🔔 Real-time Alerts**: Discord notifications for backup status
- **🎨 Modern UI**: Beautiful, responsive dashboard built with React
- **🐳 Docker Ready**: Deploy in minutes with Docker Compose
- **🔐 Secure**: JWT authentication, 2FA support, multi-tenant isolation
- **📊 Multi-Version**: Supports PostgreSQL 12, 13, 14, 15, 16, and 17

---

## ✨ Features

### 🗃️ Database Management

- **Multi-Database Support**: Manage unlimited PostgreSQL databases from a single interface
- **Version Compatibility**: Automatic version detection and tool selection (PostgreSQL 12-17)
- **Connection Testing**: Verify database connections before scheduling
- **Pause/Resume**: Temporarily disable backups without losing configuration
- **User Isolation**: Multi-tenant architecture with strict data separation

### ⏰ Flexible Scheduling

- **Cron-Based Scheduling**: Use familiar cron expressions for backup timing
- **Manual Triggers**: Run backups on-demand whenever needed
- **Automatic Rotation**: Keep last N backups or retain for M days
- **Smart Cleanup**: Automatic deletion of old backups based on your policy

### ☁️ Cloud Storage Integration

- **Multiple Providers**: AWS S3, Cloudflare R2, MinIO support
- **Flexible Configuration**: Different storage for different databases
- **Reusable Configs**: Share storage settings across multiple databases
- **S3-Compatible**: Works with any S3-compatible storage service

### 🔄 Backup & Restore

- **One-Click Backup**: Trigger backups manually with a single click
- **Human-Readable Names**: Auto-generated memorable backup names (`swift-falcon-20251208`)
- **Full Restore**: Restore to same database or different target
- **Cross-Server Restore**: Restore backups to any PostgreSQL server
- **Version-Aware**: Uses correct pg_dump/pg_restore for each database version

### 🔔 Discord Integration

- **Passwordless Login**: Authenticate using Discord OTP
- **Real-time Notifications**: Get instant alerts for backup success/failure
- **Customizable Alerts**: Configure notifications per database
- **System Events**: Receive alerts for important system events

### 🔐 Security & Authentication

- **JWT Authentication**: Secure token-based API access
- **Discord OTP**: Passwordless login via Discord webhooks
- **TOTP 2FA**: Optional two-factor authentication
- **Backup Codes**: Recovery codes for 2FA emergencies
- **Role-Based Access**: Admin, demo, and regular user roles
- **Activity Logging**: Comprehensive audit trail of all operations

### 📊 Monitoring & Analytics

- **Real-time Dashboard**: View system statistics at a glance
- **Backup History**: Track all backups with detailed status
- **Activity Logs**: Searchable logs of all system operations
- **Storage Metrics**: Monitor total storage usage
- **Success Rates**: Track backup success/failure statistics

### 🎨 Modern User Interface

- **Responsive Design**: Works perfectly on desktop, tablet, and mobile
- **Dark/Light Mode**: Choose your preferred theme
- **Interactive Components**: Built with Radix UI and shadcn/ui
- **Real-time Updates**: Live dashboard updates via React Query
- **Intuitive Navigation**: Clean, modern interface that's easy to use

---

## 🚀 Quick Start

### Prerequisites

- **Docker** and **Docker Compose** installed
- **Discord Webhook URL** for authentication and notifications ([Create one](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks))
- **PostgreSQL Database** to backup (can be local or remote)
- **Cloud Storage** (AWS S3, Cloudflare R2, or MinIO)

### 🎯 Easy Deployment (Recommended)

**Deploy DumpStation with a single command using our automated script:**

1. **Clone the repository**

```bash
git clone https://github.com/monzim/DumpStation.git
cd dumpstation/configs
```

2. **Run the deployment script**

```bash
./deploy.sh
```

The script will:

- ✅ Check Docker installation
- ✅ Create `.env` from template
- ✅ Validate configuration
- ✅ Pull latest images (backend + frontend)
- ✅ Start all services with health checks
- ✅ Display access URLs

3. **Configure required variables when prompted**

Edit the `.env` file and set:

```env
# Required
POSTGRES_PASSWORD=your_secure_password
JWT_SECRET=your_jwt_secret_here  # Generate with: openssl rand -base64 64
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_URL

# Important: Update for your setup
CORS_ALLOWED_ORIGINS=https://yourdomain.com
VITE_API_BASE_URL=https://api.yourdomain.com/api/v1
```

4. **Access DumpStation**

- **Web Interface**: `http://localhost:3000`
- **Backend API**: `http://localhost:8080`
- **API Documentation**: `http://localhost:8080/swagger/`

That's it! DumpStation is now running with both backend and frontend. 🎉

---

### 📋 Manual Installation (Alternative)

<details>
<summary>Click to expand manual setup instructions</summary>

1. **Clone the repository**

```bash
git clone https://github.com/monzim/DumpStation.git
cd dumpstation/configs
```

2. **Configure environment variables**

```bash
# Copy example environment file
cp .env.example .env

# Edit the configuration
nano .env
```

**Essential configuration:**

```env
# Database (for DumpStation itself)
POSTGRES_DB=backup_service
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password

# JWT Secret (generate a secure random string)
JWT_SECRET=your-super-secret-jwt-key-change-this

# Discord Webhook (required for authentication)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_URL

# API URL for frontend
VITE_API_BASE_URL=http://localhost:8080/api/v1

# CORS Configuration
CORS_ALLOWED_ORIGINS=http://localhost:3000

# System Admin User
SYSTEM_USERNAME=admin
SYSTEM_EMAIL=admin@yourdomain.com
```

3. **Start all services**

```bash
docker compose up -d
```

This will start:

- **DumpStation API** on `http://localhost:8080`
- **DumpStation Web UI** on `http://localhost:3000`
- **PostgreSQL Database** (DumpStation's internal database)
- **MinIO** (optional local S3-compatible storage)

4. **Check deployment status**

```bash
docker compose ps
docker compose logs -f
```

</details>

---

### 🔐 First Login

1. Navigate to `http://localhost:3000`
2. Click **"Login with Discord"**
3. Check your Discord channel for the OTP code
4. Enter the code to authenticate
5. You're in! Start adding databases to backup

### 🗄️ Add Your First Database

- Navigate to **Databases** → **Add Database**
- Enter your PostgreSQL connection details
- Configure storage (S3/R2/MinIO)
- Set backup schedule (cron expression)
- Set rotation policy
- Save and test the connection

Your first backup will run according to the schedule, or you can trigger it manually!

---

## 📚 Documentation

### 📖 Full Documentation

- **[Deployment Guide](docs/DEPLOYMENT.md)** - Detailed deployment instructions for production
- **[Contributing Guide](CONTRIBUTING.md)** - How to contribute to the project
- **[API Documentation](http://localhost:8080/swagger/)** - Interactive Swagger/OpenAPI docs
- **[Backend README](server/README.md)** - Server architecture and development
- **[Frontend README](web/README.md)** - Web interface development
- **[Roadmap](ROADMAP.md)** - Planned features and milestones

### 🔧 Configuration Reference

| Variable                 | Description                            | Required | Default                  |
| ------------------------ | -------------------------------------- | -------- | ------------------------ |
| `SERVER_PORT`            | API server port                        | No       | `8080`                   |
| `DB_HOST`                | PostgreSQL host (DumpStation DB)       | Yes      | `localhost`              |
| `DB_PORT`                | PostgreSQL port                        | Yes      | `5432`                   |
| `DB_USER`                | Database username                      | Yes      | `postgres`               |
| `DB_PASSWORD`            | Database password                      | Yes      | -                        |
| `DB_NAME`                | Database name                          | Yes      | `backup_service`         |
| `JWT_SECRET`             | Secret for JWT signing                 | Yes      | -                        |
| `JWT_EXPIRATION_MINUTES` | JWT token lifetime                     | No       | `10`                     |
| `DISCORD_WEBHOOK_URL`    | Discord webhook for auth/notifications | Yes      | -                        |
| `OTP_EXPIRATION_MINUTES` | OTP code expiration                    | No       | `5`                      |
| `SYSTEM_USERNAME`        | Initial admin username                 | No       | `root`                   |
| `SYSTEM_EMAIL`           | Initial admin email                    | No       | `root@dumpstation.local` |

### 🐳 Docker Deployment

**Production-Ready Deployment:**

Our production setup includes both backend and frontend in a single compose file:

```bash
cd configs
./deploy.sh
```

Or manually:

```bash
cd configs
docker compose up -d
```

**What's Included:**

- Backend API (Port 8080)
- Web Frontend (Port 3000)
- PostgreSQL Database (Internal only)
- Health checks and auto-restart
- Optimized logging with rotation
- Separate internal/external networks

**Using External PostgreSQL:**

Update `.env` in the configs directory:

```env
POSTGRES_PASSWORD=your_external_db_password
# The backend will connect to the 'postgres' service by default
```

**Behind Reverse Proxy (Traefik):**

Add labels to services in `compose.yml`. See [configs/README.md](configs/README.md) for complete Traefik configuration examples with automatic SSL.

---

## 🏗️ Architecture

### Technology Stack

**Backend:**

- **Language**: Go 1.24+
- **Framework**: net/http with gorilla/mux
- **ORM**: GORM with PostgreSQL
- **Authentication**: JWT + Discord OTP + TOTP 2FA
- **Scheduling**: robfig/cron
- **Storage**: AWS SDK (S3/R2 compatible)
- **API Docs**: Swagger/OpenAPI

**Frontend:**

- **Framework**: React 19.2
- **Build Tool**: Vite 7
- **Router**: TanStack Router
- **State**: TanStack Query (React Query)
- **UI**: Radix UI + shadcn/ui + Tailwind CSS
- **Deployment**: Cloudflare Workers

**Infrastructure:**

- **Database**: PostgreSQL 15+ (for DumpStation)
- **Target DBs**: PostgreSQL 12-17 (databases to backup)
- **Storage**: AWS S3, Cloudflare R2, MinIO
- **Container**: Docker with multi-stage builds

### System Architecture

```
┌─────────────────┐
│  React Frontend  │ (TanStack Router + React Query)
│   (Port 7511)    │
└────────┬────────┘
         │ HTTP/REST
         ▼
┌─────────────────┐
│   Go Backend     │ (JWT Auth + Middleware)
│   (Port 8080)    │
└────┬───┬────┬───┘
     │   │    │
     │   │    └─────────────────┐
     │   │                      │
     │   ▼                      ▼
     │  ┌──────────────┐   ┌─────────────┐
     │  │  PostgreSQL  │   │   Discord   │
     │  │  (Internal)  │   │   Webhook   │
     │  └──────────────┘   └─────────────┘
     │
     ▼
┌──────────────────────┐
│   Backup Service      │
│  - Scheduler (cron)   │
│  - pg_dump Runner     │
│  - Version Manager    │
└─────┬────────────────┘
      │
      ├──────────────┬─────────────┐
      ▼              ▼             ▼
  ┌────────┐    ┌────────┐    ┌────────┐
  │   S3    │    │   R2   │    │ MinIO  │
  └────────┘    └────────┘    └────────┘
```

---

## 🎯 Use Cases

### For Solo Developers

- Automated backups for personal projects
- Multiple project databases from one dashboard
- Discord notifications on backup status
- Easy restore for development/testing

### For Small Teams

- Centralized backup management
- Multi-user access with isolation
- Shared storage configurations
- Activity logging and audit trails

### For Organizations

- Multi-tenant architecture
- Role-based access control
- Comprehensive monitoring and statistics
- Production-ready with Docker deployment

---

## 🤝 Contributing

We welcome contributions from the community! Whether it's bug fixes, new features, documentation improvements, or feedback, all contributions are appreciated.

### Quick Links

- **[Contributing Guide](CONTRIBUTING.md)** - How to get started
- **[Code of Conduct](CODE_OF_CONDUCT.md)** - Our community standards
- **[Issue Tracker](https://github.com/monzim/dumpstation/issues)** - Report bugs or request features
- **[Discussions](https://github.com/monzim/dumpstation/discussions)** - Ask questions and share ideas

### Development Setup

```bash
# Backend
cd server
make deps
make dev

# Frontend
cd web
pnpm install
pnpm dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed development guidelines.

---

## 📸 Screenshots

<div align="center">
  
### Dashboard
![Dashboard](docs/screenshots/dashboard.png)
*Overview with real-time statistics and recent backups*

### Database Management

![Database Management](docs/screenshots/databases.png)
_Manage multiple databases with flexible scheduling_

### Database Details

![Database Details](docs/screenshots/database_details.png)
_Detailed view of a single database with backup history and settings_

### Scheduling Configuration

![Scheduling Configuration](docs/screenshots/scheduling.png)
_Set up cron-based backup schedules with ease_

### Backup History

![Backup History](docs/screenshots/backups.png)
_Track all backups with detailed status and one-click restore_

### Backup Restore

![Backup Restore](docs/screenshots/restore.png)
_Easily restore backups to the same or different database_

### Storage Configuration

![Storage Configuration](docs/screenshots/storage.png)
_Configure S3, R2, or MinIO storage providers_

### Notifications Settings

![Notifications Settings](docs/screenshots/notifications.png)
_Set up Discord notifications for backup events_

### Settings

![Settings](docs/screenshots/settings.png)
_Manage user profile, 2FA, and system settings_

</div>

---

## 🗺️ Roadmap

See [ROADMAP.md](ROADMAP.md) for planned features and version milestones.

**Upcoming Features:**

- 📧 Email notification support
- 🔐 Backup encryption at rest
- ✅ Automated backup verification
- 📈 Grafana metrics integration
- 🌍 Multi-region storage replication
- 📦 Incremental backups with WAL archiving

---

## 📝 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2025 Monzim (https://monzim.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

---

## 🙏 Acknowledgments

- Built with ❤️ by [Monzim](https://monzim.com)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/)
- Inspired by the need for simple, reliable database backups

---

## 📬 Contact & Support

- **Website**: [monzim.com](https://monzim.com)
- **Live Demo**: [dumpstation.monzim.com](https://dumpstation.monzim.com)
- **Email**: [me@monzim.com](mailto:me@monzim.com)
- **Issues**: [GitHub Issues](https://github.com/monzim/dumpstation/issues)
- **Discussions**: [GitHub Discussions](https://github.com/monzim/dumpstation/discussions)

---

## ⭐ Star History

If you find this project useful, please consider giving it a star! It helps others discover the project.

[![Star History Chart](https://api.star-history.com/svg?repos=monzim/dumpstation&type=Date)](https://star-history.com/#monzim/dumpstation&Date)

---

<div align="center">
  
  **Made with ❤️ for the open-source community**
  
  [⬆ Back to Top](#️-dumpstation)
  
</div>
