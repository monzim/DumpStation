# Security

This document describes what DumpStation protects, against whom, and how.
To report a vulnerability, open a private security advisory on GitHub rather
than a public issue.

- [Assets and trust boundaries](#assets-and-trust-boundaries)
- [Threat model](#threat-model)
- [Agent controls](#agent-controls)
- [Execution safety](#execution-safety)
- [Storage access](#storage-access)
- [Secrets at rest and in logs](#secrets-at-rest-and-in-logs)
- [Network controls](#network-controls)
- [Authentication and authorization](#authentication-and-authorization)
- [Web hardening](#web-hardening)
- [A compromised agent: what it can and cannot do](#a-compromised-agent-what-it-can-and-cannot-do)
- [Operator checklist](#operator-checklist)

## Assets and trust boundaries

| Asset | Where |
| --- | --- |
| Backup artifacts (full copies of your databases) | Object storage |
| Database credentials | Metadata DB (encrypted) or only on agent hosts |
| Storage access keys, notification webhooks/bot tokens, TOTP secrets, DB Explorer credentials | Metadata DB (encrypted) |
| `DUMPSTATION_SECRET_KEY`, `JWT_SECRET` | Server environment |
| Agent credentials | SHA-256 on the server; plaintext only in the agent's state file |

```
 browser ──HTTPS──▶ server ──▶ metadata DB          (trusted core)
                      │  ▲
          presign/verify │  │ HTTPS, agent-initiated  (semi-trusted: agents)
                      ▼  │
               object storage ◀── presigned URLs ── agent ──▶ private DBs
```

The server and its metadata database are the trusted core. Agents are
semi-trusted: they are authenticated, but the design assumes one could be
compromised and limits what it can reach.

## Threat model

In scope:

- An unauthenticated attacker on the internet reaching the server.
- An authenticated user trying to reach another tenant's data.
- The read-only demo account trying to modify anything.
- A stolen or leaked enrollment token or agent credential.
- A compromised agent host.
- A tampered backup artifact (for example, written by a compromised agent or
  someone with bucket access) being restored.
- Server-side request forgery through configurable URLs and hosts.

Out of scope: a compromised server host or metadata database, a compromised
object storage account, and malicious administrators. Anyone who can read the
server's environment can decrypt every stored secret.

## Agent controls

| Control | Detail |
| --- | --- |
| Outbound only | Agents open no ports. Every request is agent-initiated over HTTPS (`/agent/v1`); the server never dials an agent |
| Enrollment tokens | `dse_` + 32 random bytes, stored as SHA-256, single use (consumed in a row-locked transaction), TTL 10 min to 24 h (default 60 min). Issuing a new token voids earlier unused ones. Revoked agents cannot enroll |
| Agent credentials | `dsa_` + 32 random bytes, returned exactly once, stored as SHA-256. The agent keeps it in `credentials.json` with mode 0600. Re-enrollment replaces it; revocation clears it |
| Recognisable prefixes | `dse_` and `dsa_` make leaked tokens easy to find with secret scanners |
| Lease tokens | Each leased job gets a random 24-byte lease token. Every job call must present it and is checked against the job's agent and owning user. Expired or reassigned leases get `409` |
| Tenant scoping | An agent belongs to one user. Databases can only be assigned to agents of the same owner; job lookups check both agent ID and user ID |
| Job kind whitelist | Only `backup`, `restore` and `test_connection` exist in the protocol. The agent refuses anything else; there is no "run command" job |
| Restore opt-in on both sides | Restore jobs require the server-side switch *and* `DUMPSTATION_ALLOW_RESTORE=true` on the agent. The server does not even hand restore jobs to an agent that has not opted in |
| Local credentials | With agent-local connections, database credentials never reach the server; only connection names, database names and hosts are reported |
| Rate limits | Enrollment: 5 burst then 1 per 6 s per IP. Agent API: 60 burst then 20/s per IP |
| Revocation | Immediate: credential hash cleared, requests rejected with `401`, the agent exits, long-polls re-check status on every iteration |
| TLS | Agent requires TLS 1.2+, supports a private CA (`DUMPSTATION_CA_FILE`) and warns loudly for `http://` URLs or disabled verification |

## Execution safety

Shared by the server's direct executor and the agent (`internal/pgexec`):

- **No shell.** Tools are started with `exec.CommandContext` and an explicit
  argument vector. No user-supplied string is interpreted by a shell.
- **Argument injection guard.** Host, database and user must not start with
  `-` or contain control characters; the database name may not contain `=`
  or `://` (libpq would treat it as a connection string); the host must be a
  single hostname or IP (no Unix socket paths, no lists); `sslmode` must be a
  known value.
- **Passfiles, not argv.** Passwords are written to a per-invocation libpq
  passfile (mode 0600) containing only the exact host/port/database/user
  entry, then deleted. Tools run with `--no-password`.
- **Scrubbed environment.** Every inherited `PG*` variable is removed before
  running a tool, so host settings cannot redirect a connection or leak a
  password.
- **Child processes die with the parent** (Linux `Pdeathsig`), so no orphaned
  `pg_dump` keeps running after a crash.
- **Restore safety.**
  - Custom-format archives are restored with `pg_restore --dbname`, which
    sends SQL over libpq and never interprets `psql` meta-commands.
    `--no-owner --no-privileges` is always used.
  - Plain SQL dumps (legacy v1) are replayed by DumpStation over the wire
    protocol, not by `psql`. Backslash meta-commands such as `\! cmd` or
    `\copy` are skipped, not executed.
  - The SHA-256 recorded at backup time is verified before restoring.
  - Restores into an existing configured database, and all `--clean`
    restores, require typing the target name.
  - Restores are never retried automatically.

SQL inside a restored artifact still runs with the privileges of the target
role. Restore with a role that has no more privileges than needed, and do not
restore artifacts you do not trust into servers where that role is a
superuser.

## Storage access

- Object keys are chosen by the server
  (`backups/<database-id>/<name>_<timestamp>_<backup-id>.dump`). Agents never
  choose or see other keys.
- Agents receive only presigned URLs scoped to one object: one `UploadPart`
  URL per part (30 min) for the multipart upload the server started, or one
  `GetObject` URL (1 h) for the artifact of a restore job leased to them.
  Agents never hold storage credentials.
- Browser downloads are OTP-gated (see below) and use a presigned URL valid
  5 minutes.
- Each backup is pinned to the storage it was written to; a storage
  configuration cannot be deleted while databases use it or artifacts live
  in it.

## Secrets at rest and in logs

- **Encryption at rest.** Columns tagged `serializer:secret` are encrypted
  with AES-256-GCM using `DUMPSTATION_SECRET_KEY` and stored with an
  `enc:v1:` prefix: database passwords, custom restore target passwords,
  storage access and secret keys, Discord webhook URLs, Telegram bot tokens,
  TOTP secrets (active and pending) and agent job payloads (which may carry
  central credentials). DB Explorer credentials are encrypted with the same
  key. Values written before v2 without the prefix remain readable and are
  encrypted the next time they are saved.
- **Responses never return secrets.** Passwords, keys and tokens are `json:"-"`;
  hosts, buckets and keys are masked in list responses; edit forms get
  `has_password`-style flags instead of values.
- **Log sanitization.** Tool output and agent-reported messages are passed
  through a sanitizer that strips `user:password@` in URIs and
  `password=...` pairs and caps length. Connection strings are displayed as
  `user@host:port/db`. Storage errors are mapped to short, credential-free
  messages.
- **Agent credentials** are stored hashed. The UI shows only a short token
  prefix.

Losing `DUMPSTATION_SECRET_KEY` makes encrypted values unrecoverable; you
would have to re-enter them. Back it up separately from the database.

## Network controls

- **`DIRECT_ALLOWED_CIDRS`.** When set, the server only connects (direct
  backups, restores, connection tests and DB Explorer) to hosts whose
  *every* resolved address is inside the listed networks. The connection is
  then pinned to the validated IP (`PGHOSTADDR`, with the hostname kept for
  TLS verification), so DNS cannot change between check and connect. Use
  agents for everything else.
- **Webhook SSRF guard.** Discord webhook URLs must be `https`, on
  `discord.com`, `discordapp.com`, `ptb.discord.com` or `canary.discord.com`
  (or subdomains), and every resolved address must be outside loopback,
  RFC 1918, link-local (incl. `169.254.169.254`), CGNAT, `0.0.0.0/8` and
  IPv6 loopback/ULA/link-local. Telegram always goes to
  `https://api.telegram.org`.
- **`TRUST_PROXY_HEADERS`** controls whether client IPs (rate limits, audit
  log, Turnstile) come from `X-Forwarded-For`/`X-Real-IP`. Enable it only
  behind a proxy you control that overwrites those headers.
- **Auth rate limiting** on login, code verification, demo login, GitHub
  login/callback and 2FA verification.

## Authentication and authorization

- **One-time codes.** 6 digits, valid `OTP_EXPIRATION_MINUTES` (default 5),
  posted to the system Discord webhook or, without one, written to the
  server log. Optional Cloudflare Turnstile in front of code requests.
- **GitHub OAuth** is restricted to one `GITHUB_ALLOWED_LOGIN`. The OAuth
  `state` is HMAC-bound to `JWT_SECRET` and kept in a short-lived HttpOnly
  cookie. The SPA adds a random **nonce** (kept in `sessionStorage`) that the
  server echoes back, so a sign-in result is only accepted by the browser tab
  that started it (login CSRF). Tokens are returned in the URL fragment,
  which browsers never send to servers or put in `Referer`.
- **2FA enforcement.** With TOTP enabled, both code sign-in and GitHub
  sign-in return only a pending-2FA token. API middleware rejects
  pending-2FA tokens everywhere except `/auth/2fa/verify`. Backup codes are
  stored hashed.
- **Sessions.** JWTs signed with `JWT_SECRET`, `JWT_EXPIRATION_MINUTES`
  (default 30) sliding via refresh, with an absolute cap of 12 hours.
- **Role re-check per request.** The auth middleware reloads the user's
  admin/demo flags from the database on every request, so a demoted or
  deleted user loses access immediately rather than when the token expires.
  Administrators cannot remove their own admin role; the demo account cannot
  become an administrator.
- **Tenant isolation.** Every resource (databases, storage, notifications,
  agents, backups, restores, labels, server connections) carries a user ID
  and every query is scoped by it. Administrators can see all resources.
  Restores can only use the caller's own databases and agents.
- **Demo account** (when `DEMO_ENABLED`): read-only. Write routes reject it,
  2FA management is blocked, and connection details are not returned.
- **Backup downloads** require a second factor: a 6-digit code sent to one of
  the *caller's own* Discord/Telegram channels, bound to that backup, valid
  5 minutes, compared in constant time.

## Web hardening

- The SPA is served with a Content-Security-Policy: `default-src 'self'`,
  scripts only from self and `challenges.cloudflare.com` (Turnstile), images
  from self/data/blob/GitHub avatars, `connect-src 'self'`,
  `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`.
- Every response sets HSTS, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
  a restrictive `Permissions-Policy`, COOP `same-origin` and CORP
  `same-site`.
- The UI and API share one origin, so CORS is off by default. A wildcard
  origin combined with credentials is refused at startup.
- Request bodies on the REST API are limited to 1 MiB.

## A compromised agent: what it can and cannot do

Assume an attacker controls an agent host and its credential.

**It can:**

- Read and modify every database reachable with the agent's local
  connections (that access existed on the host anyway).
- Receive the central credentials of databases assigned to it that use
  central credentials (they are part of the job payload). Prefer agent-local
  connections to avoid this.
- Upload arbitrary content as the artifact of backups assigned to it. Size
  checks will pass if it reports a matching size, so such backups could be
  poisoned. Restoring a poisoned artifact runs its SQL with the target role's
  privileges (but never `psql` meta-commands or shell commands).
- Download artifacts of restore jobs assigned to it, if restores were enabled
  on both sides.
- Report fake progress, success or failure for its own jobs, and see the
  names of databases it is asked to back up.

**It cannot:**

- List, read, overwrite or delete any other object or bucket: it holds no
  storage credentials and only gets per-object presigned URLs for keys the
  server chose.
- Touch jobs, backups or restores of other agents or other users (lease and
  tenant checks).
- Make the server execute commands, connect to arbitrary hosts or call
  arbitrary URLs.
- Receive restore jobs unless restores are enabled for it in DumpStation.
- Obtain user sessions, the JWT secret, the encryption key, storage keys or
  other databases' credentials.
- Keep access after you revoke it.

Response: revoke the agent, rotate the credentials of its databases, and
review recent backups from it (the job log shows the agent and transfer mode
for each).

## Operator checklist

- Serve DumpStation over HTTPS only and set `PUBLIC_URL` to the HTTPS URL.
- Generate `JWT_SECRET` and `DUMPSTATION_SECRET_KEY` randomly; back the key
  up offline.
- Enable TOTP for every account; consider Turnstile on public deployments.
- Leave `DEMO_ENABLED=false` in production.
- Set `DIRECT_ALLOWED_CIDRS` and use agents for anything outside it.
- Prefer agent-local connections; use read-only backup roles.
- Grant storage keys only the permissions listed in
  [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md#storage); enable bucket
  versioning or object lock if you need protection against deletion.
- Enable agent restores only where you need them.
- Back up the metadata database (it is what makes artifacts findable).
