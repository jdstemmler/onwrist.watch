# onwrist

A self-hosted, multi-tenant watch-collection tracker: self-serve accounts,
inventory management, low-friction wear-session logging via an installable
PWA, and a stats dashboard (day-of-week, time-of-day, total wear,
cost-per-wear, calendar views). Runs as a SvelteKit app + Postgres via
docker compose, reachable from anywhere via a Cloudflare tunnel.

![Collection view, light and dark](static/landing/collection-light.webp)

## What you need

- A box that runs Docker (the reference deploy is a homelab server).
- To send real account emails (verify / password reset): a
  [Resend](https://resend.com) API key and a verified sender domain.
  Without one, account emails are logged to the container's stdout —
  fine for trying it out, not for real users.
- To open signups to others: [Cloudflare
  Turnstile](https://developers.cloudflare.com/turnstile/) keys. The
  signup captcha fails closed, so **signup is disabled until these are
  set**.
- Optional but recommended for public exposure: a
  [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
  tunnel. The compose file assumes it (the app port binds to loopback and
  client IPs are read from `CF-Connecting-IP`) — see `.env.example` for
  the two variables to flip for a LAN-only deploy.

## Quickstart

> **Note:** this compose stack *is* production (live since the July 2026
> cutover — see `docs/deploy.md`). For day-to-day dev use the scratch stack
> in the Development section below, never this one.

```sh
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD, ORIGIN (the exact URL you'll load the
# dashboard from), and — to actually receive verify/reset emails —
# RESEND_API_KEY, MAIL_FROM, TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY.
mkdir -p data && sudo chown -R 1000:1000 data   # app runs as uid 1000
docker compose up -d
```

The app serves on port 3000 (loopback-only by default). Every page sits
behind a per-account login (sign up with an email + password, verify by
email); sessions last 30 days (sliding) so your phone stays logged in.

## Logging wear from your phone

Open `/log` in your phone's browser and **Add to Home Screen**. The
installed app opens straight to the wear log: current on-wrist state,
one-tap put-on / swap / take-off, backfill, and inline corrections. That's
the whole workflow — no companion app needed.

## Exposing it (cloudflared)

Point your cloudflared tunnel at `localhost:3000` and set `ORIGIN` in
`.env` to the tunnel hostname. The per-IP rate limits depend on
`ADDRESS_HEADER=CF-Connecting-IP` (the compose default) being truthful,
which it is exactly when the only path to the port is through Cloudflare —
that's why the port binds to loopback.

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

`.env.scratch` is tracked on purpose: it holds only throwaway scratch-stack
credentials and Cloudflare's public always-pass Turnstile test keys.

Tear the scratch stack down with
`docker compose -f docker-compose.scratch.yml -p onwrist-scratch down`. See
`docs/deploy.md` for the production topology, backups, and restore.
