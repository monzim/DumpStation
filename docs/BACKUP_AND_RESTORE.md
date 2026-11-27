# Backup and restore

How to configure storage and databases, how scheduling and retention behave,
and how to restore.

- [Storage](#storage)
- [Adding a database](#adding-a-database)
- [Schedules and time zones](#schedules-and-time-zones)
- [Retention](#retention)
- [Manual backups and cancellation](#manual-backups-and-cancellation)
- [Backup history](#backup-history)
- [Notifications](#notifications)
- [Downloading a backup](#downloading-a-backup)
- [Restore](#restore)
- [Legacy plain-format backups](#legacy-plain-format-backups)
- [What a backup contains](#what-a-backup-contains)

## Storage

**Storage → Add storage.** One storage configuration can serve many
databases. The first one you add becomes the default; you can change the
default later. **Test** writes, reads (HEAD) and deletes a small probe object
under `.dumpstation/` and reports which step failed.

| Provider | `provider` | Endpoint | Region | Notes |
| --- | --- | --- | --- | --- |
| AWS S3 | `s3` | Leave empty | Bucket region, e.g. `eu-central-1` (empty → `us-east-1`) | Virtual-hosted style requests |
| Cloudflare R2 | `r2` | `https://<account-id>.r2.cloudflarestorage.com` | `auto` | Create an R2 API token with *Object Read & Write* on the bucket |
| MinIO | `minio` | e.g. `http://minio:9000` or `https://minio.example.com` | Any (empty → `auto`) | Path-style requests |
| Other S3-compatible (Backblaze B2, Wasabi, DigitalOcean Spaces, Garage, Ceph RGW, ...) | `s3_compatible` | The provider's S3 endpoint URL | As documented by the provider (empty → `auto`) | Must support multipart upload and presigned URLs |

An endpoint is required for every provider except `s3`. When an endpoint is
set, requests use path-style addressing.

### Permissions

The access key needs these actions on the bucket's objects (no bucket-level
permissions such as `ListBucket` are used):

| Action | Used for |
| --- | --- |
| `s3:PutObject` | Uploads, including `CreateMultipartUpload`, `UploadPart` and `CompleteMultipartUpload` |
| `s3:GetObject` | `HeadObject` verification, restores, presigned downloads |
| `s3:DeleteObject` | Retention, deleting a database's backups, removing partial or orphaned uploads, storage test |
| `s3:AbortMultipartUpload` | Cleaning up failed or expired agent uploads |

Example AWS policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:AbortMultipartUpload"],
    "Resource": "arn:aws:s3:::my-dumpstation-backups/*"
  }]
}
```

**CORS is not needed.** Uploads come from the server or from agents, neither
of which is a browser, and browser downloads are plain navigations to a
presigned URL.

Consider a lifecycle rule that aborts incomplete multipart uploads after a day
as a safety net, and bucket versioning or object lock if you need protection
against deletion.

### Storage and existing backups

Each backup records the storage it was written to. Changing a database's
storage only affects new backups; older backups are still restored from (and
deleted from) their original storage. A storage configuration cannot be
deleted while databases use it or while backups still live in it.

## Adding a database

**Databases → Add database.**

| Field | Notes |
| --- | --- |
| Name | Display name, also used in object keys (non `[A-Za-z0-9_-]` characters become `_`) |
| Execution | **Direct**: the server connects. **Agent**: a DumpStation Agent connects (see [AGENTS.md](AGENTS.md)) |
| Connection | Direct, or agent with central credentials: host, port, database, user, password. Agent with a local connection: pick the connection name the agent reported |
| Storage | Where backups are uploaded |
| Schedule and time zone | See below |
| Retention | Count or days, see below |
| Notifications | Optional channel for success/failure messages |

**Test connection** checks reachability and authentication, reads the server
version and confirms a compatible `pg_dump` is installed on the executor. For
direct databases it runs immediately on the server; for agent databases it is
queued on the agent (it fails after two minutes if the agent does not pick it
up).

Direct connections can be limited with `DIRECT_ALLOWED_CIDRS` on the server.
On edit, leaving the password empty keeps the stored one. Existing v1
databases are direct.

The backup role must be able to read everything in the database (for
example the owner, or `pg_read_all_data` on PostgreSQL 14+).

### Version selection

The executor reads `server_version_num` first and picks the smallest
installed `pg_dump` major that is at least the server's major. The images
ship PostgreSQL client tools 12 through 18. If no suitable version exists the
backup fails with `version_mismatch`.

### Pause, resume, delete

- **Pause** stops scheduled backups (manual backups still work). **Resume**
  re-adds the schedule.
- **Delete** refuses while a backup is active. Optionally it also deletes
  every stored artifact of that database; if some cannot be removed, the
  database is kept and the error is shown.

## Schedules and time zones

- Presets: hourly, every N hours, daily, weekly, monthly, or a custom 5-field
  cron expression (`minute hour day-of-month month day-of-week`).
  Descriptors such as `@daily` and `@every 6h` are accepted too.
- Each database has its own IANA time zone (`Europe/Berlin`,
  `America/New_York`, ...). Daylight saving changes are handled by the
  cron library. An empty time zone means the server's zone (`TZ`, UTC in the
  official images).
- The editor shows a plain-language description and the next five run times
  computed by the server (`GET /api/v1/schedules/preview`).
- The **Schedules** page lists upcoming runs across databases.
- If a run is due while the previous backup of the same database is still
  active, it is skipped.
- Runs missed because the server was down are detected within 10 minutes of
  startup and reported (activity log + notification). They are not replayed;
  trigger a manual backup if needed.

## Retention

| Policy | Value | Keeps |
| --- | --- | --- |
| `count` | 1–10,000 | The N newest successful backups |
| `days` | 1–3,650 | Successful backups started within the last N days |

Whatever the policy, **the newest successful backup is never deleted.** A
`days` policy on a database whose backups have all aged out still leaves the
latest one; a broken schedule therefore never leaves you with nothing.

Retention runs after every successful backup. Deleted backups are removed
from their storage and shown with status `deleted`. Failed and cancelled
backups are not counted or removed by retention; purge them from the Backups
page (this also removes any objects they left behind).

## Manual backups and cancellation

- **Back up now** (database list or detail page) queues a backup with trigger
  `manual`. If one is already queued or running for that database, the API
  returns `409` with the active backup.
- **Cancel** is available on any pending or running backup:
  - queued: cancelled immediately;
  - running directly: `pg_dump` or the upload is stopped;
  - running on an agent: the agent learns about it on its next event or
    heartbeat (within about 20 s), stops, and the backup ends as
    `cancelled`. Partial multipart uploads are aborted.

## Backup history

**Backups** shows every backup across databases and executors.

Filters: database, agent, status (`pending`, `running`, `success`, `failed`,
`cancelled`, `deleted`), executor (`direct`, `agent`), trigger (`manual`,
`scheduled`), free-text search (backup name, database name or ID), date
range, and sort by start time, size or duration.

Each backup's detail page shows status, stage, executor and agent, storage,
size, SHA-256, PostgreSQL version, duration, attempts for agent jobs, the
classified error (code, message, tool output tail) and the **execution log**:
every stage and message from the server and, for agent jobs, from the agent.

## Notifications

**Notifications → Add channel.** A channel can have a Discord webhook, a
Telegram bot token + chat ID, or both. **Test** sends a message. Assign a
channel to a database to receive:

- backup success (size, duration) and failure (reason);
- restore success and failure;
- missed scheduled runs;
- the database's agent going offline or coming back.

Discord webhook URLs must point at a Discord domain over HTTPS (SSRF guard).
The server-wide `DISCORD_WEBHOOK_URL` is separate: it receives sign-in codes
and start/stop notices.

## Downloading a backup

Downloads need a second factor because an artifact is a full copy of your
data.

1. On a successful backup choose **Download**.
2. A 6-digit code is sent to the first of *your own* notification channels
   that has working Discord or Telegram credentials. Without such a channel
   the download is refused with instructions to add one.
3. Enter the code (valid 5 minutes, bound to that backup). You get a
   presigned URL valid for 5 minutes and the download starts.

The download is recorded in the activity log. Restore a custom-format file
locally with `pg_restore --no-owner -d <db> <file>.dump`.

## Restore

Open a successful backup and choose **Restore**. The wizard has three steps:
target, options, confirmation.

### Targets

| Target | Where it runs | Notes |
| --- | --- | --- |
| **Original database** | The database's executor (server or its agent) | Overwrites into the source database; confirmation required |
| **Another configured database** | That database's executor | Useful for staging copies; confirmation required |
| **Custom target** | The server, or an agent you choose | Enter host/port/database/user/password, or (with an agent) pick one of its local connections. Custom credentials are stored encrypted with the restore record |

Through an agent, restores require both the server-side *Allow restores*
switch and `DUMPSTATION_ALLOW_RESTORE=true` on the agent
([AGENTS.md](AGENTS.md#restores-through-an-agent)). The wizard explains which
side is missing.

### Options and confirmation

- **Drop existing objects before restoring (`--clean`)** runs `pg_restore
  --clean --if-exists`, replacing objects that exist in the backup. Without
  it, objects that already exist cause errors and fail the restore.
- Restores always use `--no-owner --no-privileges`: objects are owned by the
  restoring user and grants from the source are not applied.
- When the restore can overwrite data (original or configured database, or
  `--clean`), you must type the target name to confirm.
- The target database must already exist; create an empty one for a fresh
  copy.

### What happens

1. The artifact is downloaded to the executor's temp directory and its
   SHA-256 is checked against the value recorded at backup time.
2. The format is detected from the file header.
3. Custom format: the newest installed `pg_restore` restores it. When
   restoring into a server older than 17, errors caused only by the
   `transaction_timeout` setting from a newer `pg_dump` are ignored; any
   other error fails the restore.
4. The restore record shows stages (`queued`, `waiting_for_agent`,
   `preparing`, `downloading`, `restoring`), an execution log and the
   outcome. Restores are listed under **Backups → Restores**.

Restores are never retried automatically. If one fails midway the target may
be partially restored; fix the cause and run it again (usually with
`--clean`).

## Legacy plain-format backups

Backups taken by DumpStation v1 may be plain SQL files with no recorded
checksum. They remain listed and restorable:

- the checksum step is skipped when no SHA-256 was recorded;
- plain SQL is replayed by DumpStation over the PostgreSQL wire protocol, not
  by `psql`; backslash meta-commands in the file are ignored and `COPY ...
  FROM stdin` data is streamed;
- `--clean` has no effect for plain files (use a fresh, empty target
  database instead);
- they stay pinned to the storage they were written to.

All new backups use `pg_dump` custom format.

## What a backup contains

- One custom-format `pg_dump` archive (compression level 6) of one
  database: schema, data, sequences, functions, extensions declared in that
  database.
- Not included: roles, tablespaces and other cluster-wide objects
  (`pg_dumpall --globals-only` territory), and other databases on the same
  server.
- Object key: `backups/<database-id>/<name>_<YYYYMMDD_HHMMSS>_<backup-id>.dump`,
  with object metadata for database ID, backup ID, executor, PostgreSQL
  version and (for server-side uploads) SHA-256.
