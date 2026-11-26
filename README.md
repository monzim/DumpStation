<div align="center">
  <img src="web/public/images/og.webp" alt="DumpStation" />

# DumpStation

**Self-hosted PostgreSQL backup manager**

Scheduled `pg_dump` backups to S3-compatible storage, guided restores, and
outbound-only agents for databases in private networks.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go)](https://go.dev/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![Live demo](https://img.shields.io/badge/Live-Demo-success)](https://dumpstation.monzim.com)

</div>

---

## Overview

DumpStation is a single Go server with a built-in web UI. It stores its own
configuration in PostgreSQL, runs `pg_dump` on a schedule, uploads the result
to object storage, verifies it, applies retention and notifies you.

Version 2 adds two things:

- **DumpStation Agents.** A small worker you run next to a database that the
  server cannot reach (private subnet, another cloud, a laptop behind NAT).
  The agent only makes outbound HTTPS requests to the server; you open no
  inbound ports and need no VPN.
- **A redesigned UI** built on Meta's Astryx design system, served directly by
  the server (one image, one origin).

## Features

- **Two ways to back up.** *Direct*: the server connects to the database
  itself. *Agent*: a remote agent runs `pg_dump` inside the private network.
  Both share one job lifecycle, one history and the same retention and
  notification rules.
- **Unified backup history** with filters (database, agent, status, executor,
  trigger, date range, search) and a per-job execution log that shows every
  stage, including lines reported by agents.
- **Scheduling with time zones.** Cron expressions or presets (hourly, every
  N hours, daily, weekly, monthly), an IANA time zone per database, and a
  preview of the next runs. Missed runs (for example while the server was
  down) are detected and reported.
- **Retention that never deletes the newest valid backup.** Keep the last N
  backups or everything from the last N days; the most recent successful
  backup always survives.
- **Verified artifacts.** SHA-256 computed while dumping, object size checked
  in storage before a backup is marked successful, checksum re-checked before
  every restore.
- **Guided restore** into the original database, another configured database
  or a custom target, directly or through an agent, with an optional `--clean`
  and a typed confirmation for anything destructive.
- **Storage:** AWS S3, Cloudflare R2, MinIO and other S3-compatible services.
  Each backup stays pinned to the storage it was written to.
- **Notifications** to Discord webhooks and Telegram bots, per database.
- **Sign-in** with a one-time code (posted to a Discord webhook, or written to
  the server log), GitHub OAuth for one allowed account, TOTP two-factor
  authentication (enforced for GitHub sign-ins too) and optional Cloudflare
  Turnstile.
- **Roles and tenant isolation.** Every resource belongs to a user;
  administrators can see all and manage roles; a read-only demo account is
  optional.
- **Activity log** of logins, configuration changes, backups, restores and
  agent events (kept 60 days).
- **DB Explorer** for browsing PostgreSQL servers: databases, tables, rows,
  ER diagrams, roles and grants.
- PostgreSQL client tools 12 to 18 are bundled; the right `pg_dump` is chosen
  for each server version.

## Architecture

```
                         CONTROL PLANE                                  EXECUTION PLANE
 ┌────────────────────────────────────────────────────────┐
 │ DumpStation server (ghcr.io/monzim/dumpstation)        │
 │                                                        │   direct    ┌──────────────────┐
 │  Web UI (SPA)   REST API /api/v1   Agent API /agent/v1 │────────────▶│ reachable        │
 │  Scheduler · Job orchestrator · Retention · Notifier   │  pg_dump    │ PostgreSQL       │
 │  Direct executor (pg_dump / pg_restore, 12–18)         │             └──────────────────┘
 └───────┬───────────────────────────────▲────────────────┘
         │ metadata                      │ HTTPS, agent-initiated only
         ▼                               │ (enroll, heartbeat, long-poll, events, complete)
 ┌──────────────┐               ┌────────┴───────────────────────────┐
 │ PostgreSQL   │               │ private network                    │
 │ (metadata)   │               │  ┌──────────────────┐   ┌────────┐ │
 └──────────────┘               │  │ DumpStation Agent│──▶│ Postgres│ │
                                │  └────────┬─────────┘   └────────┘ │
                                └───────────┼────────────────────────┘
                                            │ presigned PUT/GET (direct transfer)
                                            ▼          or streamed through the server (proxy)
                                 ┌─────────────────────────────┐
 server ── uploads/verifies ───▶ │ S3 / R2 / MinIO / S3-compat │
                                 └─────────────────────────────┘
```

The server decides *what* runs and *where*; executors (the server itself or
agents) only run whitelisted job kinds. Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start (5 minutes)

Requirements: Docker with Compose v2.

```bash
git clone https://github.com/monzim/DumpStation.git
cd DumpStation/configs
cp .env.example .env
```

Edit `.env` and set at least:

```bash
POSTGRES_PASSWORD=$(openssl rand -base64 24)
JWT_SECRET=$(openssl rand -base64 64)
DUMPSTATION_SECRET_KEY=$(openssl rand -base64 32)   # keep it safe: it decrypts stored secrets
PUBLIC_URL=http://localhost:8080                     # the URL browsers and agents use
SYSTEM_USERNAME=admin
```

Start it:

```bash
docker compose up -d
docker compose logs -f dumpstation
```

Open <http://localhost:8080>, enter `admin` and request a code. Without a
`DISCORD_WEBHOOK_URL` the code is written to the server log:

```bash
docker compose logs dumpstation | grep "OTP not sent"
```

Then, in the UI:

1. **Storage** → add a bucket (S3, R2, MinIO or S3-compatible) and run the test.
2. **Databases** → add a database, choose **Direct**, test the connection,
   pick a schedule, time zone and retention.
3. Click **Back up now** and follow the job log.

Enable two-factor authentication under **Settings** before exposing the
server. For production (TLS, reverse proxy, sizing) see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Add a private database with an agent

1. In the UI open **Backup Agents → Add agent**, name it and create it. You get
   a single-use enrollment token (valid 1 hour by default) and ready-made
   deployment snippets.
2. On a host that can reach the database (and reach `PUBLIC_URL` over HTTPS):

   ```bash
   docker run -d --name dumpstation-agent --restart unless-stopped \
     -e DUMPSTATION_SERVER_URL=https://dumpstation.example.com \
     -e DUMPSTATION_ENROLLMENT_TOKEN=dse_... \
     -e DUMPSTATION_CONN_ORDERS='postgres://backup_user:secret@10.0.0.12:5432/orders' \
     -v dumpstation-agent-state:/var/lib/dumpstation-agent \
     ghcr.io/monzim/dumpstation-agent:latest
   ```

   `DUMPSTATION_CONN_ORDERS` defines a local connection named `orders`. Its
   password never leaves the agent host.
3. The wizard shows the agent as online. Go to **Databases → Add database**,
   choose **Agent**, pick the agent and the `orders` connection, test it and
   save.

Compose, Kubernetes and binary installs, password files and restores through
agents are covered in [docs/AGENTS.md](docs/AGENTS.md).

## Documentation

| Document | Contents |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, job lifecycle, agent protocol, data transfer, failure handling |
| [docs/AGENTS.md](docs/AGENTS.md) | Installing and operating agents, connections, restore enablement, env reference |
| [docs/BACKUP_AND_RESTORE.md](docs/BACKUP_AND_RESTORE.md) | Databases, storage providers, schedules, retention, downloads, restores |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment topologies, reverse proxy, full server env reference |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model and security controls |
| [docs/UPGRADING.md](docs/UPGRADING.md) | Upgrading from v1 to v2 |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Error codes and common problems |
| [docs/API.md](docs/API.md) | REST API and agent protocol reference |
| [docs/TURNSTILE_INTEGRATION.md](docs/TURNSTILE_INTEGRATION.md) | Cloudflare Turnstile on the login page |
| [configs/README.md](configs/README.md) | The production Compose bundle and helper scripts |
| [server/README.md](server/README.md) | Developer setup, tests, building |
| [ROADMAP.md](ROADMAP.md) | What shipped and what is next |

## Screenshots

| | |
| --- | --- |
| ![Overview](docs/screenshots/overview.png) Overview | ![Databases](docs/screenshots/databases.png) Databases |
| ![Database detail](docs/screenshots/database-detail.png) Database detail | ![Add database](docs/screenshots/add-database.png) Add database |
| ![Backups](docs/screenshots/backups.png) Backup history | ![Backup detail](docs/screenshots/backup-detail.png) Backup detail and job log |
| ![Restore](docs/screenshots/restore.png) Guided restore | ![Agents](docs/screenshots/agents.png) Backup agents |
| ![Agent onboarding](docs/screenshots/agent-onboarding.png) Agent onboarding | ![Storage](docs/screenshots/storage.png) Storage |
| ![Settings](docs/screenshots/settings.png) Settings | |

## Contributing

Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md)
and [server/README.md](server/README.md) for the development setup.

## License

MIT. See [LICENSE](LICENSE).
