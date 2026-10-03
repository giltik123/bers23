#!/usr/bin/env bash
set -euo pipefail

: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is required}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${ADMIN_DATABASE_URL:?ADMIN_DATABASE_URL is required}"

RESTORE_DATABASE_NAME="${RESTORE_DATABASE_NAME:-core_migration_restore_test}"
CANDIDATE_SHA="${CANDIDATE_SHA:-unknown-candidate}"
OUT_DIR="${1:-artifacts/postgres-backup-restore}"

if ! [[ "$RESTORE_DATABASE_NAME" =~ ^[a-z][a-z0-9_]{0,62}$ ]]; then
  echo "RESTORE_DATABASE_NAME must be a safe PostgreSQL identifier" >&2
  exit 1
fi
if ! [[ "$CANDIDATE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "CANDIDATE_SHA must be an exact lowercase 40-character SHA" >&2
  exit 1
fi

for command in psql pg_dump pg_restore; do
  command -v "$command" >/dev/null || {
    echo "$command is required for the production backup/restore drill" >&2
    exit 1
  }
done

mkdir -p "$OUT_DIR"
DUMP_PATH="$OUT_DIR/bers-v1-${CANDIDATE_SHA}.dump"
PROBE_ID="bers-v1-backup-restore"
PROBE_PAYLOAD="candidate:${CANDIDATE_SHA}"

# Source must already be on the complete release schema. The probe is CI-only
# durable data used to prove the logical backup preserved rows, not just DDL.
DATABASE_URL="$SOURCE_DATABASE_URL" node dist-server/migrate.mjs check
psql "$SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1   -v probe_id="$PROBE_ID"   -v probe_payload="$PROBE_PAYLOAD" <<'SQL'
CREATE TABLE IF NOT EXISTS release_backup_restore_probe (
  probe_id text PRIMARY KEY,
  payload text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
DELETE FROM release_backup_restore_probe WHERE probe_id = :'probe_id';
INSERT INTO release_backup_restore_probe(probe_id,payload)
VALUES (:'probe_id', :'probe_payload');
SQL

pg_dump   --format=custom   --no-owner   --no-privileges   --file="$DUMP_PATH"   "$SOURCE_DATABASE_URL"

test -s "$DUMP_PATH"

# Restore into an independent database. Never restore over the source database
# and never infer a destructive downgrade from this drill.
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -v restore_db="$RESTORE_DATABASE_NAME" <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = :'restore_db'
  AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS :"restore_db";
CREATE DATABASE :"restore_db";
SQL

pg_restore   --exit-on-error   --no-owner   --no-privileges   --dbname="$RESTORE_DATABASE_URL"   "$DUMP_PATH"

restored_payload="$(psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -At -c "SELECT payload FROM release_backup_restore_probe WHERE probe_id = 'bers-v1-backup-restore'")"
test "$restored_payload" = "$PROBE_PAYLOAD"

# A restored release database must satisfy the exact bundled schema contract,
# remain migration-idempotent and still satisfy it after the no-op migrate.
DATABASE_URL="$RESTORE_DATABASE_URL" node dist-server/migrate.mjs check
DATABASE_URL="$RESTORE_DATABASE_URL" node dist-server/migrate.mjs migrate
DATABASE_URL="$RESTORE_DATABASE_URL" node dist-server/migrate.mjs check

cat >"$OUT_DIR/evidence.json" <<JSON
{
  "schemaVersion": 1,
  "kind": "BERS_V1_POSTGRES_BACKUP_RESTORE_DRILL",
  "candidateSha": "$CANDIDATE_SHA",
  "backupFormat": "pg_dump_custom",
  "restoreDatabase": "$RESTORE_DATABASE_NAME",
  "probeId": "$PROBE_ID",
  "probePayload": "$PROBE_PAYLOAD",
  "schemaCheckAfterRestore": true,
  "idempotentMigrateAfterRestore": true,
  "databaseDowngradeAttempted": false
}
JSON

cat "$OUT_DIR/evidence.json"
