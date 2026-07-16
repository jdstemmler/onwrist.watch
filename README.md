# horolog

A single-user, self-hosted watch-collection tracker: inventory management,
low-friction wear-session logging via an installable PWA, and a stats
dashboard (day-of-week, time-of-day, total wear, cost-per-wear, calendar
views). Runs as one SvelteKit container on a homelab, reachable from
anywhere via cloudflared.

![dashboard screenshot placeholder](docs/screenshot.png)
<!-- TODO: replace with a real screenshot after first deploy -->

## Quickstart

```sh
cp .env.example .env
# edit .env: set AUTH_TOKEN to a real secret (protects the JSON API) and
# ORIGIN to the exact URL you'll load the dashboard from
docker compose up -d
```

The app serves the dashboard and a bearer-token JSON API (`/api/*`) from
one process on port 3000.

## Logging wear from your phone

Open `http://<host>:3000/log` in Safari and **Add to Home Screen**. The
installed app opens straight to the wear log: current on-wrist state, one-tap
put-on / swap / take-off, backfill, and inline corrections. That's the whole
workflow — no companion app or shortcut needed.

## Exposing it (cloudflared)

Point your existing cloudflared tunnel at `localhost:3000`. This is a
**later** step, not required to use the app — on your home LAN the app works
as-is (the dashboard is unauthenticated on the LAN; the API is protected by
the bearer token). When you add the tunnel, put Cloudflare Access in front of
every route. The `/api/*` surface is only used by scripts/automation you
write yourself; if you have none, no Access bypass is needed at all.

Remember to update `ORIGIN` in `.env` to the tunnel hostname when you switch.

## The JSON API (optional)

`/api/*` (state, put-on, swap, take-off, backfill, stats) is bearer-token
protected and exists for automation. One historical client is documented in
[`docs/shortcut.md`](docs/shortcut.md) — a step-by-step iOS Shortcut build —
kept for reference; the PWA replaced it as the primary logger.

## Development

```sh
npm run dev          # dev server (set AUTH_TOKEN=dev)
npm test             # Vitest suite — must be green before any commit
npm run check        # svelte-check / typecheck
npm run db:generate  # generate a Drizzle migration after schema changes
npm run seed         # seed dev DB with 12 watches + wear history (refuses non-empty DB)
```
