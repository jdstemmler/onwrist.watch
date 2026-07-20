# onwrist

Multi-tenant, self-hosted watch-collection tracker: inventory + wear-session
logging (installable PWA) + stats dashboard, with self-serve accounts. Runs
as a SvelteKit app + Postgres via docker compose, optionally behind a
reverse proxy or Cloudflare tunnel.

## Commands

- `docker compose -f docker-compose.scratch.yml -p onwrist-scratch up -d` then
  `env $(cat .env.scratch | xargs) npm run dev` — dev server on :5199 against
  the disposable scratch Postgres. All dev and runtime verification happens
  on this stack, never the default compose project.
- `npm test` — Vitest suite against PGlite (must be green before any commit)
- `npm run check` — svelte-check / typecheck
- `npm run db:generate` — generate Drizzle migration after schema changes (run after editing `src/lib/server/db/schema.ts`)
- `npm run seed` — seed the scratch Postgres (one verified user + 12 watches + wear history; refuses non-empty DB). Account emails (verify/reset/change) are logged to the console, not sent, whenever `RESEND_API_KEY` is unset — the default for the scratch stack.

## Branching workflow

Trunk-based. `main` is the trunk and the default branch; `production` is
a pointer at the deployed commit.

- **All changes** — features, chores, docs, dependency bumps — branch off
  `main`, PR into `main`, and let CI (typecheck + tests) pass. Merging to
  `main` does **not** deploy, so `main` can accumulate as many unreleased
  features as a release needs. Squash or merge commit, either is fine.
- **Releases** are the `Release` workflow (Actions → Release →
  Run workflow), which fast-forwards `production` to `main` and
  optionally tags. Compare `main...production` first to read exactly
  what is about to ship. Railway watches `production`, so that
  fast-forward is the deploy.
- Never push to `main` or `production` directly; `main` lands via PR and
  `production` moves only through the release workflow. Because
  `production` only ever fast-forwards to a commit already on `main`, it
  cannot diverge — if the release job ever reports otherwise, something
  was pushed to it by hand.
- Releases are tagged `vX.Y.Z` at the released `main` commit. Self-hosters
  track tags rather than `main` (see `docs/deploy.md`), since `main`
  holds unreleased work by design.

## Invariants (never violate; enforced in `src/lib/server/sessions.ts`)

- Zero or one watch on-wrist **per user**: at most one `wear_sessions` row with `ended_at IS NULL` among that user's watches. Mutations serialize behind a `SELECT … FOR UPDATE` lock on the user's `users` row (`lockUser()`), backstopped by a partial unique index (`one_open_session_per_watch … WHERE ended_at IS NULL`) at the DB level.
- Sessions never overlap; `ended_at > started_at`. Touching boundaries are legal (swap produces them).
- Every mutation path — actions, backfill, edits — revalidates these. Never write session rows around the domain layer.
- The API never auto-closes sessions; stale open sessions only produce a dashboard nudge.

## Conventions

- Domain functions live in `src/lib/server/` and are async, taking the DB handle first and a `userId` second — every read and mutation is tenant-scoped (`sessions.ts`, `watches.ts`, `photos.ts`, `stats.ts`, `state.ts` all take `(db, userId, …)`; ownership is asserted, never assumed, e.g. `assertWatchOwned`). Tests use `await createTestDb()` from the PGlite harness in `src/lib/server/db/test-utils.ts`, not `createDb(':memory:')`.
- Photo files are only ever touched via the `PhotoStorage` interface (`src/lib/server/storage/`, `put`/`get`/`delete`/`sizeOfPrefix`) — never read/write the photos directory directly outside that module. Keys are per-user prefixed (`${userId}/${watchId}/...`).
- Quotas live in the domain functions, not the UI: 20 watches/user, 12 photos/watch, 1 GiB photo storage/user — each multipliable per-user via `users.quotaMultiplier`. Over-quota throws `StateError`.
- State-machine violations throw `StateError` → 409 with a human-readable `message`, shown verbatim as a dashboard toast — write it for a phone-sized screen.
- Timestamps stored UTC (Drizzle `timestamp(..., { withTimezone: true, mode: 'date' })`); all DOW/TOD/calendar bucketing uses the signed-in user's `homeTz` preference (`locals.user.homeTz`, edited on `/settings`) via `src/lib/server/time.ts` — not a global config value. Money is integer cents.
- Auth is roll-your-own, per-user accounts, not a shared password: argon2id password hashing, SHA-256-hashed email/session tokens, a Postgres-backed fixed-window rate limiter, and Turnstile on signup (`src/lib/server/auth.ts`, `passwords.ts`, `flows.ts`, `rate-limit.ts`, `turnstile.ts`; session populated onto `event.locals.user` in `hooks.server.ts`). Unverified users can log in but mutating actions are gated by `requireVerified()`. There is no REST API — the retired shortcut-facing `/api/*` surface is recoverable from git history if ever needed. Dashboard mutations are SvelteKit form actions calling the domain functions — don't add parallel REST endpoints.
- Watch display name: `watchLabel()` in `src/lib/watch-label.ts` (nickname, else brand + model) — shared by server code and components. Don’t reimplement.
- Admin (`/admin`) is an ops-only console, not a tenant feature: role-gated with a 404 (never 403) for non-admins so the surface's existence isn't disclosed to a signed-in member poking at the URL (`gate()` in `src/routes/admin/+page.server.ts`). Cross-tenant admin operations (list all users, disable/enable, delete, resend verification, quota) live in `src/lib/server/admin.ts`, never inline in route code. The admin account is seeded at boot from `ADMIN_EMAIL` (`ensureAdmin()`, called from `getDb()`) with an unusable random password hash — no separate invite flow; the operator sets a real password via the ordinary forgot-password/reset flow.
- TDD for domain/stats/auth; UI is lightly tested and verified in the browser. Apply the frontend-design skill for UI work and the dataviz skill for charts.

## Public-repo hygiene

This repo is public — files, commit messages, PR descriptions, and issues
are all part of the public record. Write every one of them for an outside
reader.

- Never commit: `.env` files or any real credential, token, or connection
  string; operator-specific values (storage bucket names, account emails,
  hostnames beyond onwrist.watch, IPs, tunnel/service IDs); absolute local
  paths (`/home/...`, `/Users/...`); database dumps, logs, or pasted
  terminal output that could contain any of the above.
- Planning documents, specs, run reports, agent kickoff/handoff notes, and
  AI-session links don't belong here — not as files, not quoted in commit
  messages or PR text. Operator-local context lives in `CLAUDE.local.md`
  (gitignored by design).
- Commit messages: no session URLs, no agent/worktree branch names, no
  redaction narration ("removed X's email" tells readers what existed).
- Docs stay instance-neutral: describe what the software does, not how any
  particular instance is operated. Examples use placeholders
  (`you@example.com`, `/path/to/backups`, `192.168.1.50`).
- When unsure, leave it out and note it in `CLAUDE.local.md` instead —
  adding text to the repo later is trivial; removing it from public
  history is not.
