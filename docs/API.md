# API reference

DumpStation exposes two HTTP APIs on the same port:

| Prefix | Clients | Auth |
| --- | --- | --- |
| `/api/v1` | Web UI, scripts | `Authorization: Bearer <JWT>` |
| `/agent/v1` | DumpStation Agents | Enrollment token, then `Authorization: Bearer dsa_...` |

The route table lives in `server/internal/handlers/router.go` (REST) and
`server/internal/agentapi/agentapi.go` (agents). Swagger UI at `/swagger/`
serves the legacy generated spec from `server/docs`; it predates most v2
endpoints and may lag behind this document.

- [Conventions](#conventions)
- [Auth](#auth)
- [Overview and system](#overview-and-system)
- [Databases](#databases)
- [Backups](#backups)
- [Restores](#restores)
- [Agents](#agents)
- [Storage](#storage)
- [Notifications](#notifications)
- [Activity](#activity)
- [Labels](#labels)
- [Users and profile](#users-and-profile)
- [DB Explorer](#db-explorer)
- [Agent protocol](#agent-protocol)

## Conventions

- JSON in and out; request bodies are limited to 1 MiB.
- Errors: `{"code": "<HTTP status text>", "message": "..."}`. Validation
  errors list the offending fields.
- Access levels used below:
  - **public**: no token;
  - **read**: any signed-in user, including the demo account;
  - **write**: signed-in, not the demo account (`403` for demo);
  - **blocked**: signed-in, demo account rejected entirely;
  - **admin**: administrators only.
- Every resource is scoped to its owner; administrators see all users'
  resources. A resource you cannot see returns `404`.
- Secrets are never returned. List responses mask hosts, database names,
  usernames, buckets, endpoints and access keys.
- A pending-2FA token is rejected everywhere except `POST /auth/2fa/verify`.
- Roles (admin/demo) are re-read from the database on every request.
- Times are RFC 3339.

## Auth

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | public | Liveness: `{"status": "healthy"}` |
| GET | `/auth/config` | public | `{discord_enabled, github_enabled, demo_enabled}` for the login page |
| POST | `/auth/login` | public, rate-limited | `{username, turnstile_token?}` (username or email). Sends a 6-digit code to the system Discord webhook, or logs it when none is configured |
| POST | `/auth/verify` | public, rate-limited | `{username, otp}` → `{token, expires_at}` or `{requires_2fa: true, two_factor_token, two_factor_expires_at}` |
| POST | `/auth/2fa/verify` | public, rate-limited | Header `X-2FA-Token: <two_factor_token>`, body `{code}` (TOTP or backup code) → session token |
| POST | `/auth/demo-login` | public, only when `DEMO_ENABLED` | Session for the read-only demo account |
| GET | `/auth/github/login?nonce=` | public | Redirects to GitHub. `nonce` (16–128 chars) is echoed back so the SPA accepts the result only in the starting tab |
| GET | `/auth/github/callback` | public | OAuth callback. Redirects to `<web origin>/auth/github/return#token=...&exp=...&nonce=...` (or `#two_factor_token=...` when TOTP is enabled), or `/login?github_error=<reason>` |
| POST | `/auth/refresh` | read | New token (sliding session, 12 h absolute cap) |
| POST | `/auth/logout` | read | Ends the session (logged) |
| GET | `/auth/2fa/status` | read | `{enabled, verified_at, backup_codes_count}` |
| POST | `/auth/2fa/setup` | blocked | Start TOTP enrolment: `{secret, qr_code_data_url, issuer, account_name}` |
| POST | `/auth/2fa/verify-setup` | blocked | `{code}` confirms enrolment; returns backup codes |
| POST | `/auth/2fa/disable` | blocked | `{code}` |
| POST | `/auth/2fa/backup-codes` | blocked | `{code}` → new backup codes |

## Overview and system

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/overview` | read | Dashboard: database counts (protected, unprotected, paused, attention), backup counts (24 h, 7 d, success rate, active), storage used, agent counts (online/offline/disabled/pending), attention list, upcoming runs, active and recently failed backups, daily counts, recent activity |
| GET | `/stats` | read | Legacy summary statistics |
| GET | `/system/health` | read | Version, uptime, server time zone, metadata DB status and latency, installed `pg_dump` majors, active schedules, job settings (concurrency, queue TTL, lease TTL, max attempts), enabled sign-in methods, `public_url` |
| GET | `/schedules/preview?cron=&tz=` | read | `{valid, error?, timezone, next: [5 times]}` |

## Databases

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/databases` | read | List with `health` (`healthy`, `running`, `failing`, `stale`, `never_backed_up`, `paused`), `last_backup`, `active_backup`, `last_success_at`, `next_run_at`, `execution_mode`, `agent_id`, `agent_connection`, `central_credentials` |
| GET | `/databases/{id}` | read | One database (same shape) |
| GET | `/databases/{id}/backups?limit=` | read | Array of backups (legacy shape; default limit 100) |
| GET | `/databases/{id}/connection` | write | Unmasked `{host, port, dbname, user, has_password}` for edit forms; never the password |
| POST | `/databases` | write | Create (see body below) → `201` |
| PUT | `/databases/{id}` | write | Update; empty `password` keeps the stored one |
| DELETE | `/databases/{id}?delete_backups=true` | write | Delete; `409` while a backup is active; optionally deletes all artifacts first (`502` and database kept if some cannot be removed) |
| POST | `/databases/{id}/pause` | write | Stop scheduled backups |
| POST | `/databases/{id}/unpause` | write | Resume |
| POST | `/databases/{id}/backup` | write | Manual backup → `202` with the backup; `409 {message, backup}` if one is active |
| POST | `/databases/test` | write | Test connection before saving (body below) |
| POST | `/databases/{id}/test` | write | Test the saved connection |
| POST | `/databases/{id}/labels` | write | `{label_ids: [...]}` |
| DELETE | `/databases/{id}/labels/{labelId}` | write | Remove a label |

Create/update body:

```json
{
  "name": "orders",
  "execution_mode": "agent",
  "agent_id": "…",
  "agent_connection": "orders",
  "host": "", "port": 0, "dbname": "", "user": "", "password": "",
  "schedule": "0 2 * * *",
  "timezone": "Europe/Berlin",
  "storage_id": "…",
  "notification_id": "…",
  "rotation_policy": {"type": "count", "value": 14}
}
```

- `execution_mode`: `direct` (default) or `agent`. `agent_id` and
  `agent_connection` are only valid with `agent`.
- With `agent_connection` set, credentials live on the agent and host/user/
  password are ignored and cleared. Otherwise host, port, dbname and user are
  required, and password on create.
- `rotation_policy.type`: `count` (1–10000) or `days` (1–3650).
- `storage_id`, `notification_id` and `agent_id` must belong to the database
  owner; revoked agents are refused.

Connection test body: `{execution_mode, agent_id?, agent_connection?, host,
port, dbname, user, password, database_id?}` (`database_id` reuses the stored
password when `password` is empty). Direct tests answer
`{result: {ok, server_version, server_major, client_major, latency_ms, code,
message}}`; agent tests answer `202 {job_id}` to poll at
`GET /agent-jobs/{job_id}`.

## Backups

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/backups` | read | Paginated history `{items, total, limit, offset}` |
| GET | `/backups/{id}` | read | One backup |
| GET | `/backups/{id}/events` | read | Execution log: `[{level, stage, source, message, created_at}]` |
| POST | `/backups/{id}/cancel` | write | Cancel a pending or running backup |
| POST | `/backups/{id}/restore` | write | Start a restore (see [Restores](#restores)) → `202` |
| GET | `/backups/failed/count` | read | `{count}` of failed backups |
| DELETE | `/backups/failed` | write | Purge failed backups (and any objects they left) → `{deleted}` |
| POST | `/backups/{id}/download/request-otp` | write | Send a 6-digit code to one of the caller's own notification channels → `{otp_id, expires_at, channels}`; `412` if the caller has no usable channel |
| POST | `/backups/{id}/download/verify` | write | `{otp_id, code}` → `{download_url, expires_at}` (presigned, 5 min) |

`GET /backups` query parameters: `database_id`, `agent_id`, `status`
(comma-separated: `pending,running,success,failed,cancelled,deleted`),
`executor` (`direct|agent`), `trigger` (`manual|scheduled`), `q` (backup name,
database name or ID), `from`, `to` (RFC 3339 or `YYYY-MM-DD`), `sort`
(default newest first; `started_at`, `size`, `-size`, `duration`,
`-duration`), `limit` (max 200, default 50), `offset`.

Backup fields: `id`, `name`, `database_id`, `database_name`, `status`,
`stage`, `trigger`, `executor`, `agent_id`, `agent_name`, `agent_attempts`,
`storage_id`, `storage_name`, `size_bytes`, `storage_path`, `dump_format`
(`custom|plain`), `checksum_sha256`, `postgres_version`, `error_code`,
`error_message`, `cancel_requested`, `timestamp` (queued at),
`run_started_at`, `completed_at`, `duration_ms`, `restorable`.

## Restores

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/backups/{id}/restore` | write | Create a restore job |
| GET | `/restores?backup_id=&database_id=&limit=` | read | List restore jobs |
| GET | `/restores/{id}` | read | One restore job (status, stage, target, executor, agent, error) |
| GET | `/restores/{id}/events` | read | Execution log |

Restore body:

```json
{
  "target": "original | database | custom",
  "target_database_id": "…",
  "execution_mode": "direct | agent",
  "agent_id": "…",
  "agent_connection": "staging",
  "target_host": "…", "target_port": 5432, "target_dbname": "…",
  "target_user": "…", "target_password": "…",
  "clean_target": false,
  "confirm": "orders"
}
```

- Only `success` backups with a stored artifact can be restored.
- `target` defaults to `custom` when custom fields or `agent_id` are given,
  else `original`.
- `original` and `database` run on that database's executor; agent
  databases require restores to be allowed on both the server and the agent.
- `custom` runs on the server, or on `agent_id` with either
  `agent_connection` or explicit credentials.
- `confirm` must equal the target database's name for `original`/`database`
  targets, or the target name when `clean_target` is set. Otherwise `400`
  with the expected value in the message.

## Agents

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/agents` | read | List agents with `connectivity` (`online`, `offline`, `never_connected`), `database_count`, `recent_failures` (7 d), `last_failure` |
| POST | `/agents?ttl_minutes=` | write | `{name, description?, labels?, allow_restore?}` → `201 {agent, enrollment_token, expires_at, server_url}`. TTL 10–1440, default 60 |
| GET | `/agents/{id}` | read | Detail, including assigned `databases` |
| PUT | `/agents/{id}` | write | `{name, description, labels, allow_restore?}` |
| DELETE | `/agents/{id}` | write | `204`; `409` while databases are assigned |
| POST | `/agents/{id}/enable` | write | `active` (refused for pending or revoked agents) |
| POST | `/agents/{id}/disable` | write | `disabled`: no new work |
| POST | `/agents/{id}/revoke` | write | `revoked`: credential invalidated |
| POST | `/agents/{id}/enrollment?ttl_minutes=` | write | New single-use token (rotation, redeploy, re-enrol a revoked agent, which returns to `pending`). Earlier unused tokens are voided |
| POST | `/agents/{id}/test-connection` | write | `{agent_connection}` or `{host, port, dbname, user, password}` → `202 {job_id}` |
| GET | `/agent-jobs/{id}` | read | `{id, kind, status, attempts, error_message, result, created_at, completed_at}`; for tests `result` is the connection test result |

Agent fields reported by the agent: `version`, `hostname`, `platform`,
`pg_versions`, `connections` (`[{name, database, host}]`), `upload_modes`,
`agent_allow_restore`, `max_concurrency`, `running_jobs`, `last_seen_at`,
`last_ip`, `enrolled_at`, `credential_issued_at`, `token_prefix`. Set in the
UI: `name`, `description`, `labels`, `allow_restore`, `status`.

## Storage

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/storage` | read | List (masked) with usage: `database_count`, `backup_count`, `used_bytes` |
| GET | `/storage/{id}` | read | One storage configuration |
| GET | `/storage/{id}/settings` | read | Unmasked non-secret fields for edit forms |
| POST | `/storage` | write | `{name, provider, bucket, region, endpoint, access_key, secret_key, is_default?}`. `provider`: `s3`, `r2`, `minio`, `s3_compatible`; `endpoint` required except for `s3`. The first storage becomes the default |
| PUT | `/storage/{id}` | write | Update; empty keys keep the stored ones |
| DELETE | `/storage/{id}` | write | `409` while databases use it or artifacts live in it |
| POST | `/storage/test` | write | Test unsaved settings (with `id` and empty keys, uses stored keys) |
| POST | `/storage/{id}/test` | write | Write/read/delete probe → `{ok, stage, message, latency_ms}` |
| POST | `/storage/{id}/default` | write | Make it the default |
| POST | `/storage/{id}/labels` | write | `{label_ids}` |
| DELETE | `/storage/{id}/labels/{labelId}` | write | Remove a label |

## Notifications

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/notifications` | read | List channels (secrets masked) |
| GET | `/notifications/{id}` | read | One channel |
| POST | `/notifications` | write | `{name, discord_webhook_url?, telegram_bot_token?, telegram_chat_id?}`. Discord URLs must pass the SSRF guard |
| PUT | `/notifications/{id}` | write | Update; empty secrets keep stored values |
| DELETE | `/notifications/{id}` | write | Delete |
| POST | `/notifications/{id}/test` | write | Send a test message → `{ok, message}` |
| POST | `/notifications/{id}/labels` | write | `{label_ids}` |
| DELETE | `/notifications/{id}/labels/{labelId}` | write | Remove a label |

## Activity

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/logs` | read | Activity log. Filters: `action`, `level`, `entity_type`, `entity_id`, `start_date`, `end_date` (RFC 3339), `limit`, `offset`; `user_id` for administrators |
| GET | `/logs/{id}` | read | One entry |

Entries are kept for 60 days. Agent-related actions include
`agent_created`, `agent_enrollment_issued`, `agent_registered`,
`agent_connected`, `agent_disconnected`, `agent_enabled`, `agent_disabled`,
`agent_revoked`, `agent_deleted`, `backup_job_assigned`, `backup_missed`.

## Labels

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/labels` | read | Labels with usage counts |
| GET | `/labels/{id}` | read | One label |
| POST | `/labels` | write | `{name, color: "#rrggbb", description?}` (names unique per user) |
| PUT | `/labels/{id}` | write | Update |
| DELETE | `/labels/{id}` | write | Delete |

## Users and profile

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/users/me` | read | Current user (`is_admin`, `is_demo`, `two_factor_enabled`, GitHub/Discord identity) |
| GET | `/users/me/avatar` | read | Avatar image |
| POST | `/users/me/avatar` | write | Set avatar (JSON) |
| POST | `/users/me/avatar/upload` | write | Set avatar (multipart) |
| DELETE | `/users/me/avatar` | write | Remove avatar |
| GET | `/admin/users` | admin | `[{id, display_name, email, github_login, discord_username, is_admin, is_demo, two_factor_enabled, created_at}]` |
| PATCH | `/admin/users/{id}` | admin, write | `{is_admin}`. You cannot remove your own admin role; the demo account cannot become admin |

## DB Explorer

Saved PostgreSQL server connections for browsing and light administration.
Credentials are encrypted at rest; connections honour `DIRECT_ALLOWED_CIDRS`.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/server-connections` | read | List |
| GET | `/server-connections/{id}` | read | One connection |
| POST | `/server-connections` | write | `{name, host, port, user, password, ssl_mode}` |
| PUT | `/server-connections/{id}` | write | Update |
| DELETE | `/server-connections/{id}` | write | Delete |
| POST | `/server-connections/test` | write | Test unsaved settings |
| POST | `/server-connections/{id}/test` | write | Test a saved connection |
| GET | `/server-connections/{id}/databases` | read | Databases on the server |
| POST | `/server-connections/{id}/databases` | write | Create a database |
| DELETE | `/server-connections/{id}/databases/{dbname}` | write | Drop a database |
| GET | `/server-connections/{id}/databases/{dbname}/tables` | read | Tables |
| GET | `/server-connections/{id}/databases/{dbname}/tables/{schema}/{table}/rows?limit=&offset=` | read | Browse rows (default 50) |
| POST | `/server-connections/{id}/databases/{dbname}/tables/{schema}/{table}/truncate` | write | Truncate a table |
| GET | `/server-connections/{id}/databases/{dbname}/erd` | read | Entity-relationship data |
| GET | `/server-connections/{id}/users` | read | Roles |
| POST | `/server-connections/{id}/users` | write | Create a role |
| DELETE | `/server-connections/{id}/users/{username}` | write | Drop a role |
| POST | `/server-connections/{id}/databases/{dbname}/grants` | write | Grant a role privileges on a database |

## Agent protocol

Called only by agents. Responses carry `Cache-Control: no-store`. Errors are
`{"code": "...", "message": "..."}` with codes such as `unauthorized`,
`revoked`, `invalid_token`, `lease_invalid`, `rate_limited`,
`storage_error`, `upload_failed`. Wire types are in
`server/internal/agentproto/proto.go`; behaviour is described in
[ARCHITECTURE.md](ARCHITECTURE.md#agent-protocol).

| Method | Path | Auth | Body → response |
| --- | --- | --- | --- |
| POST | `/agent/v1/enroll` | enrollment token in body | `{token: "dse_…", info}` → `{agent_id, agent_name, credential: "dsa_…"}`. `401 invalid_token` for used/expired/superseded tokens or revoked agents. Rate limit 5 burst, 1/6 s per IP |
| POST | `/agent/v1/heartbeat` | credential | `{info, running_jobs: [ids]}` → `{status, cancel_jobs: [ids], server_time}`. Extends leases of running jobs |
| GET | `/agent/v1/jobs/next?wait=25` | credential | Long-poll (wait ≤ 30 s). `200` job or `204`. `401` if revoked mid-poll |
| POST | `/agent/v1/jobs/{id}/events` | credential + lease | `{lease_token, stage?, level?, message}` → `{cancel}` |
| POST | `/agent/v1/jobs/{id}/upload/part-url` | credential + lease | `{lease_token, part_number}` (1–10000) → `{url, expires_at}` presigned `UploadPart`, 30 min. First call starts the multipart upload |
| PUT | `/agent/v1/jobs/{id}/artifact` | credential + `X-DumpStation-Lease` | Raw artifact stream with `X-DumpStation-SHA256` → `{size_bytes, sha256}`. Server re-hashes and rejects a mismatch |
| POST | `/agent/v1/jobs/{id}/download-url` | credential + lease | `{lease_token}` → `{url, expires_at}` presigned GET for a restore artifact, 1 h |
| GET | `/agent/v1/jobs/{id}/artifact` | credential + `X-DumpStation-Lease` | Streams a restore artifact |
| POST | `/agent/v1/jobs/{id}/complete` | credential + lease | `{lease_token, ok, error_code?, error_message?, error_detail?, size_bytes, sha256, format, server_version, transfer_mode, parts: [{part_number, etag}], result?}` → `{status: "completed"}` or `{status: "already_completed"}` for a repeat with the same lease; `409` for a stale lease |

`info` (`AgentInfo`): `version`, `hostname`, `platform`, `pg_versions`,
`connections` (`[{name, database, host}]`, no secrets), `transfer_modes`,
`allow_restore`, `max_concurrency`.

Job (`200` from `jobs/next`):

```json
{
  "id": "…", "kind": "backup | restore | test_connection",
  "lease_token": "…", "lease_ttl_seconds": 120, "timeout_seconds": 21600, "attempt": 1,
  "backup":  {"backup_id": "…", "database_name": "orders",
              "source": {"connection": "orders"} , "compression": 6,
              "transfer_modes": ["direct", "proxy"], "part_size": 67108864},
  "restore": {"restore_id": "…", "backup_id": "…", "format": "custom", "size_bytes": 0,
              "sha256": "…", "target": {"connection": "staging"}, "clean": false,
              "transfer_modes": ["direct", "proxy"]},
  "test":    {"target": {"conn": {"host": "…", "port": 5432, "database": "…", "user": "…", "password": "…"}}}
}
```

Only the spec matching `kind` is present. A connection reference is either
`{"connection": "<local name>"}` or `{"conn": {...}}` with central
credentials.
