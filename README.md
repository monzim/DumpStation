<div align="center">

<img src="docs/assets/banner.png" alt="DumpStation: PostgreSQL backups you can actually restore" width="100%" />

<br />

<img src="docs/assets/logo.svg" alt="" width="56" height="56" />

# DumpStation

**Self-hosted PostgreSQL backups you can actually restore.**

Scheduled `pg_dump` to any S3-compatible bucket, verified on upload, restorable
in a few clicks, with outbound-only agents for databases in private networks.

[Website](https://dumpstation.monzim.com) ·
[Live demo](https://dumpstation.monzim.com/demo/) ·
[Docs](https://dumpstation.monzim.com/docs/) ·
[Quick start](#quick-start) ·
[Roadmap](ROADMAP.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-ededed?style=flat-square&labelColor=0a0a0a)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.25-00ADD8?style=flat-square&logo=go&logoColor=white&labelColor=0a0a0a)](https://go.dev/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white&labelColor=0a0a0a)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-12%E2%80%9318-4169E1?style=flat-square&logo=postgresql&logoColor=white&labelColor=0a0a0a)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/ghcr.io-monzim%2Fdumpstation-2496ED?style=flat-square&logo=docker&logoColor=white&labelColor=0a0a0a)](https://github.com/monzim/DumpStation/pkgs/container/dumpstation)

</div>

---

## Why DumpStation

Most backups are only tested on the worst day of the year. DumpStation runs
`pg_dump` on a schedule, ships every artifact to your bucket, proves it got
there, and gives you a guided way back. It is one Go server with a built-in
web UI and one Docker image. Your backups are plain `pg_dump` files: you can
restore them with or without DumpStation.

<img src="docs/screenshots/overview.png" alt="Overview: protected databases, failures, success rate, running jobs, agents, backup history and upcoming runs" width="100%" />

## Features

**Backups**
- **Two ways to reach a database.** *Direct*: the server connects itself.
  *Agent*: a small worker inside the private network runs `pg_dump` there.
  Both share one job lifecycle, history, retention and alerting.
- **Schedules with time zones.** Cron or presets per database, an IANA time
  zone, a preview of the next runs and missed-run detection.
- **Verified artifacts.** SHA-256 computed while dumping, object size checked
  in storage before a backup counts as successful, checksum re-checked before
  every restore.
- **Retention that never deletes the newest good backup.** Keep the last N or
  everything from the last N days.
- **The right client, every time.** `pg_dump` and `pg_restore` 12 to 18 are
  bundled and matched to each server's version.

**Restores**
- **Guided restore wizard** into the original database, another configured
  database or a custom target, directly or through an agent.
- `--clean` and anything destructive sits behind a typed confirmation.

**Storage and alerts**
- AWS S3, Cloudflare R2, MinIO and other S3-compatible services. Each backup
  stays pinned to the storage it was written to.
- Discord and Telegram notifications per database, with typed error codes
  such as `auth_failed`, `version_mismatch` or `agent_lost`.

**Agents**
- Outbound HTTPS only: no inbound ports, no VPN.
- Database passwords can stay on the agent host; the server only sees a
  connection name.
- Single-use enrollment tokens, revocable credentials, restores disabled unless
  enabled on both sides.

**Security and operations**
- Secrets encrypted at rest with AES-256-GCM under your own key.
- Passwordless sign-in (one-time code via Discord or the server log), GitHub
  OAuth for one allowed account, TOTP 2FA and optional Cloudflare Turnstile.
- Roles and tenant isolation, an optional read-only demo account, an activity
  log kept 60 days, and downloads behind a one-time code.
- DB Explorer for databases, tables, rows, roles and ER diagrams; a ⌘K command
  menu; light, dark and pitch-black themes.

## Screenshots

| | |
| --- | --- |
| <img src="docs/screenshots/databases.png" alt="Databases" /> **Databases** with health, schedule and storage | <img src="docs/screenshots/database-detail.png" alt="Database detail" /> **Database detail** and its configuration |
| <img src="docs/screenshots/backups.png" alt="Backups" /> **Backup history** with filters | <img src="docs/screenshots/backup-detail.png" alt="Backup detail" /> **Backup detail**, lifecycle and execution log |
| <img src="docs/screenshots/restore.png" alt="Restore wizard" /> **Guided restore** | <img src="docs/screenshots/add-database.png" alt="Add database" /> **Add database**, direct or through an agent |
| <img src="docs/screenshots/agents.png" alt="Backup agents" /> **Backup agents** | <img src="docs/screenshots/agent-onboarding.png" alt="Agent onboarding" /> **Agent onboarding** with ready-made snippets |
| <img src="docs/screenshots/schedules.png" alt="Schedules" /> **Schedules** across databases | <img src="docs/screenshots/storage.png" alt="Storage" /> **Storage** destinations |
| <img src="docs/screenshots/system.png" alt="System health" /> **System health** | <img src="docs/screenshots/settings.png" alt="Settings" /> **Settings** |

Screenshots are from the [live demo](https://dumpstation.monzim.com/demo/),
which runs the real interface against sample data in your browser.

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
 └──────────────┘               │  │ DumpStation Agent│──▶│Postgres│ │
                                │  └────────┬─────────┘   └────────┘ │
                                └───────────┼────────────────────────┘
                                            │ presigned PUT/GET (direct transfer)
                                            ▼          or streamed through the server (proxy)
                                 ┌─────────────────────────────┐
 server ── uploads/verifies ───▶ │ S3 / R2 / MinIO / S3-compat │
                                 └─────────────────────────────┘
```

The server decides *what* runs and *where*; executors (the server itself or
agents) only run whitelisted job kinds. Details:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start

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

1. **Storage**: add a bucket (S3, R2, MinIO or S3-compatible) and run the test.
2. **Databases**: add a database, choose **Direct**, test the connection,
   pick a schedule, time zone and retention.
3. Click **Back up now** and follow the job log.

Enable two-factor authentication under **Settings** before exposing the
server. For TLS, reverse proxies and sizing see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) or the
[web docs](https://dumpstation.monzim.com/docs/), which also generate a
ready-to-use `.env` and Caddyfile for your domain.

## Back up a private database with an agent

1. In the UI open **Backup Agents → Add agent**, name it and create it. You get
   a single-use enrollment token (valid 1 hour by default) and ready-made
   Docker, Compose, Kubernetes and systemd snippets.
2. On a host that can reach the database and your `PUBLIC_URL` over HTTPS:

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

Password files, YAML connections and restores through agents are covered in
[docs/AGENTS.md](docs/AGENTS.md).

## Documentation

| Document | Contents |
| --- | --- |
| [Web docs](https://dumpstation.monzim.com/docs/) | Install, every environment variable, reverse proxies, agents, error codes |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, job lifecycle, agent protocol, data transfer, failure handling |
| [docs/AGENTS.md](docs/AGENTS.md) | Installing and operating agents, connections, restore enablement |
| [docs/BACKUP_AND_RESTORE.md](docs/BACKUP_AND_RESTORE.md) | Databases, storage providers, schedules, retention, downloads, restores |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment topologies, reverse proxy, full server env reference |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model and security controls |
| [docs/UPGRADING.md](docs/UPGRADING.md) | Upgrading from v1 to v2 |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Error codes and common problems |
| [docs/API.md](docs/API.md) | REST API and agent protocol reference |
| [docs/TURNSTILE_INTEGRATION.md](docs/TURNSTILE_INTEGRATION.md) | Cloudflare Turnstile on the login page |
| [configs/README.md](configs/README.md) | The production Compose bundle and helper scripts |
| [server/README.md](server/README.md) | Developer setup, tests, building |
| [site/README.md](site/README.md) | The website, web docs and live demo (Cloudflare Worker) |
| [ROADMAP.md](ROADMAP.md) | What shipped and what is next |

## Repository layout

```
server/     Go server and agent (cmd/server, cmd/agent)
web/        React UI on the Astryx design system, served by the server
site/       Website, web docs and live demo (Cloudflare Workers)
configs/    Production Docker Compose bundle and helper scripts
deploy/     Agent Compose files and Kubernetes manifest
docs/       Guides, screenshots and assets
```

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md)
and [server/README.md](server/README.md) for the development setup.

## Author

<a href="https://monzim.com"><img src="site/public/assets/me/azraf-160.webp" alt="Azraf Al Monzim" width="64" height="64" align="left" style="border-radius:50%" /></a>

Built and maintained by **[Azraf Al Monzim](https://monzim.com)**, a platform
engineer in Dhaka. [monzim.com](https://monzim.com) ·
[GitHub](https://github.com/monzim) ·
[LinkedIn](https://www.linkedin.com/in/monzim)

<br clear="left" />

## License

MIT. See [LICENSE](LICENSE).
