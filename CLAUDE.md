# horolog

Single-user, self-hosted watch-collection tracker: inventory + wear-session logging (installable PWA) + stats dashboard. Runs as one SvelteKit container on a homelab behind cloudflared.

- **Design spec:** `docs/superpowers/specs/2026-07-14-horolog-design.md` — the source of truth for scope and behavior.
- **Implementation plan:** `docs/superpowers/plans/2026-07-14-horolog.md` — task-by-task with complete code; includes the unattended-run Execution Directive. If you're implementing, work from your assigned task's interface contract.

## Commands

- `npm run dev` — dev server (set `DASH_PASSWORD=dev`)
- `npm test` — Vitest suite (must be green before any commit)
- `npm run check` — svelte-check / typecheck
- `npm run db:generate` — generate Drizzle migration after schema changes
- `npm run seed` — seed dev DB (12 watches + wear history; refuses non-empty DB)
- `docker compose up --build` — production-shaped run on :3000

## Invariants (never violate; enforced in `src/lib/server/sessions.ts`)

- Zero or one watch on-wrist: at most one `wear_sessions` row with `ended_at IS NULL`.
- Sessions never overlap; `ended_at > started_at`. Touching boundaries are legal (swap produces them).
- Every mutation path — actions, backfill, edits — revalidates these. Never write session rows around the domain layer.
- The API never auto-closes sessions; stale open sessions only produce a dashboard nudge.

## Conventions

- Domain functions live in `src/lib/server/` and take the DB handle as their first argument (tests use `createDb(':memory:')`).
- State-machine violations throw `StateError` → 409 with a human-readable `message`, shown verbatim as a dashboard toast — write it for a phone-sized screen.
- Timestamps stored UTC (Drizzle `timestamp_ms`); all DOW/TOD/calendar bucketing uses `config.homeTz` via `src/lib/server/time.ts`. Money is integer cents.
- Auth is a single-password session cookie (`DASH_PASSWORD` env; `src/lib/server/auth.ts`, gated in `hooks.server.ts`). There is no REST API — the retired shortcut-facing `/api/*` surface is recoverable from git history if ever needed. Dashboard mutations are SvelteKit form actions calling the domain functions — don't add parallel REST endpoints.
- Watch display name: `watchLabel()` (nickname, else brand + model). Don't reimplement.
- TDD for domain/stats/auth; UI is lightly tested and verified in the browser. Apply the frontend-design skill for UI work and the dataviz skill for charts.
