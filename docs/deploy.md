# Deploy runbook

onwrist runs as a SvelteKit app container plus a Postgres 17 container,
normally on a homelab box behind a cloudflared tunnel. This doc covers local
dev, the production topology, backups, and the eventual homelab → hosted
move. It does **not** cover the SQLite → Postgres data migration — that's
Plan C's job (see the pointer at the bottom).

## Local dev (scratch stack)

Local development runs against a disposable Postgres in Docker, never
against the production compose project.

```sh
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
the production compose project and its persistent volumes.

## Production topology

`docker-compose.yml` (default project) defines two services:

- **`db`** — `postgres:17-alpine`, credentials from `POSTGRES_PASSWORD` (env,
  required), database/user both `onwrist`. Data lives in the named volume
  `pgdata` (survives `down`, not `down -v`). Healthchecked via `pg_isready`.
- **`horolog`** (the app) — built from the repo `Dockerfile`, port 3000.
  Connects to the db service via `DATABASE_URL:
  postgres://onwrist:${POSTGRES_PASSWORD}@db:5432/onwrist`. Waits for the db
  healthcheck before starting. Accounts now exist (self-serve signup/verify/
  login/reset/change-email), so auth env moved from a single shared password
  to per-account config. Env consumed by the app (`src/lib/server/config.ts`):

  | Var | Meaning |
  | --- | --- |
  | `ORIGIN` | Required — must match the exact URL the dashboard is loaded from, or SvelteKit's CSRF check rejects form POSTs. Also used to build absolute links in account emails. |
  | `SESSION_DAYS` | Login session length in days, sliding (default 30). |
  | `APP_NAME` | Display name (nav brand, page titles, PWA name); default `onwrist`. |
  | `BODY_SIZE_LIMIT` | Default `25M` — adapter-node caps request bodies at 512K by default and phone photo uploads exceed that. |
  | `DATA_DIR` | Photo storage root; default `./data`. |
  | `MAIL_FROM` | From-address for account emails (verify/reset/change). |
  | `RESEND_API_KEY` | Resend API key for sending account emails. **Unset ⇒ emails are logged to stdout, not sent** — fine for a homelab box without outbound mail configured, but real users won't receive their verify/reset links until this is set. |
  | `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile bot check on signup. |
  | `POSTGRES_PASSWORD` | Postgres superuser password for the `db` service (required, no default). |

  Per-user preferences — home timezone and the stale-session-open nudge
  threshold — live on the `users` row and are edited on `/settings`; they are
  no longer environment variables (`HOME_TZ`, `STALE_SESSION_HOURS` are
  gone). There's likewise no `DASH_PASSWORD` — login is per-account
  email+password.

  **Known gap:** `docker-compose.yml` on this branch still declares
  `DASH_PASSWORD` (required, no default), `HOME_TZ`, and `STALE_SESSION_HOURS`
  as container env — leftovers from before accounts landed that the app no
  longer reads. `.env.example` was updated to the table above (it has no
  `DASH_PASSWORD`), so the compose file and the example env are currently out
  of sync; treat `docker-compose.yml`'s env block as needing a follow-up fix,
  not as authoritative.

Photos are stored on disk by the `PhotoStorage` fs driver
(`src/lib/server/storage/fs.ts`) under `${DATA_DIR ?? './data'}/photos`,
mounted into the container via the `./data:/data` bind volume. There is no
object-storage driver yet — an S3/R2-compatible `PhotoStorage` implementation
is a documented follow-on for when the app leaves the homelab (see
"Homelab → hosted" below).

In front of both services: an existing cloudflared tunnel pointed at
`localhost:3000`. Cloudflare Access in front of that is optional
belt-and-suspenders; the app has its own per-account login (with rate
limiting and a Turnstile check on signup) regardless.

**Status this branch:** the `db` service and `DATABASE_URL` wiring above are
merged into `docker-compose.yml`, but production has never been run against
this compose file — production is currently stopped, still backed by SQLite
(`data/watches.db`, `data/photos/`), and that SQLite data is the rollback
path. Do not bring up the default compose project until Plan C's migration
and cutover land (see below).

## Backup

Two things need backing up: the Postgres database and the photos directory.
The `users`/`email_tokens`/`rate_limits` tables are ordinary tables in the
same database — `pg_dump` picks them up automatically, no separate step.

**Database** — nightly `pg_dump` via cron on the host, dumping through the
running container:

```sh
# crontab on the host, e.g. daily at 03:15
15 3 * * * docker compose exec -T db pg_dump -U onwrist onwrist | gzip > /path/to/backups/onwrist-$(date +\%Y\%m\%d).sql.gz
```

Prune old dumps on whatever retention policy you're comfortable with, e.g.
`find /path/to/backups -name 'onwrist-*.sql.gz' -mtime +30 -delete`.

**Photos** — rsync the data directory to backup storage after (or
independently of) the dump. Files are stored per-user-prefixed
(`data/photos/<userId>/<watchId>/<uuid>.webp`), but that's just key layout —
back up the whole tree, no per-user step needed:

```sh
rsync -av --delete /path/to/onwrist/data/photos/ /path/to/backups/photos/
```

Run both from the same cron entry or stagger them; neither needs the app
stopped (pg_dump is a consistent snapshot; rsync of already-written files is
safe to run live since photos are immutable once uploaded).

## Restore procedure

1. Stop the app service (leave `db` up): `docker compose stop horolog`.
2. Restore the database from the newest good dump:
   ```sh
   gunzip -c /path/to/backups/onwrist-20260716.sql.gz | docker compose exec -T db psql -U onwrist onwrist
   ```
   If restoring into a fresh volume, drop and recreate the database first
   (`docker compose exec -T db dropdb -U onwrist onwrist && docker compose exec -T db createdb -U onwrist onwrist`)
   so the restore starts clean.
3. Restore photos: `rsync -av /path/to/backups/photos/ /path/to/onwrist/data/photos/`.
4. Start the app back up: `docker compose start horolog`. Migrations run
   automatically on boot and are a no-op if the restored schema is already
   current.
5. Smoke-test: load `/log`, confirm the collection and current on-wrist
   state look right.

## Homelab → hosted runbook

When moving off the homelab box to a hosted Postgres + hosted app (whenever
that happens):

1. **Dump/restore to hosted PG:** `pg_dump` the homelab database (per
   Backup, above) and restore it into the hosted Postgres instance with
   `psql` pointed at the hosted connection string. Confirm row counts match
   before cutting over.
2. **Photos → object storage:** the fs `PhotoStorage` driver
   (`src/lib/server/storage/fs.ts`) stores each photo as a file under a key;
   moving to R2/S3 means implementing the same `PhotoStorage` interface
   (`put`/`get`/`delete`/`sizeOfPrefix`) against an S3-compatible client and
   swapping it in via `getStorage()` (`src/lib/server/storage/index.ts`).
   That driver is not built yet — it's a documented follow-on, not part of
   this plan. Until it exists, bulk-upload the existing `data/photos/` tree
   to the bucket with matching keys before flipping the driver, so existing
   watch records' stored keys keep resolving.
3. **Env swap:** point `DATABASE_URL` at the hosted Postgres connection
   string and (once built) the object-storage driver's credentials at the
   bucket. `ORIGIN` does **not** change for this move — it tracks the public
   URL the dashboard loads from, which stays the same tunnel hostname
   whether the app and db sit on the homelab box or a hosted VM.
4. Cut the tunnel over to the new app instance, verify, then decommission
   the homelab containers (keep the last backup for a while regardless).

## Plan C pointer

The SQLite → Postgres data migration and the actual production cutover are
Plan C's scope, not this branch's. Accounts (self-serve signup, per-user
tenancy, quotas) now exist in the app, but there's still no admin role UI,
no admin seeding, and no landing page — those ship with Plan C too. Until
Plan C runs, **production stays on the pre-Plan-A image** (SQLite-backed),
fully stopped, with its `data/` directory preserved as the rollback path.
Nothing in this doc authorizes bringing up the Postgres-backed
`docker-compose.yml` against real data — that only happens as part of Plan
C's migration/cutover procedure (which will also need to fix the stale
`DASH_PASSWORD`/`HOME_TZ`/`STALE_SESSION_HOURS` env block noted above).
