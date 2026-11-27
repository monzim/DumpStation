# Production Compose bundle

This directory runs DumpStation v2 with Docker Compose: one server container
(API + web UI) and its PostgreSQL metadata database. Agents for private
databases are deployed separately, next to those databases; see
[`../deploy/agent/`](../deploy/agent/) and [docs/AGENTS.md](../docs/AGENTS.md).

| File | Purpose |
| --- | --- |
| `compose.yml` | Services `postgres` (metadata) and `dumpstation` (`ghcr.io/monzim/dumpstation`) |
| `.env.example` | Template for `.env` |
| `deploy.sh` | Interactive first deployment: checks Docker, validates `.env`, pulls, starts |
| `manage.sh` | Day-2 helper: start/stop/logs/update/backup/restore of the metadata DB |

## Layout

```
            dumpstation_external                     dumpstation_internal (internal: true)
 :8080 ──▶ ┌─────────────────────────────┐          ┌──────────────────────┐
           │ dumpstation                 │ ───────▶ │ postgres:16-alpine   │
           │  UI + /api/v1 + /agent/v1   │          │ volume: dumpstation_ │
           │  volume: dumpstation_       │          │   postgres_data      │
           │    backup_tmp (/tmp/...)    │          └──────────────────────┘
           └─────────────────────────────┘
```

The metadata database is not reachable from outside the Compose project.
Only the server publishes a port (`${DUMPSTATION_PORT:-8080}`); put a TLS
reverse proxy in front of it ([docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md#reverse-proxy)).

## First start

```bash
cp .env.example .env
```

Required in `.env`:

| Variable | How to generate |
| --- | --- |
| `POSTGRES_PASSWORD` | `openssl rand -base64 24` |
| `JWT_SECRET` | `openssl rand -base64 64` |
| `DUMPSTATION_SECRET_KEY` | `openssl rand -base64 32`. Encrypts stored secrets; back it up, never change it |
| `PUBLIC_URL` | The URL users and agents reach, e.g. `https://backups.example.com` |
| `SYSTEM_USERNAME` / `SYSTEM_EMAIL` | The initial administrator you sign in as |

Then either `./deploy.sh` or:

```bash
docker compose up -d
docker compose logs -f dumpstation
```

Open `PUBLIC_URL` (or `http://localhost:8080`) and sign in with
`SYSTEM_USERNAME`. Without `DISCORD_WEBHOOK_URL` the one-time code is printed
in the server log:

```bash
docker compose logs dumpstation | grep "OTP not sent"
```

## Variables passed by `compose.yml`

| Group | Variables |
| --- | --- |
| Metadata DB | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` (mapped to `DB_*`) |
| Secrets | `JWT_SECRET`, `DUMPSTATION_SECRET_KEY`, `JWT_EXPIRATION_MINUTES` |
| URLs and proxy | `PUBLIC_URL`, `TRUST_PROXY_HEADERS` |
| Sign-in | `SYSTEM_USERNAME`, `SYSTEM_EMAIL`, `DISCORD_WEBHOOK_URL`, `OTP_EXPIRATION_MINUTES`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_ALLOWED_LOGIN`, `GITHUB_REDIRECT_URL`, `TURNSTILE_ENABLED`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `APP_ENV` (default `production`), `DEMO_ENABLED` (default `false`) |
| Execution | `BACKUP_CONCURRENCY`, `BACKUP_TIMEOUT_MINUTES`, `AGENT_JOB_QUEUE_TTL_MINUTES`, `DIRECT_ALLOWED_CIDRS` |
| Image and port | `DUMPSTATION_VERSION` (tag, default `latest`), `DUMPSTATION_PORT` |

Any other server variable (for example `TURNSTILE_TIMEOUT`,
`CORS_ALLOWED_ORIGINS`, `AGENT_JOB_LEASE_SECONDS`, `AGENT_JOB_MAX_ATTEMPTS`,
`BACKUP_MIN_FREE_MB`) must be added to the `environment:` block of the
`dumpstation` service to take effect; setting it in `.env` alone is not
enough. The full list is in
[docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md#server-environment-reference).

## GitHub sign-in

Create an OAuth app at <https://github.com/settings/developers> with the
callback `https://<your-host>/api/v1/auth/github/callback`, then set
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_ALLOWED_LOGIN` and
`GITHUB_REDIRECT_URL` (same callback URL). `WEB_ORIGIN` is not needed: the UI
is served by the same server.

## manage.sh

```bash
./manage.sh start | stop | restart | status
./manage.sh logs [-f] [service]       # service: dumpstation or postgres
./manage.sh update                    # pull, recreate, prune old images
./manage.sh backup                    # pg_dump of the metadata DB to ./backups/*.sql.gz
./manage.sh restore <file[.gz]>       # replay a dump into the metadata DB (asks for confirmation)
./manage.sh shell dumpstation         # pass the service name explicitly
./manage.sh health
./manage.sh clean | reset             # reset destroys all data
```

`backup` and `restore` assume the default `postgres` user and
`backup_service` database.

## Updating

```bash
docker compose pull && docker compose up -d
```

Migrations run automatically on start. Pin `DUMPSTATION_VERSION` to a release
tag in production. Coming from v1 (separate `backend` and `web` services)?
Read [docs/UPGRADING.md](../docs/UPGRADING.md) first; in particular, the v1
bundle used `postgres:15-alpine` while this one uses `postgres:16-alpine`.

## Production checklist

- TLS reverse proxy with timeouts ≥ 60 s and no body limit for `/agent/`.
- `PUBLIC_URL` set to the HTTPS URL; `TRUST_PROXY_HEADERS=true` behind your
  proxy.
- `DEMO_ENABLED=false`, two-factor authentication enabled for every user.
- Regular `./manage.sh backup` of the metadata DB, stored off-host, and the
  secret key stored separately.
- Enough space in the `dumpstation_backup_tmp` volume for your largest
  compressed dump times `BACKUP_CONCURRENCY`.
