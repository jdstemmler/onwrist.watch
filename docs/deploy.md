# Deploy runbook

onwrist runs as a SvelteKit app container plus a Postgres 17 container,
normally on a homelab box behind a cloudflared tunnel. This doc covers local
dev, the production topology, routine deploys, the (completed) one-time
legacy cutover, backups, and the eventual homelab → hosted move.

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
- **`onwrist`** (the app) — built from the repo `Dockerfile`, port 3000.
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
  | `ADMIN_EMAIL` | Seeds one `admin`-role account at boot if none exists; unset ⇒ no admin is seeded and `/admin` stays 404 for everyone. Details under "First-boot admin" below. |
  | `ADDRESS_HEADER` | Header trusted for the client IP; compose defaults it to `CF-Connecting-IP`. Behind cloudflared every request reaches the app from the tunnel's socket, so without this all per-IP rate limits share **one global bucket** — ten failed logins by anyone would lock out login for everyone. Cloudflare always overwrites `CF-Connecting-IP` so it can't be client-spoofed, but that trust is only sound while the port is loopback-bound (`BIND_ADDRESS` below). **Not behind Cloudflare? Set it empty** — adapter-node 500s on any request missing a configured header. |
  | `BIND_ADDRESS` | Host interface the app port publishes on; compose defaults to `127.0.0.1` so the tunnel is the only way in. LAN-only deploy without a tunnel: set `0.0.0.0` (and clear `ADDRESS_HEADER`). |

  Per-user preferences — home timezone and the stale-session-open nudge
  threshold — live on the `users` row and are edited on `/settings`; they are
  no longer environment variables (`HOME_TZ`, `STALE_SESSION_HOURS` are
  gone). There's likewise no `DASH_PASSWORD` — login is per-account
  email+password.

  `docker-compose.yml`'s `onwrist` service `environment:` block forwards all
  of the above except `DATA_DIR` (left at its default): `MAIL_FROM`,
  `RESEND_API_KEY`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, and
  `ADMIN_EMAIL` are passed through with empty (`:-`) defaults, not
  `:?`-required, so the app still boots without email/captcha/admin
  configured — an empty `RESEND_API_KEY` falls back to logging account
  emails to stdout instead of sending them, same as the scratch stack, and
  an empty `ADMIN_EMAIL` just means no admin gets seeded (`/admin` stays 404
  for everyone). Note the captcha is different: it **fails closed**, so with
  the Turnstile keys empty nobody can sign up at all (the widget can't
  render and server-side verification rejects). The app warns about both
  situations at boot in production (`assertConfig`). Set the four
  mail/captcha vars in `.env` for a working production signup flow; set
  `ADMIN_EMAIL` to get an admin console.

  **First-boot admin:** setting `ADMIN_EMAIL` in `.env` before the first
  `docker compose up` seeds one `admin`-role account at that address
  (`ensureAdmin()`, called from `getDb()` on first DB access; idempotent —
  it no-ops if an admin already exists, so it's safe to leave the var set
  permanently). The seeded account has an unusable random password hash;
  there's no separate admin-invite step. The operator sets the real
  password by running the ordinary forgot-password flow at `/reset` against
  `ADMIN_EMAIL`, same as any user would — check the container logs (or your
  configured `RESEND_API_KEY` mailbox) for the reset link.

Photos are stored on disk by the `PhotoStorage` fs driver
(`src/lib/server/storage/fs.ts`) under `${DATA_DIR ?? './data'}/photos`,
mounted into the container via the `./data:/data` bind volume. There is no
object-storage driver yet — an S3/R2-compatible `PhotoStorage` implementation
is a documented follow-on for when the app leaves the homelab (see
"Homelab → hosted" below).

**Photo storage ownership:** the app container runs as the unprivileged
`node` user (uid 1000), so the bind-mounted `./data` directory on the host
must be writable by uid 1000:

```sh
sudo chown -R 1000:1000 data/
```

Run this once before the first deploy of a non-root image (photo uploads
fail with EACCES otherwise). Pre-existing root-owned files from earlier
root-container deploys need the same one-time chown.

In front of both services: an existing cloudflared tunnel pointed at
`localhost:3000`. Cloudflare Access in front of that is optional
belt-and-suspenders; the app has its own per-account login (with rate
limiting and a Turnstile check on signup) regardless.

**Status:** the legacy cutover has been run (July 2026) — production is
**live** on this Postgres-backed compose stack, publicly reachable through
the tunnel on `:3000`. `data/photos/` is live app storage (managed by
`PhotoStorage`); `data/watches.db` is the pre-cutover SQLite archive, kept
per step 5 of the cutover procedure. Day-to-day rollback is now Postgres
backups (see "Backup" / "Restore procedure" below), not the SQLite file.

## Routine deploys

Deploys ship from `main` (see "Branching & deploy workflow" in
`CLAUDE.md`: features land on `develop` via PR, and a `develop` → `main`
PR is the release). On the homelab box:

```sh
git pull --ff-only
docker compose up -d --build onwrist
```

This rebuilds the app image and recreates only the `onwrist` service — the
`db` container stays up, and Drizzle migrations run automatically at app
boot (kicked off eagerly by `hooks.server.ts`, so a broken migration shows
in the logs immediately rather than as 500s on first request). Verify with
`docker compose logs --tail 20 onwrist` (expect
`Listening on http://0.0.0.0:3000`), `docker compose ps` (the `onwrist`
service healthcheck probes `/healthz`, which round-trips the DB), and a
smoke-test of `/log`.

## Legacy cutover (one-time — COMPLETED)

> ✅ This procedure was run in July 2026 and production now runs on the
> Postgres stack. It is kept for the record; do not re-run it.

> ⚠️ **The cloudflared tunnel is already live, routed at `:3000`.** The old
> single-user app is stopped, but the tunnel was never taken down. The new
> stack also serves on **`:3000` — unchanged, no port flip**. That means
> **the instant something binds `:3000`, it is publicly reachable through
> the existing tunnel.** There is no separate "flip DNS" step to buy you
> time — `docker compose up -d` (step 4 below) *is* the go-live moment.
> Everything before it (bringing up only `db`, running the migration) stays
> off `:3000` and is not public.

This is a deliberate, operator-run, one-time procedure to move the existing
single-user SQLite data (`data/watches.db`, `data/photos/`) onto this
Postgres stack under an owner account. It is driven by
`npx tsx scripts/migrate-legacy.ts` (`npm run migrate:legacy`), which reads
the SQLite file **read-only** — it is never modified, so it remains the
rollback path regardless of how the migration goes. The command refuses to
run against a Postgres that already has watches, so a failed or aborted
attempt can always be retried by wiping the target Postgres (see Rollback)
and running it again.

1. **Back up.** Belt-and-suspenders — the migration never writes to the
   source — but copy `data/watches.db` and `data/photos/` somewhere safe
   before starting anyway:
   ```sh
   cp data/watches.db /path/to/backups/pre-cutover-watches.db
   cp -r data/photos /path/to/backups/pre-cutover-photos
   ```
2. **`.env` prerequisites.** Ensure `.env` (repo root) has: `POSTGRES_PASSWORD`,
   `ORIGIN`, the mail/Turnstile vars if you want real account emails and the
   signup captcha enforced, `ADMIN_EMAIL` (seeds the admin at app boot), and
   **`OWNER_EMAIL`** — the address that will own the migrated collection.
   `OWNER_EMAIL` is read only by the migration script (it isn't part of
   `docker-compose.yml`'s `environment:` block, since the running app never
   needs it), so it's fine to keep it in `.env` and export it into the
   migration command's shell, or pass it inline as shown below.
   `OWNER_EMAIL` and `ADMIN_EMAIL` must be **different** addresses — the
   migration seeds the owner as a member, and `ensureAdmin` never promotes
   an existing account, so a shared address would leave you with no admin
   (silent `/admin` 404).
3. **Bring up Postgres only, then migrate.** `docker compose up -d db`
   starts just the `db` service — no app, nothing bound to `:3000`, nothing
   public (`db` is not tunneled). `docker compose` reads `.env` on its own,
   but the migration command below interpolates `${POSTGRES_PASSWORD}` into
   a shell variable, and your interactive shell does **not** have it —
   load `.env` into the shell first:
   ```sh
   set -a; . ./.env; set +a
   ```
   Do this once per shell before this step and before any later command in
   this section that interpolates `.env` vars (`${POSTGRES_PASSWORD}`, or
   the `-e ADMIN_EMAIL`/`-e MAIL_FROM`/etc. flags in step 4's preview
   `docker run`). If `POSTGRES_PASSWORD` contains URL-special characters
   (`@ / # : ?`), percent-encode them before they land in `DATABASE_URL`
   (e.g. `@` → `%40`) or the connection string will parse incorrectly. Then
   run the migration against the real data:
   ```sh
   docker compose up -d db
   # db isn't published to the host by design (only :3000 is ever tunneled),
   # so reach it via its container IP for this one step:
   DB_IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$(docker compose ps -q db)")
   DATABASE_URL="postgres://onwrist:${POSTGRES_PASSWORD}@${DB_IP}:5432/onwrist" \
     OWNER_EMAIL="you@example.com" \
     npm run migrate:legacy
   ```
   > **⚠️ If `data/photos/` is root-owned (an old container created it) and
   > you have no passwordless sudo, the host-run command above fails at the
   > photo-copy step with `EACCES … mkdir data/photos/…` — the migration
   > rolls back cleanly (Postgres left empty, source untouched), but it can't
   > write the migrated photos as your user.** Run it instead inside a
   > **root container** whose node major + libc match the host (host node
   > 24/glibc → `node:24`), mounting the repo + `data/` and joining the db
   > network. This also avoids needing `.env` in your shell for the DB host
   > (`@db:5432` resolves on the compose network):
   > ```sh
   > PW=$(grep -E '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)
   > docker run --rm --network "$(docker inspect -f '{{range $k,$_ := .NetworkSettings.Networks}}{{$k}}{{end}}' "$(docker compose ps -q db)")" \
   >   -v "$PWD":/app -v "$PWD/data":/data -w /app \
   >   -e LEGACY_DB=/data/watches.db -e LEGACY_PHOTOS=/data/photos -e DATA_DIR=/data \
   >   -e OWNER_EMAIL="you@example.com" \
   >   -e DATABASE_URL="postgres://onwrist:${PW}@db:5432/onwrist" \
   >   node:24 npx tsx scripts/migrate-legacy.ts
   > ```
   > The migrated photos are then root-owned, matching what the (root)
   > app container reads. Note: a failed host attempt burns an identity id
   > on rollback, so the owner's `id` may be 2 rather than 1 — harmless.
   This runs against `LEGACY_DB=./data/watches.db` and
   `LEGACY_PHOTOS=./data/photos` (the script's defaults — the real data, not
   a copy) and writes migrated photos under `DATA_DIR=./data` (default),
   i.e. into the same `data/` tree the app's `./data:/data` bind volume
   already serves. Confirm the printed verification summary — owner email,
   watch/session/photo counts, `checksum: OK` — before continuing. **Nothing
   is public yet.**
4. **GO-LIVE (immediate public exposure).** `docker compose up -d` brings up
   the full stack; the app binds `:3000` and is instantly live through the
   existing tunnel. Log in as the owner via the reset flow (`/reset` against
   `OWNER_EMAIL`) — production's `.env` has `RESEND_API_KEY` set, so this is
   a **real email send** to the owner's inbox, not a logged link (if
   `RESEND_API_KEY` is unset, the reset link is in
   `docker compose logs onwrist` instead of an email); the reset link
   expires in **30 minutes**, so only request it once you're at the
   keyboard ready to use it. Spot-check the migrated collection, stats, and
   the photo render on the real URL. Do the same for the admin
   (`ADMIN_EMAIL`, seeded at boot by `ensureAdmin`) to confirm `/admin`
   works.

   **To verify privately first** instead of going straight to `:3000`,
   build the image and run it manually on a throwaway host port before
   touching the compose stack's `:3000` mapping. A plain `docker run` lands
   on the default bridge network and can't reach the compose-network `db`,
   so join that network explicitly and address `db` by its compose service
   name instead of a container IP:
   ```sh
   docker build -t onwrist:cutover .
   NET=$(docker inspect -f '{{range $k,$_ := .NetworkSettings.Networks}}{{$k}}{{end}}' "$(docker compose ps -q db)")
   docker run --rm -d --name onwrist-preview -p 127.0.0.1:8443:3000 \
     --network "$NET" \
     -e DATABASE_URL="postgres://onwrist:${POSTGRES_PASSWORD}@db:5432/onwrist" \
     -e ORIGIN="http://localhost:8443" -e ADMIN_EMAIL \
     -e SESSION_DAYS -e APP_NAME -e MAIL_FROM -e RESEND_API_KEY \
     -e TURNSTILE_SITE_KEY -e TURNSTILE_SECRET_KEY \
     -v "$(pwd)/data:/data" onwrist:cutover
   ```
   This still interpolates `.env` vars (`${POSTGRES_PASSWORD}`, and the
   bare `-e ADMIN_EMAIL`/`-e MAIL_FROM`/etc. flags pull their values from
   the operator's shell environment) — make sure step 3's
   `set -a; . ./.env; set +a` is still in effect in this shell. Browse
   `http://localhost:8443` on the homelab box (nothing routes to `8443`
   from the tunnel), confirm what you need, then
   `docker stop onwrist-preview` and run step 4's `docker compose up -d` for
   the real go-live.
5. **Keep the SQLite file as the rollback** for a few weeks — `data/`
   already lives outside anything the migration touches destructively.
   Once you're confident the cutover is solid, a follow-up removes
   `OWNER_EMAIL` and the migration scaffolding (`scripts/migrate-legacy.ts`,
   `scripts/rehearse-migration.sh`, the `better-sqlite3` devDependency) —
   deliberately not done as part of landing this.
6. **Rollback.** The SQLite source was never modified, so reverting is
   simple: `docker compose down` (stops the new stack, `:3000` is free
   again), then bring the old single-user SQLite-backed image back up on
   `:3000`. If the migration itself failed partway (verification mismatch),
   `migrateLegacy` already rolled back its own writes (deletes the owner —
   cascading watches/sessions/photos — and any copied photo objects), so
   Postgres is clean and a re-run of step 3 is safe without any manual
   cleanup. To deliberately redo a **successful** migration instead (e.g.
   wrong `OWNER_EMAIL`), wipe the target Postgres first — `docker compose
   down -v` (this destroys the `pgdata` volume) — then re-run from step 3.

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

Two things this section can't do for you: **verify the cron entries
actually exist on the box** (`crontab -l`), and **keep a copy off the
box** — a backup on the same disk as production doesn't survive the disk.
Sync the dump directory somewhere external (rclone to object storage, a
second machine, anything). Once real users have accounts, rehearse one
full restore (next section) into the scratch stack and note the date here.

## Restore procedure

1. Stop the app service (leave `db` up): `docker compose stop onwrist`.
2. Drop and recreate the database, then restore from the newest good dump.
   The drop/recreate is not optional: piping a plain-SQL dump over existing
   objects sprays errors and can interleave old and new rows.
   ```sh
   docker compose exec -T db dropdb -U onwrist onwrist
   docker compose exec -T db createdb -U onwrist onwrist
   gunzip -c /path/to/backups/onwrist-20260716.sql.gz | docker compose exec -T db psql -U onwrist onwrist
   ```
3. Restore photos: `rsync -av /path/to/backups/photos/ /path/to/onwrist/data/photos/`.
4. Start the app back up: `docker compose start onwrist`. Migrations run
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

## Cutover status

**Completed.** The legacy cutover was run in July 2026: production runs
the Postgres-backed `docker-compose.yml` stack, serving accounts,
per-user tenancy, quotas, the admin console, and the landing page (Plans
B–D). `data/watches.db` remains on disk as the pre-cutover archive until
the follow-up in cutover step 5 removes the migration scaffolding.
Routine updates follow "Routine deploys" above; recovery follows
"Restore procedure".
