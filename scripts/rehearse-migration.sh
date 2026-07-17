#!/usr/bin/env bash
# Dress rehearsal for the legacy migration: touches nothing real. Copies the
# legacy SQLite DB + photos into a disposable sandbox, resets the scratch
# Postgres stack, and runs the migration CLI against the copy only.
#
# ⚠️ Scratch only — never :3000, never the default `docker compose` project,
# never a write to the real data directory. REAL_DATA_DIR is only ever read
# from (via `cp`).
set -euo pipefail

REAL_DATA_DIR="${REAL_DATA_DIR:-./data}"

SANDBOX="$(mktemp -d)"; echo "sandbox: $SANDBOX"
cp "$REAL_DATA_DIR/watches.db" "$SANDBOX/watches.db"          # read-only copy of the real data
cp -r "$REAL_DATA_DIR/photos" "$SANDBOX/legacy-photos"
docker compose -f docker-compose.scratch.yml -p onwrist-scratch down
docker compose -f docker-compose.scratch.yml -p onwrist-scratch up -d
sleep 4
LEGACY_DB="$SANDBOX/watches.db" LEGACY_PHOTOS="$SANDBOX/legacy-photos" \
  DATA_DIR="$SANDBOX/store" OWNER_EMAIL="owner@onwrist.local" \
  DATABASE_URL="postgres://onwrist:scratch@localhost:55432/onwrist" \
  npx tsx scripts/migrate-legacy.ts
echo "rehearsal migration done — verify in the app on :5199 if desired"
echo "sandbox: $SANDBOX"
