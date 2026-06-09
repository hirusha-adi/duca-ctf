#!/bin/sh
set -e

mkdir -p /app/data/uploads
chown -R nextjs:nodejs /app/data

echo "Running database migrations..."
su-exec nextjs env NODE_PATH=/app/prisma-cli/node_modules \
  node /app/prisma-cli/node_modules/prisma/build/index.js migrate deploy

echo "Purging activity logs older than ${ACTIVITY_LOG_RETENTION_DAYS:-14} days..."
su-exec nextjs node /app/scripts/purge-activity-logs.js

echo "Starting application..."
exec su-exec nextjs "$@"
