# Deployment

DumpStation ships as two images:

| Image | Contents |
| --- | --- |
| `ghcr.io/monzim/dumpstation` | Server + web UI + PostgreSQL client tools 12–18. Listens on 8080, runs as UID 1000, serves the UI from `WEB_DIR=/app/web` |
| `ghcr.io/monzim/dumpstation-agent` | Agent + PostgreSQL client tools 12–18. No listening ports, runs as UID 10001 |

Both are built for linux/amd64 and linux/arm64. Tags: `latest` (main
branch), semver tags (`2.0.0`, `2.0`, `2`) for releases, and `sha-<short>`.
Pin a version in production.

- [Topologies](#topologies)
  - [Standalone (direct only)](#standalone-direct-only)
  - [With one remote agent](#with-one-remote-agent)
  - [Multiple agents](#multiple-agents)
  - [Agent next to a PostgreSQL container](#agent-next-to-a-postgresql-container)
  - [Agent in a private network](#agent-in-a-private-network)
  - [Agent on Kubernetes](#agent-on-kubernetes)
- [Reverse proxy](#reverse-proxy)
- [Sizing](#sizing)
- [Operations](#operations)
- [Server environment reference](#server-environment-reference)

## Topologies

### Standalone (direct only)

```
 browser ──HTTPS──▶ reverse proxy ──▶ dumpstation:8080 ──▶ postgres (metadata)
                                          │
                                          ├──▶ databases it can reach (pg_dump)
                                          └──▶ object storage
```

Use [`configs/compose.yml`](../configs/compose.yml):

```bash
cd configs
cp .env.example .env
# set POSTGRES_PASSWORD, JWT_SECRET, DUMPSTATION_SECRET_KEY, PUBLIC_URL, SYSTEM_USERNAME
docker compose up -d
```

The metadata database sits on an `internal` network; only the server is
published (port `${DUMPSTATION_PORT:-8080}`). Dumps are staged in the
`dumpstation_backup_tmp` volume. See [configs/README.md](../configs/README.md)
for the helper scripts.

Without Compose:

```bash
docker run -d --name dumpstation -p 8080:8080 \
  -e DB_HOST=db.example.internal -e DB_PASSWORD=... -e DB_NAME=dumpstation \
  -e JWT_SECRET=... -e DUMPSTATION_SECRET_KEY=... \
  -e PUBLIC_URL=https://backups.example.com -e APP_ENV=production \
  -v dumpstation-tmp:/tmp/dumpstation \
  ghcr.io/monzim/dumpstation:2
```

Restrict which hosts the server may connect to with `DIRECT_ALLOWED_CIDRS`
(for example `10.0.0.0/8,192.168.10.0/24`).

### With one remote agent

```
                    ┌─────────── site A ───────────┐        ┌──────── site B (private) ────────┐
 browser ─HTTPS──▶  │ proxy ─▶ dumpstation ─▶ meta │ ◀─HTTPS─┤ dumpstation-agent ─▶ postgres   │
                    └──────────────┬───────────────┘ (agent  └──────────┬───────────────────────┘
                                   │                  initiates)        │ presigned PUT (direct)
                                   ▼                                    ▼
                              object storage ◀──────────────────────────┘
```

1. Deploy the server as above with `PUBLIC_URL` set to a URL reachable from
   site B over HTTPS.
2. **Backup Agents → Add agent**, copy the token.
3. Deploy the agent at site B ([`deploy/agent/compose.yml`](../deploy/agent/compose.yml)
   or the `docker run` snippet from the UI).
4. Add databases with execution mode **Agent**.

Only site B → server (and optionally site B → storage) traffic is needed.

### Multiple agents

Deploy one agent per network boundary (VPC, data centre, Kubernetes cluster,
customer site). Each gets its own enrollment token and identity. Databases
are assigned to one agent each; the server queues jobs per agent and each
agent only sees its own jobs. Agents can be on different versions of the
client tools; the agent page shows what each has installed.

### Agent next to a PostgreSQL container

[`deploy/agent/compose.with-postgres.yml`](../deploy/agent/compose.with-postgres.yml)
runs PostgreSQL on an `internal: true` network (no route to the internet, not
published to the host) and the agent on that network plus an egress network:

```bash
cd deploy/agent
echo 'strong-db-password' > db_password.txt
echo 'DUMPSTATION_SERVER_URL=https://backups.example.com' > .env
echo 'DUMPSTATION_ENROLLMENT_TOKEN=dse_...' >> .env
docker compose -f compose.with-postgres.yml up -d
```

The database is exposed to the agent as the connection `app`.

### Agent in a private network

Typical cases: a database in a private subnet with only NAT egress, an
on-premises server behind a firewall, a managed database reachable only from
inside its VPC.

- Run the agent on any host or container in that network (a small VM, an ECS
  task, a Kubernetes pod).
- Allow egress to `PUBLIC_URL:443`. Allow egress to the storage endpoint for
  direct transfer, or set `DUMPSTATION_TRANSFER_MODE=proxy` if only the
  server is allowed.
- Corporate HTTP proxies: set `HTTPS_PROXY` (and `NO_PROXY` for the database
  hosts if needed).
- Private CA on the server certificate: mount the CA bundle and set
  `DUMPSTATION_CA_FILE`.

### Agent on Kubernetes

See [`deploy/kubernetes/agent.yaml`](../deploy/kubernetes/agent.yaml) and
[AGENTS.md](AGENTS.md#kubernetes). It is a one-replica StatefulSet with a PVC
for the credential, an `emptyDir` for dumps (size it for your largest dump),
a read-only root filesystem and a liveness probe. No Service or Ingress.

## Reverse proxy

The server speaks plain HTTP; terminate TLS in front of it. Requirements:

| Concern | Setting |
| --- | --- |
| TLS | Required for agents in practice (they warn on `http://`) and for secure cookies on GitHub sign-in |
| `PUBLIC_URL` | The external `https://` URL. Used in agent deployment snippets and as the default return URL for GitHub sign-in |
| Long-poll | `GET /agent/v1/jobs/next` is held up to 30 s; agents wait up to 60 s for response headers. Set read/idle timeouts to **at least 60 s** (120 s recommended) |
| Proxy transfers | `PUT /agent/v1/jobs/{id}/artifact` streams a whole backup to the server; `GET` on the same path streams it back for restores. Disable request body size limits and buffering for `/agent/`, and allow long send/read timeouts (hours for large databases) |
| Client IPs | Make the proxy overwrite `X-Forwarded-For` and set `TRUST_PROXY_HEADERS=true` on the server |
| Forwarded host/proto | Pass `Host` and `X-Forwarded-Proto` so derived URLs are correct when `PUBLIC_URL` is not set |
| CORS | Not needed: the UI is served from the same origin |

### Caddy

```caddy
backups.example.com {
    reverse_proxy dumpstation:8080 {
        flush_interval -1
        transport http {
            read_timeout 6h
            write_timeout 6h
        }
    }
}
```

Caddy does not limit request bodies by default.

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name backups.example.com;
    # ssl_certificate ...; ssl_certificate_key ...;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # Agent protocol: long-polls and streamed artifact transfers.
    location /agent/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 0;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_http_version 1.1;
        proxy_read_timeout 6h;
        proxy_send_timeout 6h;
    }
}
```

### Traefik

Raise the entrypoint timeouts (`respondingTimeouts.readTimeout` defaults to
60 s in Traefik v3; set it to `0` or several hours) and do not attach a
buffering middleware with a body limit to `/agent/`.

### Cloudflare and other CDNs

Proxied plans cap request bodies (100 MB on free plans) and hold requests for
about 100 s. Long-polls fit; proxy transfers of large backups do not. Either
let agents upload directly to storage (`auto`/`direct`) or expose the server
for agents on a hostname that bypasses the CDN.

## Sizing

| Resource | Server | Notes |
| --- | --- | --- |
| CPU | 1–2 vCPU | `pg_dump` compression for direct backups. Agents do their own work |
| Memory | 256–512 MiB | Plus about 64 MiB per concurrent upload (16 MiB parts × 4) |
| Temp disk (`BACKUP_TEMP_DIR`) | Largest compressed dump × `BACKUP_CONCURRENCY` | Only for direct backups and direct restores. Proxied agent uploads stream through without touching disk |
| Metadata DB | Small | Grows with backup history, job events and the activity log (activity entries are kept 60 days) |

`BACKUP_CONCURRENCY` (default 2) caps simultaneous direct backups *and*
restores on the server; queued work waits in stage `queued`.

## Operations

- **Health:** `GET /api/v1/health` (unauthenticated, used by the image's
  `HEALTHCHECK`). **System Health** in the UI (`GET /api/v1/system/health`)
  shows version, uptime, metadata DB latency, installed client versions,
  scheduler and job settings and which sign-in methods are enabled.
- **Logs:** `docker compose logs -f dumpstation`. Every backup and restore
  also has an execution log in the UI.
- **Upgrades:** pull the new image and recreate the container; migrations
  run on start. See [UPGRADING.md](UPGRADING.md) for v1 → v2.
- **Back up the metadata database** regularly (`configs/manage.sh backup`
  or your own `pg_dump`), and store `DUMPSTATION_SECRET_KEY` separately.
  Without the metadata DB you still have the artifacts in storage, but not
  the configuration, history or encrypted secrets.
- **Graceful shutdown:** on SIGTERM the server stops the scheduler, drains
  HTTP for up to 30 s, then cancels running direct jobs, which end as
  `interrupted` (any left active are marked so on the next start). Agent
  jobs are unaffected.
- **First administrator:** the user named by `SYSTEM_USERNAME` is created on
  first start and promoted to administrator if no administrator exists. The
  account allowed by `GITHUB_ALLOWED_LOGIN` is created as an administrator on
  its first GitHub sign-in.

## Server environment reference

All variables are read at startup (`server/internal/config/config.go` unless
noted). Invalid numbers or booleans silently fall back to the default.

### Core

| Variable | Default | Description |
| --- | --- | --- |
| `SERVER_HOST` | `0.0.0.0` | Listen address |
| `SERVER_PORT` | `8080` | Listen port |
| `PUBLIC_URL` | (derived from the request) | External base URL, e.g. `https://backups.example.com`. Shown in agent snippets; default return URL for GitHub sign-in. Set it in production |
| `WEB_DIR` | empty (`/app/web` in the image) | Directory with the built web UI. Empty disables UI serving (API only) |
| `TRUST_PROXY_HEADERS` | `false` | Take client IPs from `X-Forwarded-For` / `X-Real-IP` (read in `cmd/server/main.go` and `internal/auth`) |
| `TZ` | `UTC` (image) | Server time zone: used for schedules without their own time zone |

### Metadata database

| Variable | Default | Description |
| --- | --- | --- |
| `DB_HOST` | `localhost` | |
| `DB_PORT` | `5432` | |
| `DB_USER` | `postgres` | |
| `DB_PASSWORD` | **required** | |
| `DB_NAME` | `backup_service` | |
| `DB_SSLMODE` | `disable` | libpq `sslmode` for the metadata connection |

### Secrets and sessions

| Variable | Default | Description |
| --- | --- | --- |
| `JWT_SECRET` | **required** | Signs session tokens and the GitHub OAuth state. `openssl rand -base64 64` |
| `JWT_EXPIRATION_MINUTES` | `30` | Sliding session length; absolute cap is 12 hours |
| `DUMPSTATION_SECRET_KEY` | **required** | Base64-encoded 32-byte AES key for secrets at rest. `openssl rand -base64 32`. Losing it makes stored secrets unrecoverable; changing it breaks decryption of existing values |

### Sign-in

| Variable | Default | Description |
| --- | --- | --- |
| `SYSTEM_USERNAME` | `root` | Initial user (created on first start; read in `cmd/server/main.go`) |
| `SYSTEM_EMAIL` | `root@dumpstation.monzim.com` | Email of the initial user |
| `DISCORD_WEBHOOK_URL` | empty | Receives sign-in codes and start/stop notices. Empty: codes are written to the server log |
| `OTP_EXPIRATION_MINUTES` | `5` | Lifetime of sign-in codes |
| `GITHUB_CLIENT_ID` | empty | GitHub OAuth app |
| `GITHUB_CLIENT_SECRET` | empty | |
| `GITHUB_ALLOWED_LOGIN` | empty | The only GitHub login allowed. GitHub sign-in is enabled when ID, secret and login are all set |
| `GITHUB_REDIRECT_URL` | empty | Required when GitHub is enabled: `https://<host>/api/v1/auth/github/callback` |
| `WEB_ORIGIN` | empty | Where the UI lives, for the GitHub return redirect. Only needed when the UI is served from another origin; defaults to the first `CORS_ALLOWED_ORIGINS` entry, then `PUBLIC_URL` |
| `TURNSTILE_ENABLED` | `false` | Require Cloudflare Turnstile on code requests |
| `TURNSTILE_SITE_KEY` | empty | Public key, delivered to the UI via `/config.js` |
| `TURNSTILE_SECRET_KEY` | empty | |
| `TURNSTILE_TIMEOUT` | `5` | Verification timeout (seconds) |
| `DEMO_ENABLED` | `true` unless `APP_ENV`/`GO_ENV` is `production` | Mounts `POST /auth/demo-login` for the read-only demo account |
| `APP_ENV` / `GO_ENV` | empty | `production` disables demo seeding and the demo default (read in `config.go` and `internal/database/seed_demo.go`) |
| `FORCE_DEMO_SEED` | empty | `true` seeds demo data even in production |

### CORS (only for API calls from another origin)

| Variable | Default |
| --- | --- |
| `CORS_ALLOWED_ORIGINS` | empty (CORS off) |
| `CORS_ALLOWED_METHODS` | `GET,POST,PUT,DELETE,OPTIONS,PATCH` |
| `CORS_ALLOWED_HEADERS` | `Origin,Content-Type,Accept,Authorization,X-Requested-With,X-2FA-Token` |
| `CORS_EXPOSED_HEADERS` | empty |
| `CORS_ALLOW_CREDENTIALS` | `true` (a `*` origin with credentials is refused at startup) |
| `CORS_MAX_AGE` | `86400` |
| `CORS_DEBUG` | `false` |

### Backup execution

| Variable | Default | Description |
| --- | --- | --- |
| `BACKUP_CONCURRENCY` | `2` | Simultaneous direct backups and restores on the server |
| `BACKUP_TIMEOUT_MINUTES` | `360` | Time limit for one backup or restore (server and agents) |
| `BACKUP_TEMP_DIR` | OS temp dir (`/tmp/dumpstation` in the image) | Staging for direct dumps and restores |
| `BACKUP_MIN_FREE_MB` | `0` (off) | Refuse to start a direct dump with less free temp space |
| `DIRECT_ALLOWED_CIDRS` | empty (any host) | Comma-separated CIDRs or IPs the server may connect to (direct jobs, tests, DB Explorer). Connections are pinned to the validated IP |
| `AGENT_JOB_QUEUE_TTL_MINUTES` | `360` | How long an agent job waits to be picked up before failing with `agent_unavailable` |
| `AGENT_JOB_LEASE_SECONDS` | `120` | Lease length; an agent that stops reporting for this long loses the job |
| `AGENT_JOB_MAX_ATTEMPTS` | `3` | Attempts for agent backups after lost leases (restores are never retried) |
| `PG_BIN_DIRS` | empty | Extra colon-separated directories to search for PostgreSQL client tools (`internal/pgexec`) |

### Compose-only variables (`configs/compose.yml`)

| Variable | Default | Description |
| --- | --- | --- |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | `backup_service`, `postgres`, required | Metadata database container; mapped to `DB_*` |
| `DUMPSTATION_VERSION` | `latest` | Image tag |
| `DUMPSTATION_PORT` | `8080` | Published host port |
