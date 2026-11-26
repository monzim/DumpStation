# Troubleshooting

- [Where to look](#where-to-look)
- [Error codes](#error-codes)
- [Agents](#agents)
- [Uploads and storage](#uploads-and-storage)
- [Version mismatch](#version-mismatch)
- [Backups stuck in waiting_for_agent](#backups-stuck-in-waiting_for_agent)
- [Missed schedules](#missed-schedules)
- [Sign-in problems](#sign-in-problems)
- [Server start-up errors](#server-start-up-errors)

## Where to look

1. **The job's execution log.** Open the backup (or restore) in the UI. The
   log lists every stage with messages from the server and, for agent jobs,
   from the agent, followed by the classified error: code, message and the
   last lines of `pg_dump`/`pg_restore` output (credentials stripped).
2. **Activity** page: logins, configuration changes, agent
   connect/disconnect, missed schedules, retention.
3. **System Health** page: metadata DB latency, installed client versions,
   job settings, enabled sign-in methods, the `PUBLIC_URL` the server uses.
4. **Server logs:** `docker compose logs -f dumpstation` (or
   `docker logs dumpstation`).
5. **Agent:**
   - `docker logs dumpstation-agent` / `journalctl -u dumpstation-agent` /
     `kubectl logs`
   - `dumpstation-agent connections`: the connections the agent loaded and
     warnings for invalid ones
   - `dumpstation-agent tools`: installed PostgreSQL client versions
   - `dumpstation-agent healthcheck`: whether it reached the server in the
     last 2 minutes

   In a container: `docker exec dumpstation-agent dumpstation-agent connections`.

## Error codes

Codes are defined in `server/internal/pgexec/errors.go` and shared by the
server, the agent and the UI.

| Code | Meaning | What to do |
| --- | --- | --- |
| `auth_failed` | Password authentication failed, no password supplied, `pg_hba.conf` rejected the connection, or the role does not exist | Check user and password (for agent-local connections: the env var or password file on the agent). Add a `pg_hba.conf` entry for the executor's IP: the DumpStation server for direct, the agent host for agent databases |
| `host_unreachable` | Host name not resolvable, connection refused, no route, network unreachable, or connect timeout (15 s) | Check host/port from the executor's network. A private host from the server usually means the database should use an agent |
| `database_not_found` | The database name does not exist on that server | Fix the name; for restores, create the target database first |
| `permission_denied` | The role cannot read some objects (backup) or must own objects (restore) | Grant `SELECT` on all tables/sequences or use the owner / `pg_read_all_data`. For restores use a role that can create the objects, or `--clean` with an owner |
| `version_mismatch` | No installed `pg_dump` is at least as new as the server, or the archive came from a newer `pg_dump` than the installed `pg_restore` | Use the official images (12–18). For binaries install a newer client package or add its directory to `PG_BIN_DIRS`. See [Version mismatch](#version-mismatch) |
| `ssl_error` | SSL negotiation or certificate verification failed | Check `sslmode` (`require` vs `verify-full`), the server certificate, and whether the server supports SSL at all (`sslmode=disable` for local containers) |
| `insufficient_disk` | Temp directory below the configured minimum, or "No space left on device" | Enlarge `BACKUP_TEMP_DIR` (server) or `DUMPSTATION_TEMP_DIR` (agent) volume; lower concurrency; adjust `*_MIN_FREE_MB` |
| `timeout` | The job ran longer than `BACKUP_TIMEOUT_MINUTES` (default 360) | Raise the limit; check for lock contention or slow storage |
| `cancelled` | Cancelled by a user (or the agent lost its lease during upload) | None, or re-run |
| `tool_missing` | No PostgreSQL client tools found on the executor | Use the official image or install `postgresql-client`; check `dumpstation-agent tools` |
| `upload_failed` | Upload to storage failed: direct upload error, failed proxy upload, multipart completion failed, or agent reported success without starting an upload | Read the detail line. Test the storage configuration. For agents see [Uploads and storage](#uploads-and-storage) |
| `download_failed` | Could not download the artifact for a restore | Check the storage still holds the object and the agent/server can reach it; try `DUMPSTATION_TRANSFER_MODE=proxy` |
| `verification_failed` | The uploaded object is missing or its size differs from the dump (the partial object is deleted), or a downloaded artifact does not match its recorded SHA-256 | Re-run the backup. For restores, the stored artifact has changed or is corrupt; restore another backup and check bucket integrity |
| `storage_error` | Storage configuration missing or the storage client could not be created; or presigning failed | Check the storage still exists and its endpoint, region and keys; run **Test** |
| `agent_unavailable` | The assigned agent is revoked or disabled, or did not pick up the job before `AGENT_JOB_QUEUE_TTL_MINUTES` expired | Start/enable the agent, or re-enroll a revoked one. See [Agents](#agents) |
| `agent_lost` | The agent stopped reporting progress (lease expired) on its last attempt, or during a restore | Check agent logs for crashes, OOM kills, restarts or network loss. Backups are retried up to `AGENT_JOB_MAX_ATTEMPTS` before this |
| `configuration_error` | Invalid connection fields; connection name not defined on the agent; restores disabled on the agent; no or foreign agent assigned; host not allowed by `DIRECT_ALLOWED_CIDRS` | Read the message. For "connection ... is not defined on this agent" check `dumpstation-agent connections` and restart the agent after config changes |
| `restore_failed` | `pg_restore` or the SQL replay reported errors other than tolerated `transaction_timeout` ones | Read the output tail. Common: objects already exist (use `--clean` or an empty database), missing roles or extensions in the target |
| `dump_failed` | `pg_dump` exited with an error not matched above, or produced an empty file | Read the output tail (locks, corrupted catalogs, unsupported objects) |
| `interrupted` | The DumpStation server stopped or restarted while a direct job ran | Re-run. Use agents for jobs that must survive server restarts |
| `expired` | Reserved; queue expiry is currently reported as `agent_unavailable` | n/a |
| `unknown` | Unclassified error (including agent internal errors) | Read the message and the server/agent logs |

## Agents

### Agent will not enroll

| Log line | Cause | Fix |
| --- | --- | --- |
| `no stored credential and DUMPSTATION_ENROLLMENT_TOKEN is not set` | First start without a token, or the state volume was lost | Issue a token in the UI and set it |
| `enrollment rejected: ... (tokens are single-use and expire; generate a new one)` | Token used already, expired, superseded by a newer token, or agent revoked | **Rotate credential / redeploy** (or **Re-enroll**) on the agent page and use the new token |
| `enrollment failed: ...; retrying` | Network/TLS/DNS problem reaching the server | `curl -v $DUMPSTATION_SERVER_URL/api/v1/health` from the agent host. Private CA: `DUMPSTATION_CA_FILE` |
| `enrolled, but could not persist the credential` | State directory not writable | Mount a writable volume at `DUMPSTATION_STATE_DIR` (UID 10001 in the image) |
| `DUMPSTATION_SERVER_URL must be an http(s) URL` | Missing scheme | Use `https://host` |
| HTTP 429 | More than 5 enrollment attempts in a short time from one IP | Wait a minute |

If the snippet in the UI points at `localhost`, set `PUBLIC_URL` on the
server to an address the agent can reach.

### Agent shows offline

- An agent is online if it made any request in the last 90 seconds.
- Check the agent is running and its logs show no `heartbeat failed` /
  `poll failed` lines.
- Reverse proxy timeouts below 60 s break long-polls (agents log poll
  failures every 30 s or so). See [DEPLOYMENT.md](DEPLOYMENT.md#reverse-proxy).
- Clock skew does not matter for connectivity (the server uses its own clock).
- `dumpstation-agent healthcheck` failing with `no successful server contact
  recorded yet` means the agent never got a successful response.

### Agent exits with "credential rejected ... re-enroll"

The agent was revoked, or another process re-enrolled with a new token and
replaced its credential. Issue a new token and restart with it.

### Agent connects but jobs do not run

- Agent status is `disabled` → **Enable**.
- The database references a connection name the agent does not report →
  the job fails with `configuration_error`; check `dumpstation-agent connections`.
- `DUMPSTATION_MAX_CONCURRENCY` slots are all busy with long jobs.
- Restores: both restore switches must be on
  ([AGENTS.md](AGENTS.md#restores-through-an-agent)).

## Uploads and storage

- **Storage test fails at `write`/`read`/`delete`:** the key lacks that
  permission, the bucket name or region is wrong, or the endpoint is not
  reachable from the server. See the permission table in
  [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md#permissions).
- **CORS is not involved.** Uploads come from the server or agents, not
  browsers. (An agent error mentioning a missing `ETag` header means the
  storage response had no `ETag`, which points at an incompatible S3
  implementation or an intercepting proxy, not at bucket CORS.)
- **Agent direct uploads fail, proxy works:** in `auto` mode the job log shows
  "Direct upload failed (...); falling back to upload through the DumpStation
  server". Typical causes: the agent network cannot reach the storage
  endpoint, a firewall or proxy blocks it, or a MinIO endpoint is an internal
  hostname only the server can resolve. Either open egress to the endpoint or
  set `DUMPSTATION_TRANSFER_MODE=proxy`. After a fallback the agent stays in
  proxy mode until restarted.
- **Proxy uploads fail:** the reverse proxy limits request bodies or times
  out (`413`, `502`, `504`). Disable the body limit and buffering for
  `/agent/` and raise timeouts. Cloudflare-proxied hostnames cap bodies at
  100 MB on free plans.
- **`checksum mismatch` on proxy upload:** the stream was altered or
  truncated in transit (often a proxy). The object is deleted; re-run.
- **`Uploaded artifact size ... does not match`:** the object in storage is
  not what was dumped (interrupted multipart, eventual consistency in an
  unusual S3 implementation). Re-run; if it repeats, test another provider.
- **Retention reports failed deletions:** the key lacks `s3:DeleteObject`;
  rows are kept and retried on the next successful backup.

## Version mismatch

`pg_dump` must be at least as new as the server it dumps. The executor picks
the smallest installed version ≥ the server major. Restores use the newest
installed `pg_restore`.

- `PostgreSQL 19 requires client tools version 19 or newer; installed: [12 ... 18]`:
  wait for an image with newer clients, or (binary agent) install them and
  set `PG_BIN_DIRS`.
- Restoring a dump from a newer server into an older one may produce
  `unrecognized configuration parameter "transaction_timeout"` (PG 17+ dumps
  into PG ≤ 16); DumpStation tolerates exactly this. Other incompatibilities
  (new syntax or features) fail with `restore_failed`.
- Agent page → *PostgreSQL clients* shows what each agent has.

## Backups stuck in waiting_for_agent

The backup is queued for an agent that is offline. It starts as soon as the
agent reconnects. If the agent does not come back within
`AGENT_JOB_QUEUE_TTL_MINUTES` (default 6 h) the backup fails with
`agent_unavailable`. Cancel it if you do not want it to run late. Only one
backup per database can be active, so a stuck one also blocks new scheduled
runs (they are skipped).

## Missed schedules

"Scheduled backup of X at T did not run" means no backup started within ten
minutes of a scheduled time. Usual causes:

- the server was down or restarting at that time;
- the previous backup of the same database was still running (the run is
  skipped);
- the database was paused (paused databases are not checked, so this applies
  only if it was resumed in between).

Missed runs are not replayed; use **Back up now**. Check the schedule's time
zone on the database page; the preview shows the next five run times.

## Sign-in problems

| Symptom | Fix |
| --- | --- |
| No code arrives and there is no Discord webhook | Codes are written to the server log: `docker compose logs dumpstation \| grep "OTP not sent"` |
| `failed to send OTP` | `DISCORD_WEBHOOK_URL` is wrong or Discord is unreachable from the server |
| "Invalid credentials" for the right user | Sign in with `SYSTEM_USERNAME` (or its email). The default in the image is `root`, in `configs/compose.yml` `admin` |
| Code form missing on the login page | Only GitHub sign-in is configured and no Discord webhook is set. Set `DISCORD_WEBHOOK_URL`, or remove the GitHub settings to fall back to code sign-in |
| GitHub: `not_allowed` | The GitHub login does not match `GITHUB_ALLOWED_LOGIN` (case-insensitive) |
| GitHub: `missing_state_cookie` / `state_mismatch` | Cookies blocked, or the callback host differs from the host that started sign-in. `GITHUB_REDIRECT_URL` must be on the same host as the UI (`https://<host>/api/v1/auth/github/callback`) |
| GitHub: redirected to the wrong host | Set `PUBLIC_URL` (or `WEB_ORIGIN` if the UI is on another origin) |
| GitHub sign-in result ignored | It was finished in a different tab or the session storage was cleared (the nonce binds the result to the tab that started). Start again from the same tab |
| Server refuses to start: `GITHUB_REDIRECT_URL is required` | GitHub client ID, secret and allowed login are set but the redirect URL is not |
| Turnstile widget missing or always failing | See [TURNSTILE_INTEGRATION.md](TURNSTILE_INTEGRATION.md) |
| "two-factor verification required" on every call | A pending-2FA token is being used; finish the TOTP step |
| Lost TOTP device | Use a backup code. Without one, an administrator with database access must clear `two_factor_enabled` for that user in the metadata DB |

## Server start-up errors

| Message | Fix |
| --- | --- |
| `JWT_SECRET is required` / `DB_PASSWORD is required` | Set them |
| `DUMPSTATION_SECRET_KEY is required` | `openssl rand -base64 32`; reuse the existing key on upgrades |
| `Failed to initialize secret cipher` | The key is not valid base64 or not 32 bytes |
| `open secret: ...` errors when listing resources | The key changed since the values were written. Restore the original key |
| `DIRECT_ALLOWED_CIDRS: invalid CIDR` | Fix the list (comma-separated CIDRs or IPs) |
| `CORS_ALLOWED_ORIGINS cannot contain "*" while CORS_ALLOW_CREDENTIALS=true` | List explicit origins or leave CORS unset |
| `Failed to connect to database` | Check `DB_*` and that the metadata PostgreSQL is up |
| Metadata Postgres container exits after upgrade with "database files are incompatible with server" | The data directory is from an older major version; see [UPGRADING.md](UPGRADING.md#before-you-start) |
