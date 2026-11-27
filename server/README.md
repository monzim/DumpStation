# DumpStation server and agent (Go)

This directory contains both Go binaries:

| Binary | Entry point | Image |
| --- | --- | --- |
| Server (REST API, agent API, scheduler, orchestrator, serves the web UI) | `cmd/server` | `ghcr.io/monzim/dumpstation` (built from the repository root `Dockerfile`) |
| Agent | `cmd/agent` | `ghcr.io/monzim/dumpstation-agent` (built from `Dockerfile.agent`, context `server/`) |

Operator documentation lives in [`../docs`](../docs). This file is for
development. A condensed walkthrough is in [QUICKSTART.md](QUICKSTART.md).

## Requirements

- Go 1.25 (see `go.mod`)
- PostgreSQL for the metadata database (any recent version)
- PostgreSQL client tools (`pg_dump`, `pg_restore`, `psql`) to run backups
  locally. Several majors can be installed side by side; see
  [Tool discovery](#tool-discovery)
- Node 22 and pnpm for the web UI

## Layout

```
cmd/server        server main: config, migrations, orchestrator, scheduler, HTTP
cmd/agent         agent main and subcommands
internal/
  agent           agent runtime: config, connections, enrollment, poll loop, transfers
  agentapi        /agent/v1 handlers, agent auth, rate limits
  agentproto      wire types shared by server and agent
  auth            JWT, OTP, TOTP, Turnstile, client IP
  cleanup         activity log retention (60 days)
  config          server environment variables
  crypto          AES-256-GCM cipher
  database        GORM connection, migrations and backfills, demo seed
  dbadmin         DB Explorer client
  handlers        REST handlers (router.go has the route table; *_v2.go are the v2 resources)
  jobs            orchestrator: lifecycle, agent queue, leases, retention, maintenance
  middleware      auth, CORS, demo restrictions, rate limits, security headers
  models          GORM models and API DTOs
  notification    Discord and Telegram notifiers, webhook SSRF guard
  pgexec          pg_dump/pg_restore execution, plain SQL replay, error classification, host policy
  repository      data access
  scheduler       cron entries per database
  secret          enc:v1 column serializer
  storage         S3 client, multipart presigning
docs/             generated (legacy) Swagger spec served at /swagger/
```

## Running the server

```bash
cd server
cp .env.example .env      # then edit it, see below
set -a && . ./.env && set +a
go run ./cmd/server
```

Minimum settings for local work:

```bash
DB_HOST=localhost
DB_PASSWORD=postgres
DB_NAME=backup_service
JWT_SECRET=dev-only-change-me
DUMPSTATION_SECRET_KEY=$(openssl rand -base64 32)   # keep the same value between runs
PUBLIC_URL=http://localhost:8080
SYSTEM_USERNAME=root
DISCORD_WEBHOOK_URL=          # empty: sign-in codes are printed to the log
TURNSTILE_ENABLED=false
```

Notes on `server/.env.example`: it predates v2 in places. Clear
`DISCORD_WEBHOOK_URL` unless you have a real webhook, set
`TURNSTILE_ENABLED=false` (or keep the always-pass test keys), and add
`DUMPSTATION_SECRET_KEY` and `PUBLIC_URL`. CORS entries are only needed when
the UI is served from another origin.

Migrations run on start. Outside production (`APP_ENV` unset) the demo
account and demo data are seeded and `POST /api/v1/auth/demo-login` is
enabled; set `DEMO_ENABLED=false` to hide it.

Sign in with `SYSTEM_USERNAME`; the code appears in the log as
`Discord notifier not configured, OTP not sent: 123456`.

`make dev` does the same (sources `.env` and runs `go run`), and `air` is
configured in `.air.toml` for live reload.

### Serving the built UI from the server

```bash
(cd ../web && pnpm install && pnpm build)
WEB_DIR=../web/dist go run ./cmd/server
```

The server then serves the SPA at `/` (with history fallback),
`/config.js` with runtime settings, `/api/v1`, `/agent/v1` and `/swagger/`.

## Running the web UI in development

```bash
cd web
pnpm install
pnpm dev                                   # http://localhost:7511
DUMPSTATION_API=http://localhost:8080 pnpm dev   # proxy target (default shown)
```

Vite proxies `/api` and `/config.js` to `DUMPSTATION_API`, so the browser
talks to a single origin and no CORS configuration is needed. The `VITE_*`
variables in `web/.env.example` are not read by the v2 UI. Other scripts:
`pnpm build`, `pnpm typecheck`, `pnpm test`.

## Tests

```bash
cd server
go vet ./...
go test ./...
```

Unit tests cover the crypto cipher, `enc:v1` secrets, retention candidates,
agent model helpers, webhook validation, the SQL scanner and error
classifier, scheduler and masking.

Integration tests are skipped unless a disposable PostgreSQL is configured:

| Variable | Package | Used for |
| --- | --- | --- |
| `TEST_PG_URL` | `internal/pgexec` | Dump + custom restore round trip; plain restore ignoring meta-commands. Needs `pg_dump`/`pg_restore`/`psql` installed |
| `TEST_PG_HOST`, `TEST_PG_PORT`, `TEST_PG_PASSWORD` | `internal/dbadmin` | DB Explorer client |

```bash
docker run -d --name pg-test -e POSTGRES_PASSWORD=ci -p 5432:5432 postgres:16-alpine
TEST_PG_URL='postgres://postgres:ci@localhost:5432/postgres?sslmode=disable' go test ./internal/pgexec/...
```

CI (`.github/workflows/ci.yml`) runs `go vet`, `go test` with `TEST_PG_URL`
against a PostgreSQL 16 service, builds the agent, and builds the web UI.

## Building

```bash
# server binary (version shows in System Health)
go build -ldflags "-X github.com/monzim/db_proxy/v1/internal/handlers.Version=dev" -o dumpstation ./cmd/server

# agent binary (static)
CGO_ENABLED=0 go build -ldflags "-X main.version=dev" -o dumpstation-agent ./cmd/agent
GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -o dumpstation-agent-arm64 ./cmd/agent

# images
docker build -t dumpstation ..                                   # from server/: root Dockerfile, context = repo root
docker build -f Dockerfile.agent -t dumpstation-agent .          # context = server/
```

Release images are built by `.github/workflows/docker-build-push.yml` (server)
and `agent-docker-build.yml` (agent) for linux/amd64 and linux/arm64; the
`VERSION` build argument is the Git ref name.

The Docker targets in `Makefile` (`docker-build`, `docker-up`, ...) refer to
the removed v1 `server/Dockerfile` and a v1 compose setup; use the commands
above instead.

## Running an agent locally

1. Start the server and open **Backup Agents → Add agent** to get a token.
2. Run the agent against it:

   ```bash
   DUMPSTATION_SERVER_URL=http://localhost:8080 \
   DUMPSTATION_ENROLLMENT_TOKEN=dse_... \
   DUMPSTATION_STATE_DIR=$PWD/tmp/agent-state \
   DUMPSTATION_TEMP_DIR=$PWD/tmp/agent-tmp \
   DUMPSTATION_CONN_LOCAL='postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable' \
   DUMPSTATION_ALLOW_RESTORE=true \
   go run ./cmd/agent run
   ```

3. `go run ./cmd/agent connections` and `go run ./cmd/agent tools` show what
   it will report. The agent warns that `http://` is unencrypted; that is
   expected locally.

To exercise the proxy path, set `DUMPSTATION_TRANSFER_MODE=proxy`; to test the
direct path with MinIO, make sure the MinIO endpoint configured in the
storage is resolvable from where the agent runs.

## Tool discovery

`pgexec.DiscoverTools` looks for `pg_dump` in `/usr/lib/postgresql/*/bin`
(Debian/Ubuntu), `/usr/libexec/postgresql*` (Alpine), `/usr/pgsql-*/bin`
(RHEL), Homebrew `postgresql@*` prefixes, `PATH`, and `PG_BIN_DIRS`
(colon-separated). For each server the smallest installed major ≥ the server
major is used for `pg_dump`; the newest is used for `pg_restore`.
`GET /api/v1/system/health` and `dumpstation-agent tools` list what was found.

## Conventions worth knowing

- Never pass passwords on argv or via `PG*` env: `pgexec` writes a 0600
  passfile and scrubs inherited `PG*` variables.
- Secret columns use the GORM tag `serializer:secret`; keep new secret fields
  on it.
- New user-facing failures should return a classified `*pgexec.Error` with a
  code from `internal/pgexec/errors.go`.
- Handlers scope every lookup with the caller's user ID (`*ByUser`
  repository methods) and use `writer(...)` for anything the demo account
  must not do.
- Schema changes go through GORM models plus idempotent statements in
  `internal/database/database.go`; they must be safe to run on every start
  and on v1 databases.
- `make swagger` regenerates the legacy spec in `docs/`; it does not cover
  the v2 handlers yet. [docs/API.md](../docs/API.md) is the maintained
  reference.
