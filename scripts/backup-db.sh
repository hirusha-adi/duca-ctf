#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/lib/db-backup-common.sh" ]; then
  # shellcheck source=lib/db-backup-common.sh
  source "$SCRIPT_DIR/lib/db-backup-common.sh"
elif [ -f /usr/local/lib/duca-ctf/db-backup-common.sh ]; then
  # shellcheck source=/usr/local/lib/duca-ctf/db-backup-common.sh
  source /usr/local/lib/duca-ctf/db-backup-common.sh
else
  echo "Missing db-backup-common.sh"
  exit 1
fi

db_backup_defaults

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/${POSTGRES_DB}_${TIMESTAMP}.sql.gz"

if [ -n "${PGHOST:-}" ]; then
  echo "Creating backup via direct Postgres connection ($PGHOST)..."
  pg_dump \
    -h "$PGHOST" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    | gzip > "$BACKUP_FILE"
else
  ROOT_DIR="$(db_backup_root_dir)"
  echo "Creating backup via Docker Compose ($POSTGRES_SERVICE)..."
  cd "$ROOT_DIR"
  sudo docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
    pg_dump \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DB" \
      --clean \
      --if-exists \
      --no-owner \
      --no-privileges \
    | gzip > "$BACKUP_FILE"
fi

db_backup_rotate "$BACKUP_DIR" "$BACKUP_KEEP_COUNT" "${POSTGRES_DB}_*.sql.gz"

echo "Backup created: $BACKUP_FILE"
echo "Retaining the newest $BACKUP_KEEP_COUNT backup(s):"
ls -lh "$BACKUP_DIR"/${POSTGRES_DB}_*.sql.gz 2>/dev/null || echo "(none)"
