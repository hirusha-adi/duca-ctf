#!/bin/sh
set -e

apk add --no-cache postgresql16-client dcron bash >/dev/null

chmod +x /usr/local/bin/backup-db.sh /usr/local/bin/purge-activity-logs.sh

# Daily at 03:00 container local time
cat > /etc/crontabs/root <<EOF
0 3 * * * /bin/bash /usr/local/bin/backup-db.sh >> /var/log/backup-cron.log 2>&1
15 3 * * * /bin/bash /usr/local/bin/purge-activity-logs.sh >> /var/log/purge-activity-cron.log 2>&1
EOF

echo "Database backup scheduler started (daily at 03:00, keeping ${BACKUP_KEEP_COUNT:-3} copies)."
echo "Activity log purge scheduler started (daily at 03:15, retention ${ACTIVITY_LOG_RETENTION_DAYS:-14} days)."
exec crond -f -l 2
