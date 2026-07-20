# onwrist

A self-hosted, multi-tenant watch-collection tracker: self-serve accounts,
inventory management, low-friction wear-session logging via an installable
PWA, and a stats dashboard (day-of-week, time-of-day, total wear,
cost-per-wear, calendar views). Runs as a SvelteKit app + Postgres via
docker compose on a homelab, reachable from anywhere via cloudflared.

![dashboard screenshot placeholder](docs/screenshot.png)
<!-- TODO: replace with a real screenshot after first deploy -->

## Quickstart

> **Note:** this compose stack *is* production (live since the July 2026
> cutover — see `docs/deploy.md`). For day-to-day dev use the scratch stack
> in the Development section below, never this one.

```sh
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD, ORIGIN (the exact URL you'll load the
# dashboard from), and — to actually receive verify/reset emails —
# RESEND_API_KEY, MAIL_FROM, TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY.
# Leaving RESEND_API_KEY unset logs account emails to the container's
# stdout instead of sending them.
docker compose up -d
```

The app serves on port 3000. Every page sits behind a per-account login
(sign up with an email + password, verify by email); sessions last 30 days
(sliding) so your phone stays logged in.

## Logging wear from your phone

Open `http://<host>:3000/log` in Safari and **Add to Home Screen**. The
installed app opens straight to the wear log: current on-wrist state, one-tap
put-on / swap / take-off, backfill, and inline corrections. That's the whole
workflow — no companion app or shortcut needed.

## Exposing it (cloudflared)

Point your existing cloudflared tunnel at `localhost:3000`. This is a
**later** step, not required to use the app — on your home LAN the app works
as-is, protected by its own login. Cloudflare Access on top is optional
belt-and-suspenders — the app no longer depends on edge auth.

Remember to update `ORIGIN` in `.env` to the tunnel hostname when you switch.

## Development

The app runs against Postgres. Local dev uses a disposable scratch stack —
never the production `docker-compose.yml` project:

```sh
docker compose -f docker-compose.scratch.yml -p onwrist-scratch up -d
env $(cat .env.scratch | xargs) npm run dev   # dev server on :5199
```

```sh
npm test             # Vitest suite (PGlite) — must be green before any commit
npm run check        # svelte-check / typecheck
npm run db:generate  # generate a Drizzle migration after schema changes
npm run seed         # seed the scratch DB with 12 watches + wear history (refuses non-empty DB)
```

Tear the scratch stack down with
`docker compose -f docker-compose.scratch.yml -p onwrist-scratch down`. See
`docs/deploy.md` for the production topology, backups, and restore.
