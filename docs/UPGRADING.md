# Upgrading from v1 to v2

v2 is a drop-in upgrade for the data: the schema is migrated automatically,
existing databases keep backing up directly, and existing backups stay
restorable. The deployment changes, though: there is now **one image** that
serves both the API and the UI.

- [Before you start](#before-you-start)
- [What changes](#what-changes)
- [Step by step (Compose)](#step-by-step-compose)
- [Automatic migrations](#automatic-migrations)
- [Behaviour changes](#behaviour-changes)
- [Rollback](#rollback)

## Before you start

1. **Back up the metadata database.** With the v1 Compose bundle:

   ```bash
   docker compose exec -T postgres pg_dump -U postgres -Fc backup_service > dumpstation-v1.dump
   ```

   (`configs/manage.sh backup` writes a gzipped plain dump instead.) Keep it
   until you are confident in v2.

2. **Find your `DUMPSTATION_SECRET_KEY`.** v1 already required it (it
   encrypts DB Explorer credentials), but the v1 Compose file did not pass it,
   so check where you set it. **Reuse the same key.** A new key cannot
   decrypt values written with the old one. If you never set one, generate it
   now with `openssl rand -base64 32`.

3. **Check the metadata PostgreSQL version.** The v1 bundle ran
   `postgres:15-alpine`. The v2 `configs/compose.yml` keeps `15-alpine` by
   default (`POSTGRES_IMAGE_TAG`) with the same volume name
   (`dumpstation_postgres_data`), so the existing data directory opens as is.
   To move to a newer major version: dump (step 1), start with a fresh volume
   and a new `POSTGRES_IMAGE_TAG`, and restore the dump before starting the
   `dumpstation` service.

4. Note any running backups; let them finish first. Direct jobs active during
   the switch are marked `interrupted`.

## What changes

| Area | v1 | v2 |
| --- | --- | --- |
| Images | `ghcr.io/monzim/dumpstation` (API) + `ghcr.io/monzim/dumpstation/web` (UI, port 3000) | `ghcr.io/monzim/dumpstation` only (API + UI on 8080). The web image is retired |
| Compose services | `postgres`, `backend` (`dumpstation_backend`), `web` | `postgres`, `dumpstation` |
| UI configuration | `VITE_API_BASE_URL`, `VITE_TURNSTILE_SITE_KEY` on the web container | Not needed. The server serves `/config.js` with the API base and the Turnstile site key from `TURNSTILE_SITE_KEY` |
| CORS | Required (UI on another origin) | Usually unnecessary; leave `CORS_ALLOWED_ORIGINS` empty unless another origin calls the API |
| `DUMPSTATION_SECRET_KEY` | Required by the server but missing from the Compose file | Required and passed by the Compose file |
| `DISCORD_WEBHOOK_URL` | Required by the Compose file | Optional. Without it sign-in codes go to the server log |
| Demo account | Seeded unless `APP_ENV=production` | Login route controlled by `DEMO_ENABLED` (default `true` unless `APP_ENV`/`GO_ENV=production`; the v2 Compose file sets `false`) |
| `PUBLIC_URL` | n/a | New. The external URL used by agents and GitHub sign-in |
| Execution | Server only | Server (direct) or agents |
| Storage providers | `s3`, `r2` | `s3`, `r2`, `minio`, `s3_compatible` |
| Backup format | Plain SQL or custom, varied by version | Always custom format with SHA-256 |

## Step by step (Compose)

1. Stop v1: `docker compose down` (volumes are kept).
2. Replace your compose file with the v2 [`configs/compose.yml`](../configs/compose.yml),
   or edit yours:
   - delete the `web` service;
   - rename `backend` to `dumpstation` (optional) and change its port mapping
     to `${DUMPSTATION_PORT:-8080}:8080`;
   - add `DUMPSTATION_SECRET_KEY`, `PUBLIC_URL`, `APP_ENV=production`,
     `DEMO_ENABLED=false`;
   - remove `CORS_*` unless you need them;
   - keep the PostgreSQL image version you had (see above).
3. Update `.env` from [`configs/.env.example`](../configs/.env.example): set
   `DUMPSTATION_SECRET_KEY` (your existing key) and `PUBLIC_URL`; drop
   `VITE_*`, `WEB_PORT`, `BACKEND_PORT`.
4. Point your reverse proxy at the single service on port 8080 for every
   path (`/`, `/api/`, `/agent/`, `/config.js`). Remove the old UI upstream.
   See the timeout and body-size settings in
   [DEPLOYMENT.md](DEPLOYMENT.md#reverse-proxy).
5. **GitHub sign-in:** the callback is now served on the same origin as the
   UI. Set `GITHUB_REDIRECT_URL=https://<your-host>/api/v1/auth/github/callback`
   and update the *Authorization callback URL* of your GitHub OAuth app to
   match. `WEB_ORIGIN` can be removed when the UI and API share a host. The
   UI now passes tokens in the URL fragment and binds the result to the tab
   that started sign-in, so old bookmarked callback URLs will not work.
6. Start: `docker compose pull && docker compose up -d`, then
   `docker compose logs -f dumpstation`. You should see "Auto-migration
   completed successfully".
7. Sign in, open **System Health**, and run **Test** on each storage
   configuration and a manual backup of one database.

Kubernetes or bare-metal installs: the same rules apply. Run one server
container with `WEB_DIR` pointing at the built UI (`/app/web` in the image)
and remove the separate UI deployment.

## Automatic migrations

On every start the server runs GORM auto-migration plus idempotent
statements (`server/internal/database/database.go`). Safe to run repeatedly:

1. Drop v1 check constraints whose allowed values changed
   (`chk_backups_status`, `chk_restore_jobs_status`,
   `chk_storage_configs_provider`); v2 versions (`*_v2`) are recreated. New
   backup statuses include `cancelled`; new providers `minio` and
   `s3_compatible`.
2. Drop the global unique index `idx_user_label_name`; labels become unique
   per user.
3. Create new tables: `agents`, `agent_enrollments`, `agent_jobs`,
   `job_events`; add new columns to existing tables (execution mode, agent
   assignment, time zone, backup stage/trigger/executor/storage/checksum/
   format/error code, restore targets and stages, ...).
4. Relax `users.discord_user_id` to nullable; add `users.github_login`,
   `users.github_user_id`, `users.avatar_url`,
   `notification_configs.telegram_bot_token`/`telegram_chat_id`, make
   `notification_configs.discord_webhook_url` nullable, add
   `otp_tokens.purpose` and `otp_tokens.entity_id`.
5. Backfills:
   - pin every existing backup to its database's current storage
     (`backups.storage_id`);
   - set `execution_mode = 'direct'` on every existing database;
   - mark restores that were left `pending`/`running` by v1 as `failed`
     ("Restore status was not tracked before v2").

Failures of individual patch statements are logged as warnings and do not
stop the server.

## Behaviour changes

- **Existing databases stay direct.** Nothing runs on an agent until you
  edit a database and choose an agent.
- **Existing backups keep working.** They are pinned to the storage they
  were written to, so changing a database's storage later does not orphan
  them. Legacy plain-format backups restore through DumpStation's own SQL
  replayer; they have no recorded checksum, so verification is skipped for
  them.
- **Encryption of secrets.** New and edited values (database passwords,
  storage keys, webhook URLs, Telegram tokens, TOTP secrets) are stored
  encrypted with an `enc:v1:` prefix. v1 plaintext values stay readable and
  are encrypted the next time each record is saved. To encrypt everything
  at once, open and save each storage, notification channel and database.
- **Retention never deletes the newest successful backup**, even with
  `count = 1` or an expired `days` window.
- **One active backup per database.** A schedule that fires while a backup is
  still running is skipped instead of starting a parallel dump.
- **Missed schedules** are reported in the activity log and notifications.
- **Restores** require typing the target name when they can overwrite data,
  never run `psql`, and are recorded with stages and an execution log.
- **Downloads** send the one-time code only to the requesting user's own
  notification channels.
- **2FA** is now enforced for GitHub sign-ins too, and pending-2FA tokens are
  rejected on all API routes.
- **Roles** are re-read from the database on every request.
- The REST API gained many endpoints (see [API.md](API.md)); some list
  responses changed shape (for example `GET /backups` is now paginated:
  `{items, total, limit, offset}`). Swagger at `/swagger/` is the legacy
  generated spec and may lag behind.

## Rollback

v2 only adds tables and columns and relaxes constraints, so the v1 server can
usually start against a migrated database. Data created by v2 may not be
understood by v1:

- backups with status `cancelled` or providers `minio`/`s3_compatible`
  violate nothing in the database but are unknown to v1;
- secrets that v2 re-encrypted (`enc:v1:...`) are unreadable for v1 (storage
  keys, database passwords, webhook URLs, TOTP secrets edited under v2);
- agent databases cannot run on v1.

The reliable rollback is to restore the metadata dump taken before the
upgrade and redeploy the v1 images and compose file:

```bash
docker compose down
docker compose up -d postgres
docker compose exec -T postgres dropdb -U postgres backup_service
docker compose exec -T postgres createdb -U postgres backup_service
docker compose exec -T postgres pg_restore -U postgres -d backup_service < dumpstation-v1.dump
# switch back to the v1 compose file, then:
docker compose up -d
```

Backups taken by v2 remain in your bucket as ordinary `pg_dump` custom-format
files and can be restored manually with `pg_restore` even after a rollback.
