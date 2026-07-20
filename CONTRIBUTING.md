# Contributing

Thanks for your interest in onwrist!

## Workflow

- Branch off `main`, open your PR into **`develop`**. CI (typecheck +
  tests, `npm run check` / `npm test`) must pass before merge.
- Releases are `develop` → `main` merge commits, cut by the maintainer;
  `main` always reflects the released state.
- Small docs-only fixes may PR directly into `main` at the maintainer's
  discretion.

## Development

See the Development section of the README: the scratch Postgres stack
(`docker-compose.scratch.yml`) plus `npm run dev` is the supported dev
loop, and `npm test` runs the full Vitest suite against PGlite with no
services needed.

Please keep the invariants documented in `CLAUDE.md` intact — in
particular the one-open-session-per-user rule and the tenant-scoping
convention (`(db, userId, …)`) in `src/lib/server/`.
