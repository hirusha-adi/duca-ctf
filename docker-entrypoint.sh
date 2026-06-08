#!/bin/sh
set -e

mkdir -p /app/data/uploads
chown -R nextjs:nodejs /app/data

echo "Running database migrations..."
su-exec nextjs node ./node_modules/prisma/build/index.js migrate deploy

echo "Starting application..."
exec su-exec nextjs "$@"
