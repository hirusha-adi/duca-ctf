#!/bin/sh
set -e

apk add --no-cache postgresql16-client dcron bash >/dev/null

chmod +x /usr/local/bin/backup-db.sh

# Daily at 03:00 container local time
echo "0 3 * * * /bin/bash /usr/local/bin/backup-db.sh >> /var/log/backup-cron.log 2>&1" > /etc/crontabs/root

echo "Database backup scheduler started (daily at 03:00, keeping ${BACKUP_KEEP_COUNT:-3} copies)."
exec crond -f -l 2
