# Contributing

Thanks for your interest in onwrist!

## Workflow

- Branch off **`main`** and open your PR into **`main`** — that goes for
  features, fixes, and docs alike. CI (typecheck + tests, `npm run check`
  / `npm test`) must pass before merge.
- `main` is the trunk and holds work that has not shipped yet. Merging
  there does not deploy anything.
- Releases are cut by the maintainer, who fast-forwards the `production`
  branch to `main` and tags it `vX.Y.Z`. If you are running your own
  instance, track the tags rather than `main`.

## Development

See the Development section of the README: the scratch Postgres stack
(`docker-compose.scratch.yml`) plus `npm run dev` is the supported dev
loop, and `npm test` runs the full Vitest suite against PGlite with no
services needed.

Please keep the invariants documented in `CLAUDE.md` intact — in
particular the one-open-session-per-user rule and the tenant-scoping
convention (`(db, userId, …)`) in `src/lib/server/`.
