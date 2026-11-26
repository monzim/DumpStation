# Roadmap

What has shipped and what is planned. Priorities follow user feedback; open
an issue or discussion to argue for something.

## v2.0 (current)

### Distributed execution

- DumpStation Agents: outbound-only workers for databases in private
  networks (Docker, Compose, Kubernetes, binary + systemd).
- Single-use enrollment tokens, hashed agent credentials, rotation,
  disable/enable, revocation, re-enrollment.
- Durable agent job queue with leases, idempotent completion, retries with
  backoff, queue expiry and cancellation.
- Agent-local named connections (env vars, password files, YAML/JSON file):
  database credentials can stay off the server.
- Direct-to-storage uploads with presigned, object-scoped multipart URLs and
  a server-mediated fallback.
- Restores through agents, gated by switches on both server and agent.
- Agent connectivity tracking with activity entries and notifications.

### Backups and restores

- One lifecycle and history for direct and agent backups, with stages and a
  per-job execution log.
- Classified errors (`auth_failed`, `version_mismatch`, `agent_lost`, ...)
  instead of "backup failed".
- SHA-256 while dumping, size verification in storage, checksum check before
  restore.
- Always custom-format dumps; PostgreSQL client tools 12–18 with automatic
  version selection.
- Guided restore wizard: original, other configured database or custom
  target; optional `--clean`; typed confirmation.
- Safer restores: `pg_restore` over libpq, plain dumps replayed without
  `psql` meta-commands, never retried automatically.
- Schedules with per-database time zones, presets and run preview; missed
  run detection.
- Retention that never deletes the newest successful backup.
- One active backup per database; cancellation for queued and running jobs.
- Backups pinned to the storage they were written to; storage deletion
  guarded while in use.
- MinIO and generic S3-compatible storage providers.
- Paged, filterable backup history.

### Security

- Secrets encrypted at rest (`enc:v1`), legacy plaintext readable.
- `DIRECT_ALLOWED_CIDRS` with IP pinning for server-side connections.
- 2FA enforced after GitHub sign-in; pending-2FA tokens rejected on API
  routes; roles re-checked per request.
- GitHub sign-in bound to the initiating tab (nonce), tokens in URL fragment.
- Download codes bound to their backup and sent only to the caller's own
  channels.
- Fixed webhook SSRF guard rejecting public IPv4 Discord hosts.

### Product

- New UI on Meta's Astryx design system: overview, databases, backups,
  restores, agents (onboarding wizard), storage, schedules, notifications,
  activity, system health, DB Explorer, settings, users.
- One image: the server serves the UI; the separate web image is retired.
- Administrator user management; `DEMO_ENABLED` switch for the demo account.
- CI for server (vet, unit and PostgreSQL integration tests, agent build) and
  web; multi-arch images for server and agent.

## Next

Candidates for v2.x, roughly in priority order:

- **Restore verification:** scheduled test restores into a scratch database
  with a pass/fail report.
- **Metrics:** Prometheus endpoint (backup age, duration, size, failures,
  agent connectivity) and a Grafana dashboard.
- **Generic webhooks and email** as notification channels, with event
  filtering.
- **Client-side encryption** of artifacts (age/GPG or envelope encryption)
  before upload.
- **Backup windows and per-database `pg_dump` options** (schemas/tables to
  include or exclude, compression level, parallel jobs for directory format).
- **Cluster globals:** optional `pg_dumpall --globals-only` (roles,
  tablespaces) alongside database dumps.
- **Agent updates:** version compatibility warnings and an update hint in the
  UI; signed release binaries.
- **Helm chart** for the server and agents.
- **Storage:** Azure Blob and Google Cloud Storage (native, not only via S3
  interoperability); storage replication to a second bucket.
- **Teams and finer-grained roles** (operator, viewer) beyond admin/user/demo.
- **Audit log export** and longer configurable activity retention.
- **Refreshed OpenAPI spec** generated from the v2 handlers.

## Later / under consideration

- Point-in-time recovery via WAL archiving.
- MySQL/MariaDB support through the same agent model.
- Kubernetes operator.
- Terraform provider.

## v1.x (previous)

Multi-database `pg_dump` backups, cron scheduling, S3 and R2 storage,
Discord notifications and OTP sign-in, TOTP 2FA, GitHub OAuth, Telegram
notifications, rotation by count or age, restore to another server,
multi-tenant isolation, activity log, DB Explorer, Cloudflare Turnstile,
separate React web image.
