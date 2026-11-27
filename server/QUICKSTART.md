# Developer quick start

From a clean checkout to a working local server, UI and agent in about ten
minutes. For production deployment see [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md);
for details see [README.md](README.md).

## 1. Metadata database

```bash
docker run -d --name dumpstation-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=backup_service -p 5432:5432 postgres:16-alpine
```

## 2. Server

```bash
cd server
cat > .env <<EOF
DB_HOST=localhost
DB_PASSWORD=postgres
DB_NAME=backup_service
JWT_SECRET=dev-only-change-me
DUMPSTATION_SECRET_KEY=$(openssl rand -base64 32)
PUBLIC_URL=http://localhost:8080
SYSTEM_USERNAME=root
EOF
set -a && . ./.env && set +a
go run ./cmd/server
```

Keep the generated `DUMPSTATION_SECRET_KEY`: secrets saved with one key cannot
be read with another.

Check it: `curl localhost:8080/api/v1/health` → `{"status":"healthy"}`.

## 3. Web UI

Either build it and let the server serve it:

```bash
(cd ../web && pnpm install && pnpm build)
WEB_DIR=../web/dist go run ./cmd/server      # UI at http://localhost:8080
```

or run Vite with hot reload (proxies `/api` to the server):

```bash
cd web && pnpm install && pnpm dev           # UI at http://localhost:7511
# other server address: DUMPSTATION_API=http://host:8080 pnpm dev
```

## 4. Sign in

Enter `root` on the login page and request a code. With no
`DISCORD_WEBHOOK_URL` the code is printed by the server:

```
[WARNING] ⚠️  Discord notifier not configured, OTP not sent: 123456
```

Or use **Explore the read-only demo** (enabled outside production).

## 5. First backup

1. Start MinIO for storage:

   ```bash
   docker run -d --name minio -p 9000:9000 -p 9001:9001 \
     -e MINIO_ROOT_USER=minio -e MINIO_ROOT_PASSWORD=minio123 \
     minio/minio server /data --console-address :9001
   ```

   Create a bucket `backups` in the console (<http://localhost:9001>).
2. **Storage → Add storage**: provider MinIO, endpoint
   `http://localhost:9000`, bucket `backups`, keys `minio` / `minio123`.
   **Test**.
3. **Databases → Add database**: Direct, host `localhost`, port `5432`,
   database `backup_service`, user `postgres`, password `postgres`.
   **Test connection**, save.
4. **Back up now** and open the backup to watch the execution log.

Local `pg_dump` must be at least as new as the server (16 here). Check
**System Health → PostgreSQL clients**.

## 6. Agent

1. **Backup Agents → Add agent**, copy the token.
2. Run it:

   ```bash
   cd server
   DUMPSTATION_SERVER_URL=http://localhost:8080 \
   DUMPSTATION_ENROLLMENT_TOKEN=dse_... \
   DUMPSTATION_STATE_DIR=$PWD/tmp/agent-state \
   DUMPSTATION_TEMP_DIR=$PWD/tmp/agent-tmp \
   DUMPSTATION_CONN_LOCAL='postgres://postgres:postgres@localhost:5432/backup_service?sslmode=disable' \
   go run ./cmd/agent run
   ```

3. The wizard shows the agent online. Add a database with execution
   **Agent**, pick the agent and the `local` connection.

## 7. Tests

```bash
cd server
go vet ./... && go test ./...
TEST_PG_URL='postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable' go test ./internal/pgexec/...
cd ../web && pnpm typecheck && pnpm test
```

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `DUMPSTATION_SECRET_KEY is required` | Add it to `.env` and re-source it |
| `open secret: ...` | The key changed; restore the old one or recreate the database |
| `version_mismatch` on backup | Install a newer `postgresql-client` or set `PG_BIN_DIRS` |
| UI shows network errors under `pnpm dev` | Server not on `localhost:8080`; set `DUMPSTATION_API` |
| Agent: `enrollment rejected` | Tokens are single-use; issue a new one from the agent page |

More in [../docs/TROUBLESHOOTING.md](../docs/TROUBLESHOOTING.md).
