# horolog

A single-user, self-hosted watch-collection tracker: inventory management,
low-friction wear-session logging via an installable PWA, and a stats
dashboard (day-of-week, time-of-day, total wear, cost-per-wear, calendar
views). Runs as a SvelteKit app + Postgres via docker compose on a
homelab, reachable from anywhere via cloudflared.

![dashboard screenshot placeholder](docs/screenshot.png)
<!-- TODO: replace with a real screenshot after first deploy -->

## Quickstart

> **Note:** production still runs the pre-Plan-A image; this compose stack is
> for the future cutover, not day-to-day dev — see "Status this branch" in
> `docs/deploy.md` and the Development section below for the scratch stack.

```sh
cp .env.example .env
# edit .env: set DASH_PASSWORD (the login password) and ORIGIN to the
# exact URL you'll load the dashboard from
docker compose up -d
```

The app serves on port 3000. Every page sits behind a single-password
"wrist check" login; sessions last 30 days (sliding) so your phone stays
logged in.

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
