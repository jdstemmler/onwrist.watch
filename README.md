# horolog

A single-user, self-hosted watch-collection tracker: inventory management,
low-friction wear-session logging (driven by an iOS Shortcut, with a PWA
dashboard as fallback), and a stats dashboard (day-of-week, time-of-day,
total wear, cost-per-wear, calendar views). Runs as one SvelteKit container
on a homelab, reachable from anywhere via cloudflared.

![dashboard screenshot placeholder](docs/screenshot.png)
<!-- TODO: replace with a real screenshot after first deploy -->

## Quickstart

```sh
cp .env.example .env
# edit .env and set AUTH_TOKEN to a real secret (used by the iOS Shortcut
# and any other /api/* client — see docs/shortcut.md)
docker compose up -d
```

The app serves both the JSON API (`/api/*`) and the dashboard from one
process on port 3000.

## Exposing it (cloudflared)

Point your existing cloudflared tunnel at `localhost:3000`. This is a
**later** step, not required to use the app — on your home LAN, the
`AUTH_TOKEN` bearer token alone is enough to protect `/api/*`, and the
dashboard has no auth of its own until you add Cloudflare Access.

Once you do add the tunnel, protect every dashboard route (i.e. every path
that isn't `/api/*`) with Cloudflare Access — `/api/*` stays open to bearer
token only, since that's what the iOS Shortcut speaks and Access can't
easily front a Shortcuts HTTP request.

## Logging wear from your phone

See [`docs/shortcut.md`](docs/shortcut.md) for the full step-by-step guide
to building the iOS Shortcut that talks to `/api/*` (put on, swap, take
off, backfill).

## Development

```sh
npm run dev          # dev server (set AUTH_TOKEN=dev)
npm test             # Vitest suite — must be green before any commit
npm run check        # svelte-check / typecheck
npm run db:generate  # generate a Drizzle migration after schema changes
npm run seed         # seed dev DB with 12 watches + wear history (refuses non-empty DB)
```
