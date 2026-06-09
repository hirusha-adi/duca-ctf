#!/usr/bin/env bash
set -euo pipefail

RETENTION_DAYS="${ACTIVITY_LOG_RETENTION_DAYS:-14}"

if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || [ "$RETENTION_DAYS" -lt 1 ]; then
  echo "Invalid ACTIVITY_LOG_RETENTION_DAYS: $RETENTION_DAYS"
  exit 1
fi

echo "Purging activity logs older than ${RETENTION_DAYS} day(s)..."

psql -h "$PGHOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c \
  "DELETE FROM \"ActivityLog\" WHERE \"createdAt\" < NOW() - INTERVAL '${RETENTION_DAYS} days';"
