#!/usr/bin/env bash

db_backup_root_dir() {
  cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd
}

db_backup_defaults() {
  local root
  root="$(db_backup_root_dir)"
  BACKUP_DIR="${BACKUP_DIR:-$root/backups}"
  BACKUP_KEEP_COUNT="${BACKUP_KEEP_COUNT:-3}"
  COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
  POSTGRES_SERVICE="${POSTGRES_SERVICE:-hirusha-duca-ctf-postgres}"
  POSTGRES_DB="${POSTGRES_DB:-duca_ctf}"
  POSTGRES_USER="${POSTGRES_USER:-duca}"
}

db_backup_rotate() {
  local dir="$1"
  local keep="$2"
  local pattern="$3"
  local to_delete

  to_delete="$(ls -t "$dir"/$pattern 2>/dev/null | tail -n +"$((keep + 1))" || true)"
  if [ -n "$to_delete" ]; then
    echo "$to_delete" | while IFS= read -r file; do
      [ -n "$file" ] && rm -f "$file"
    done
  fi
}

db_backup_latest_file() {
  local dir="$1"
  local pattern="$2"
  ls -t "$dir"/$pattern 2>/dev/null | head -n 1
}
