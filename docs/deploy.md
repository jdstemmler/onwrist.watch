# Deploy runbook

onwrist runs as a SvelteKit app container plus a Postgres 17 container via
docker compose. This doc is the operator's reference: local dev, the
production topology and environment, routine updates, backups, restore,
and moving an install to hosted infrastructure. For a first-time setup,
start with the README's Quickstart instead.

## Local dev (scratch stack)

Local development runs against a disposable Postgres in Docker, never
against your real compose project.

```sh
npm ci
docker compose -f docker-compose.scratch.yml -p onwrist-scratch up -d
env $(cat .env.scratch | xargs) npm run dev
```

`docker-compose.scratch.yml` starts a single `postgres:17-alpine` container
(project `onwrist-scratch`) with `tmpfs` data (nothing persists across
`down`), exposed on host port `55432`. `.env.scratch` points `DATABASE_URL`
at it (`postgres://onwrist:scratch@localhost:55432/onwrist`) and sets
`ORIGIN` for port 5199, plus Cloudflare's official always-pass Turnstile
test keys and a `MAIL_FROM` — it deliberately omits `RESEND_API_KEY`, so
account emails print to the console via the log mailer instead of sending.

Migrations run automatically on app startup (`getDb()` in
`src/lib/server/db/index.ts` applies `drizzle/` migrations before serving).
There's no separate migrate step.

`npm run seed` seeds the scratch DB with one verified user (`seed@onwrist.local`)
owning 12 watches and ~4 months of wear history; it refuses to run against a
non-empty database, so it's safe to call repeatedly during a fresh
scratch-stack session but will no-op (exit 1) once seeded — tear down and
re-`up` the scratch stack to reseed from empty.

Tear down when done: `docker compose -f docker-compose.scratch.yml -p onwrist-scratch down`.

**Never** run `docker compose` (no `-f`/`-p`) for dev work — that targets
your real compose project and its persistent volumes.

## Production topology

`docker-compose.yml` (project name `onwrist`) defines two services:

- **`db`** — `postgres:17-alpine`, credentials from `POSTGRES_PASSWORD` (env,
  required), database/user both `onwrist`. Data lives in the named volume
  `onwrist_pgdata` (survives `down`, not `down -v`). Healthchecked via
  `pg_isready`.
- **`onwrist`** (the app) — built from the repo `Dockerfile`, port 3000.
  Connects to the db service via `DATABASE_URL:
  postgres://onwrist:${POSTGRES_PASSWORD}@db:5432/onwrist`. Waits for the db
  healthcheck before starting; its own healthcheck probes `/healthz`, which
  round-trips the database. Env consumed by the app
  (`src/lib/server/config.ts`):

  | Var | Meaning |
  | --- | --- |
  | `ORIGIN` | Required — must match the exact URL the dashboard is loaded from, or SvelteKit's CSRF check rejects form POSTs. Also used to build absolute links in account emails. |
  | `SESSION_DAYS` | Login session length in days, sliding (default 30). |
  | `APP_NAME` | Display name (nav brand, page titles, PWA name); default `onwrist`. |
  | `BODY_SIZE_LIMIT` | Default `25M` — adapter-node caps request bodies at 512K by default and phone photo uploads exceed that. |
  | `DATA_DIR` | Photo storage root; default `./data`. |
  | `MAIL_FROM` | From-address for account emails (verify/reset/change). |
  | `RESEND_API_KEY` | Resend API key for sending account emails. **Unset ⇒ emails are logged to stdout, not sent** — fine while you're the only user, but nobody else will receive their verify/reset links until this is set. |
  | `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile bot check on signup. **Fails closed**: with these empty nobody can sign up at all. Cloudflare's public test keys (see README Quickstart) enable signup without bot protection — never leave those on a real deployment. |
  | `POSTGRES_PASSWORD` | Postgres superuser password for the `db` service (required, no default). |
  | `ADMIN_EMAIL` | Seeds one `admin`-role account at boot if none exists; unset ⇒ no admin is seeded and `/admin` stays 404 for everyone. Details under "First-boot admin" below. |
  | `ADDRESS_HEADER` | Header trusted for the client IP (per-IP rate limits). **Empty (default): the connecting socket's address is used** — correct when clients reach the port directly. Behind a proxy/tunnel, requests all arrive from the proxy's socket and share one rate-limit bucket — ten failed logins by anyone would lock out login for everyone — so set the header your proxy **always overwrites** (cloudflared: `CF-Connecting-IP`) and make the proxy the only path in (`BIND_ADDRESS=127.0.0.1`). A configured-but-missing header 500s every request; a spoofable one lets clients forge rate-limit identities. |
  | `BIND_ADDRESS` | Host interface the app port publishes on; default `0.0.0.0` (reachable from your network). Set `127.0.0.1` when a same-host proxy/tunnel should be the only way in. |

  Per-user preferences — home timezone and the stale-session-open nudge
  threshold — live on the `users` row and are edited on `/settings`; they
  are not environment variables.

  `docker-compose.yml` forwards all of the above except `DATA_DIR` (left at
  its default). The mail/captcha/admin vars pass through with empty (`:-`)
  defaults, not `:?`-required, so the app boots without them configured —
  and warns at boot in production (`assertConfig`) about the two risky
  states: log-mailer active (account-recovery links in stdout) and
  Turnstile unset (signup disabled).

  **First-boot admin:** setting `ADMIN_EMAIL` in `.env` before the first
  `docker compose up` seeds one `admin`-role account at that address
  (`ensureAdmin()`, called from `getDb()` on first DB access; idempotent —
  it no-ops if an admin already exists, so it's safe to leave the var set
  permanently). The seeded account has an unusable random password hash;
  there's no separate admin-invite step. Set the real password by running
  the ordinary forgot-password flow at `/reset` against `ADMIN_EMAIL` —
  check the container logs (or your `RESEND_API_KEY` mailbox) for the
  reset link.

### Photo storage

Photos are stored on disk by the `PhotoStorage` fs driver
(`src/lib/server/storage/fs.ts`) under `${DATA_DIR ?? './data'}/photos`,
mounted into the container via the `./data:/data` bind volume — the
default. Setting the five `S3_*` env vars (see `.env.example`) switches
`getStorage()` to the S3-compatible driver (`src/lib/server/storage/s3.ts`;
Backblaze B2, Cloudflare R2, MinIO, AWS) and photos live in a **private**
bucket instead — the app remains the only reader, since per-user access is
enforced by the photo route, not the bucket. Partial S3 config fails at
boot rather than at the first upload.

**Photo storage ownership (fs driver):** the app container runs as the
unprivileged `node` user (uid 1000), so the bind-mounted `./data`
directory on the host must be writable by uid 1000:

```sh
sudo chown -R 1000:1000 data/
```

Run this once before first boot (photo uploads fail with EACCES otherwise).

## Routine updates

Releases are tagged `vX.Y.Z`. Update by checking out the newest one:

```sh
git fetch --tags
git checkout "$(git tag -l 'v*' --sort=-v:refname | head -1)"
docker compose up -d --build onwrist
```

This rebuilds the app image and recreates only the `onwrist` service — the
`db` container stays up, and Drizzle migrations run automatically at app
boot (kicked off eagerly by `hooks.server.ts`, so a broken migration shows
in the logs immediately rather than as 500s on first request). Verify with
`docker compose logs --tail 20 onwrist` (expect
`Listening on http://0.0.0.0:3000`), `docker compose ps` (the `onwrist`
healthcheck probes `/healthz`), and a smoke-test of `/log`.

Track the tags, not `main`: `main` is the trunk and carries work that has
not been released yet. The `production` branch always points at the most
recent release, so `git checkout production` works too if you would rather
follow a branch. Only the latest release is supported (see
CONTRIBUTING.md).

## Backup

Two things need backing up: the Postgres database and (with the fs photo
driver) the photos directory. All account/auth tables are ordinary tables
in the same database — `pg_dump` picks them up automatically.

**Database** — nightly `pg_dump` via cron on the host, dumping through the
running container:

```sh
# crontab on the host, e.g. daily at 03:15
15 3 * * * docker compose exec -T db pg_dump -U onwrist onwrist | gzip > /path/to/backups/onwrist-$(date +\%Y\%m\%d).sql.gz
```

Prune old dumps on whatever retention policy you're comfortable with, e.g.
`find /path/to/backups -name 'onwrist-*.sql.gz' -mtime +30 -delete`.

**Photos (fs driver)** — rsync the data directory to backup storage after
(or independently of) the dump. Files are stored per-user-prefixed
(`data/photos/<userId>/<watchId>/<uuid>.webp`), but that's just key
layout — back up the whole tree, no per-user step needed:

```sh
rsync -av --delete /path/to/onwrist/data/photos/ /path/to/backups/photos/
```

Neither needs the app stopped (pg_dump is a consistent snapshot; photos
are immutable once uploaded). With the S3 driver, use your provider's
bucket replication/lifecycle instead of rsync.

Two things this section can't do for you: **verify the cron entries
actually exist on the box** (`crontab -l`), and **keep a copy off the
box** — a backup on the same disk as production doesn't survive the disk.
Sync the dump directory somewhere external (rclone to object storage, a
second machine, anything), and rehearse a full restore (next section)
against the scratch stack before you need it for real.

## Restore procedure

1. Stop the app service (leave `db` up): `docker compose stop onwrist`.
2. Drop and recreate the database, then restore from the newest good dump.
   The drop/recreate is not optional: piping a plain-SQL dump over existing
   objects sprays errors and can interleave old and new rows.
   ```sh
   docker compose exec -T db dropdb -U onwrist onwrist
   docker compose exec -T db createdb -U onwrist onwrist
   gunzip -c /path/to/backups/onwrist-YYYYMMDD.sql.gz | docker compose exec -T db psql -U onwrist onwrist
   ```
3. Photos (fs driver): `rsync -av /path/to/backups/photos/ /path/to/onwrist/data/photos/`.
4. Start the app back up: `docker compose start onwrist`. Migrations run
   automatically on boot and are a no-op if the restored schema is already
   current.
5. Smoke-test: load `/log`, confirm the collection and current on-wrist
   state look right.

## Moving to hosted infrastructure

To move an install off the local box to a hosted Postgres + hosted app
(any PaaS that builds a Dockerfile works):

1. **Dump/restore to hosted PG:** `pg_dump` the local database (per
   Backup, above) and restore it into the hosted Postgres **before the
   app's first deploy there** — if the app boots against an empty database
   first, its migrations + admin seed create objects a later restore then
   collides with. Confirm row counts match. If the restore errors on
   `OWNER TO onwrist`, create that role first (`CREATE ROLE onwrist;
   GRANT onwrist TO <your-hosted-user>;`), and if you reset a hosted
   database's `public` schema by hand, re-grant it (`GRANT USAGE, CREATE ON
   SCHEMA public TO onwrist;`) — foreign-key checks run as the table owner
   and fail without it.
2. **Photos → object storage:** storage keys are identical across drivers,
   so bulk-upload the existing `data/photos/` tree to the bucket with
   matching keys (e.g. `rclone copy data/photos/ remote:bucket/`) before
   flipping the vars, and existing photo records keep resolving.
3. **Env swap:** point `DATABASE_URL` at the hosted Postgres and set the
   five `S3_*` vars. Most PaaS platforms inject `PORT` (adapter-node honors
   it) and front the app with their own edge — set
   `ADDRESS_HEADER=X-Forwarded-For` only if the platform's edge sets it
   trustworthily, and keep `ORIGIN` at the public URL the dashboard loads
   from.
4. Cut DNS over to the hosted app, verify (login, stats, a photo
   upload/delete round-trip, `/healthz`), then decommission the local
   containers — keeping the last dump and the old volume until you're
   confident.
