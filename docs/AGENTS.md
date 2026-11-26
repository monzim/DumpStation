# DumpStation Agents

A DumpStation Agent is a small worker that backs up (and optionally restores)
PostgreSQL databases the server cannot reach directly. It runs inside the
private network, makes **outbound HTTPS requests only** to your DumpStation
server, and executes only three job kinds: `backup`, `restore` and
`test_connection`.

- [Requirements](#requirements)
- [Registration flow](#registration-flow)
- [Installation](#installation): [Docker](#docker) · [Compose](#docker-compose) · [Kubernetes](#kubernetes) · [Binary](#binary-and-systemd)
- [Configuring databases](#configuring-databases)
- [Multiple agents](#multiple-agents)
- [Restores through an agent](#restores-through-an-agent)
- [Transfer modes and storage reachability](#transfer-modes-and-storage-reachability)
- [Resource sizing](#resource-sizing)
- [Health checks and monitoring](#health-checks-and-monitoring)
- [Credentials: rotation, revocation, re-enrollment](#credentials-rotation-revocation-re-enrollment)
- [Environment reference](#environment-reference)
- [CLI](#cli)

## Requirements

| Needs | Why |
| --- | --- |
| Outbound HTTPS to the server's `PUBLIC_URL` | All control traffic and, in proxy mode, artifact transfers |
| Network access to the databases it backs up | `pg_dump` / `pg_restore` connect from the agent host |
| Outbound HTTPS to the object storage endpoint (optional) | Direct uploads with presigned URLs. Without it the agent uploads through the server |
| A persistent directory for its state | Holds the credential issued at enrollment |
| Temp disk at least as large as your biggest compressed dump | Dumps are written to disk before upload |
| PostgreSQL client tools | Bundled in the image (12–18). For the binary, `pg_dump`, `pg_restore` and `psql` must be installed |

No inbound ports, published services, VPNs or storage credentials are
needed on the agent side.

## Registration flow

1. **Backup Agents → Add agent.** Enter a name, an optional description,
   whether restores are allowed (off by default) and the enrollment token
   lifetime (15 minutes, 1 hour or 24 hours in the UI; the API accepts 10 to
   1440 minutes).
2. **Deploy.** The UI shows the single-use enrollment token once, together
   with ready-to-copy snippets for `docker run`, Compose, Kubernetes and a
   binary/systemd install. The server URL in the snippets comes from
   `PUBLIC_URL`; the UI warns if it points at `localhost`.
3. **Connect.** Start the agent. It enrolls, stores its credential, and the
   wizard flips to *online*. The agent page then lists its version, platform,
   installed PostgreSQL client versions, local connection names, transfer
   modes and restore setting.
4. **Next steps.** Add a database that uses the agent
   (**Databases → Add database → Agent**).

Activity log entries are written for agent creation, token issue,
registration, connect/disconnect, enable/disable, revoke and deletion.

## Installation

The image is `ghcr.io/monzim/dumpstation-agent` (linux/amd64 and
linux/arm64). It runs as UID 10001, keeps state in
`/var/lib/dumpstation-agent` (declared as a volume) and dumps in
`/tmp/dumpstation`.

### Docker

```bash
docker volume create dumpstation-agent-state
docker run -d --name dumpstation-agent --restart unless-stopped \
  -e DUMPSTATION_SERVER_URL=https://dumpstation.example.com \
  -e DUMPSTATION_ENROLLMENT_TOKEN=dse_... \
  -e DUMPSTATION_CONN_MAIN='postgres://backup:secret@db.internal:5432/app' \
  -v dumpstation-agent-state:/var/lib/dumpstation-agent \
  ghcr.io/monzim/dumpstation-agent:latest
```

Leaving `DUMPSTATION_ENROLLMENT_TOKEN` set after enrollment is harmless: the
agent remembers which token it used and only re-enrolls when the value
changes.

### Docker Compose

Two ready-made files live in [`deploy/agent/`](../deploy/agent/):

| File | Use it when |
| --- | --- |
| [`compose.yml`](../deploy/agent/compose.yml) | The agent runs next to existing databases. Uses a Docker secret for the password and a temp volume |
| [`compose.with-postgres.yml`](../deploy/agent/compose.with-postgres.yml) | You run PostgreSQL in the same Compose project. The database sits on an `internal: true` network with no internet route; the agent is on that network plus an egress network |

```bash
cd deploy/agent
echo 'the-db-password' > orders_password.txt
cat > .env <<'EOF'
DUMPSTATION_SERVER_URL=https://dumpstation.example.com
DUMPSTATION_ENROLLMENT_TOKEN=dse_...
EOF
docker compose up -d
docker compose logs -f
```

Edit the `DUMPSTATION_CONN_*` lines to match your databases.

### Kubernetes

[`deploy/kubernetes/agent.yaml`](../deploy/kubernetes/agent.yaml) is a
single-replica StatefulSet with a 64 Mi PVC for state, an `emptyDir` temp
volume (20 Gi limit), a read-only root filesystem, all capabilities dropped,
and an exec liveness probe running `dumpstation-agent healthcheck`.

```bash
kubectl create namespace dumpstation
kubectl -n dumpstation create secret generic dumpstation-agent \
  --from-literal=enrollment-token=dse_... \
  --from-literal=orders-password='...'
# edit DUMPSTATION_SERVER_URL and the connection in agent.yaml
kubectl -n dumpstation apply -f deploy/kubernetes/agent.yaml
kubectl -n dumpstation logs -f statefulset/dumpstation-agent
```

No Service or Ingress is needed. If you use NetworkPolicies, allow egress to
the DumpStation server, to the databases, to DNS and (for direct uploads) to
the storage endpoint. Keep `replicas: 1`: each replica would need its own
agent identity. For more capacity deploy another agent (see
[Multiple agents](#multiple-agents)).

### Binary and systemd

Copy the binary out of the image (or build it with
`cd server && CGO_ENABLED=0 go build -o dumpstation-agent ./cmd/agent`):

```bash
docker cp "$(docker create ghcr.io/monzim/dumpstation-agent:latest)":/usr/local/bin/dumpstation-agent /usr/local/bin/
sudo mkdir -p /etc/dumpstation-agent /var/lib/dumpstation-agent
sudo tee /etc/dumpstation-agent/agent.env >/dev/null <<'EOF'
DUMPSTATION_SERVER_URL=https://dumpstation.example.com
DUMPSTATION_ENROLLMENT_TOKEN=dse_...
DUMPSTATION_STATE_DIR=/var/lib/dumpstation-agent
DUMPSTATION_TEMP_DIR=/var/tmp/dumpstation
DUMPSTATION_CONN_MAIN=postgres://backup:secret@127.0.0.1:5432/app
EOF
sudo chmod 600 /etc/dumpstation-agent/agent.env
```

`/etc/systemd/system/dumpstation-agent.service`:

```ini
[Unit]
Description=DumpStation Agent
After=network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=/etc/dumpstation-agent/agent.env
ExecStart=/usr/local/bin/dumpstation-agent run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now dumpstation-agent
journalctl -u dumpstation-agent -f
```

The binary looks for client tools in `/usr/lib/postgresql/*/bin`,
`/usr/libexec/postgresql*`, `/usr/pgsql-*/bin`, Homebrew prefixes, `PATH`,
and any directories listed in `PG_BIN_DIRS` (colon-separated). Check with
`dumpstation-agent tools`. Outside the image `DUMPSTATION_TEMP_DIR` defaults
to the OS temp directory, so set it to a disk with enough space.

## Configuring databases

A database that uses an agent can get its credentials in one of two ways.

| | Agent-local connection (recommended) | Central credentials |
| --- | --- | --- |
| Where the password lives | Only on the agent host | Encrypted in the DumpStation metadata database |
| How the agent gets it | From its own env vars or connections file | Inside each job payload (stored encrypted, sent over TLS) |
| What you enter in the UI | Agent + connection name | Agent + host, port, database, user, password |
| Changing the password | Edit the agent config, restart the agent | Edit the database in the UI |

With an agent-local connection the server stores no host, user or password
for that database at all.

### Environment variables

```bash
DUMPSTATION_CONN_ORDERS=postgres://backup_user@db.internal:5432/orders?sslmode=require
DUMPSTATION_CONN_ORDERS_PASSWORD_FILE=/run/secrets/orders_password
```

- The connection name is the part after `DUMPSTATION_CONN_`, **lower-cased
  with `_` replaced by `-`**: `DUMPSTATION_CONN_SHOP_EU` becomes `shop-eu`.
- The value is a `postgres://` or `postgresql://` URL. Supported query
  parameter: `sslmode` (`disable`, `allow`, `prefer`, `require`,
  `verify-ca`, `verify-full`; default `prefer`).
- `DUMPSTATION_CONN_<NAME>_PASSWORD_FILE` reads the password from a file and
  overrides any password in the URL. Use it with Docker or Kubernetes
  secrets.
- To keep the whole URL in a file, set `DUMPSTATION_CONN_<NAME>_FILE` and
  define `DUMPSTATION_CONN_<NAME>` as an empty variable.

### Connections file

`DUMPSTATION_CONNECTIONS_FILE` (default
`/etc/dumpstation-agent/connections.yaml`; YAML or JSON). See
[`deploy/agent/connections.example.yaml`](../deploy/agent/connections.example.yaml).

```yaml
connections:
  orders:
    url: postgres://backup_user@orders-db.internal:5432/orders?sslmode=require
    password_file: /run/secrets/orders_password
  analytics:
    host: 10.20.0.15
    port: 5432
    database: analytics
    user: backup
    password_env: ANALYTICS_DB_PASSWORD
    sslmode: prefer
```

- Names may use letters, digits, `-`, `_` and `.` (max 128). Names are used
  exactly as written.
- Fields given next to `url` override the URL's parts.
- Password precedence: `password_file`, then `password_env`, then
  `password`.
- An entry that fails validation is skipped with a warning in the log; the
  agent still starts.
- If an environment variable and the file define the same name, the
  environment variable wins.

Connections are read at startup. **Restart the agent after changing them.**
Run `dumpstation-agent connections` to see what it will report (names,
databases and hosts; never passwords).

### Database user permissions

Backups need a role that can read every object in the database (`CONNECT`
on the database, `USAGE` on schemas, `SELECT` on tables and sequences; the
database owner or a role with `pg_read_all_data` on PostgreSQL 14+ works).
Restores need a role that can create the objects in the target database.

### Adding the database in the UI

**Databases → Add database → Agent**, choose the agent, then either pick one
of the connection names it reported or switch to central credentials. **Test
connection** queues a `test_connection` job on the agent and shows the
result (server version, chosen `pg_dump` version, latency, or a classified
error). Agents that are not `active` cannot run tests.

## Multiple agents

- Each agent has its own identity, credential and connections. A database is
  assigned to exactly one agent; one agent can serve many databases.
- Use one agent per network segment, site or cluster. To spread load, assign
  databases to different agents or raise `DUMPSTATION_MAX_CONCURRENCY`.
- Do not run two processes with the same state directory or credential: both
  would lease jobs as the same agent.
- An agent cannot be deleted while databases are assigned to it; reassign
  them first. Moving a database to another agent only affects future jobs.
- Labels on agents are informational (shown in the UI); they do not route
  jobs.

## Restores through an agent

Restores are destructive, so an agent runs them only when **both** switches
are on:

1. **Server side:** *Allow restores* on the agent (set when creating it or on
   its settings tab; API field `allow_restore`).
2. **Agent side:** `DUMPSTATION_ALLOW_RESTORE=true` in the agent's
   environment (reported as `agent_allow_restore`).

The agent page shows the combined state, including "allowed on the server,
but the agent does not set DUMPSTATION_ALLOW_RESTORE=true". Until both are on,
the server refuses to create restore jobs for that agent, does not hand any
restore job to it, and the agent itself rejects restore jobs.

See [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md#restore) for the restore
workflow.

## Transfer modes and storage reachability

`DUMPSTATION_TRANSFER_MODE`:

| Mode | Upload | Restore download | Use when |
| --- | --- | --- | --- |
| `auto` (default) | Direct with presigned multipart URLs; falls back to proxy if the first part fails twice | Presigned GET; falls back to proxy | Most setups |
| `direct` | Direct only; failure fails the job | Direct only | Storage is reachable and you do not want artifacts flowing through the server |
| `proxy` | Streamed through `PUT /agent/v1/jobs/{id}/artifact` | Streamed from the server | The agent network can reach the server but not the storage endpoint |

Notes:

- Presigned URLs are scoped to one object (and for uploads one part) and
  expire (30 minutes per part URL, 1 hour for restore downloads). The agent
  never holds storage credentials.
- Bucket CORS settings are irrelevant: the agent is not a browser.
- After an `auto` fallback the agent stays in proxy mode until it restarts.
  The job log records the fallback and the reason.
- Proxy mode moves the whole artifact through the server and its reverse
  proxy; see the proxy settings in [DEPLOYMENT.md](DEPLOYMENT.md#reverse-proxy).
- Outbound HTTP proxies are honoured via `HTTPS_PROXY` / `HTTP_PROXY` /
  `NO_PROXY`.

## Resource sizing

| Resource | Guidance |
| --- | --- |
| CPU | `pg_dump` compression (level 6) dominates. 1 vCPU per concurrent job is comfortable |
| Memory | The agent itself is small (the Kubernetes example requests 64 Mi, limits 512 Mi). Uploads stream one 64 MiB part at a time per job |
| Temp disk | One compressed dump per concurrent job (backups) or one artifact (restores). Set `DUMPSTATION_MIN_FREE_MB` to fail fast instead of filling the disk |
| State disk | A few KB (`credentials.json`, `last-contact`) |
| Concurrency | `DUMPSTATION_MAX_CONCURRENCY` (1–16, default 1). Each slot is one long-poll loop; the server also enforces the limit when leasing |
| Network | Outbound HTTPS only. Long-polls hold a request for up to 30 s |

## Health checks and monitoring

- `dumpstation-agent healthcheck` exits 0 if the agent reached the server in
  the last 2 minutes (it reads `$DUMPSTATION_STATE_DIR/last-contact`). The
  image uses it as its Docker `HEALTHCHECK`; the Kubernetes example uses it as
  a liveness probe.
- The agent heartbeats every 20 s. The server considers it online if it made
  any request in the last 90 s.
- Connect/disconnect transitions create activity entries and notify the
  channels of the databases assigned to the agent.
- The overview page counts online, offline, disabled and pending agents; the
  agent page shows recent failures and the last failed backup.
- Agent logs are plain text with UTC timestamps (`docker logs`,
  `journalctl`, `kubectl logs`). Job progress is also mirrored into each
  job's execution log in the UI, so most investigations do not need the
  agent logs.

## Credentials: rotation, revocation, re-enrollment

| Goal | Steps |
| --- | --- |
| Rotate the credential | Agent page → **⋯ → Rotate credential / redeploy**. Put the new token in `DUMPSTATION_ENROLLMENT_TOKEN` and restart. The agent sees the token changed, enrolls again, and the server replaces the stored credential hash: the old credential stops working immediately |
| Lost the state volume | Same as above. The old token is single-use, so a fresh one is required |
| Pause an agent | **Disable**. It keeps heartbeating but receives no work; new backups for its databases fail with `agent_unavailable`. **Enable** to resume |
| Cut an agent off | **⋯ → Revoke**. Its credential hash is cleared, every request returns `401`, and the agent process exits with "re-enroll with a new token". Running jobs are abandoned and handled by lease expiry |
| Bring a revoked agent back | **⋯ → Re-enroll** issues a new token (the agent returns to `pending`), deploy the token, restart. It becomes `active` once it enrolls |
| Remove an agent | Reassign its databases, then **⋯ → Delete** |
| Pre-provisioned credential | Set `DUMPSTATION_AGENT_CREDENTIAL` (or `_FILE`) to skip enrollment and state handling entirely |

## Environment reference

| Variable | Default | Description |
| --- | --- | --- |
| `DUMPSTATION_SERVER_URL` | (required) | Base URL of the DumpStation server, `https://` (or `http://`, logged as a warning) |
| `DUMPSTATION_ENROLLMENT_TOKEN` | | Single-use `dse_` token used when no matching credential is stored. `_FILE` supported |
| `DUMPSTATION_AGENT_CREDENTIAL` | | Use this `dsa_` credential instead of enrolling. `_FILE` supported |
| `DUMPSTATION_STATE_DIR` | `/var/lib/dumpstation-agent` | Stores `credentials.json` (0600) and `last-contact`. Must persist |
| `DUMPSTATION_CONNECTIONS_FILE` | `/etc/dumpstation-agent/connections.yaml` | Named connections (YAML/JSON). Missing file is fine |
| `DUMPSTATION_CONN_<NAME>` | | Connection URL; name lower-cased, `_` → `-` |
| `DUMPSTATION_CONN_<NAME>_PASSWORD_FILE` | | Password file for that connection |
| `DUMPSTATION_CONN_<NAME>_FILE` | | File containing the URL (when `DUMPSTATION_CONN_<NAME>` is set but empty) |
| `DUMPSTATION_ALLOW_RESTORE` | `false` | Agent-side restore switch |
| `DUMPSTATION_MAX_CONCURRENCY` | `1` | Concurrent jobs, clamped to 1–16 |
| `DUMPSTATION_TRANSFER_MODE` | `auto` | `auto`, `direct` or `proxy` |
| `DUMPSTATION_TEMP_DIR` | OS temp dir (`/tmp/dumpstation` in the image) | Dump and restore scratch space; also holds short-lived 0600 passfiles |
| `DUMPSTATION_MIN_FREE_MB` | `0` (off) | Refuse to start a dump with less free temp space |
| `DUMPSTATION_CA_FILE` | | PEM bundle added to the system roots, for a server behind a private CA |
| `DUMPSTATION_INSECURE_SKIP_VERIFY` | `false` | Disable TLS verification (testing only; logged loudly) |
| `DUMPSTATION_SHUTDOWN_GRACE_SECONDS` | `30` | Time running jobs get to finish after SIGTERM |
| `PG_BIN_DIRS` | | Extra colon-separated directories to search for PostgreSQL client tools |
| `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY` | | Standard outbound proxy settings |
| `TZ` | `UTC` (image) | Log timestamps are UTC regardless |

TLS to the server requires TLS 1.2 or newer.

## CLI

```
dumpstation-agent [run|healthcheck|connections|tools|version]
```

| Command | Description |
| --- | --- |
| `run` (default) | Enroll if needed, then heartbeat and process jobs until SIGINT/SIGTERM |
| `healthcheck` | Exit 0 if the server was reached in the last 2 minutes, else print the reason and exit 1 |
| `connections` | Print the local connections the agent would report, plus warnings for invalid entries |
| `tools` | Print the PostgreSQL client major versions found |
| `version` | Print the build version |

Inside a container: `docker exec dumpstation-agent dumpstation-agent connections`.
