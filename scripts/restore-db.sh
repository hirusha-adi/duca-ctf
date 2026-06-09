#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/db-backup-common.sh
source "$SCRIPT_DIR/lib/db-backup-common.sh"

db_backup_defaults

CONFIRM=no
BACKUP_FILE=""
STOP_WEB=true

usage() {
  cat <<EOF
Usage: $(basename "$0") [options] [backup-file.sql.gz]

Restore the PostgreSQL database from a gzip-compressed SQL dump.

If no backup file is given, the newest file in $BACKUP_DIR is used.

Options:
  -y, --yes       Skip confirmation prompt
  --no-stop-web   Do not stop/start hirusha-duca-ctf-web around the restore
  -h, --help      Show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    -y|--yes)
      CONFIRM=yes
      shift
      ;;
    --no-stop-web)
      STOP_WEB=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      BACKUP_FILE="$1"
      shift
      ;;
  esac
done

if [ -z "$BACKUP_FILE" ]; then
  BACKUP_FILE="$(db_backup_latest_file "$BACKUP_DIR" "${POSTGRES_DB}_*.sql.gz")"
fi

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "No backup file found."
  echo "Expected pattern: $BACKUP_DIR/${POSTGRES_DB}_*.sql.gz"
  exit 1
fi

BACKUP_FILE="$(cd "$(dirname "$BACKUP_FILE")" && pwd)/$(basename "$BACKUP_FILE")"

if [ "$CONFIRM" != "yes" ]; then
  echo "This will REPLACE the current database with:"
  echo "  $BACKUP_FILE"
  read -r -p "Type 'restore' to continue: " answer
  if [ "$answer" != "restore" ]; then
    echo "Aborted."
    exit 1
  fi
fi

ROOT_DIR="$(db_backup_root_dir)"
cd "$ROOT_DIR"

if [ "$STOP_WEB" = true ]; then
  echo "Stopping web container..."
  sudo docker compose -f "$COMPOSE_FILE" stop hirusha-duca-ctf-web >/dev/null || true
fi

echo "Restoring database from $BACKUP_FILE ..."
gunzip -c "$BACKUP_FILE" | sudo docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"

if [ "$STOP_WEB" = true ]; then
  echo "Starting web container..."
  sudo docker compose -f "$COMPOSE_FILE" start hirusha-duca-ctf-web >/dev/null || true
fi

echo "Restore complete."
