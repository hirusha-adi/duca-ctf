export const ACTIVITY_LOG_RETENTION_DAYS = Number(
  process.env.ACTIVITY_LOG_RETENTION_DAYS || 14
);

export function getActivityLogCutoffDate(
  retentionDays = ACTIVITY_LOG_RETENTION_DAYS
) {
  const days = Number(retentionDays);
  if (!Number.isFinite(days) || days < 1) {
    throw new Error(`Invalid activity log retention days: ${retentionDays}`);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

export async function purgeExpiredActivityLogs(
  prisma,
  retentionDays = ACTIVITY_LOG_RETENTION_DAYS
) {
  const cutoff = getActivityLogCutoffDate(retentionDays);
  const result = await prisma.activityLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  return { deleted: result.count, cutoff };
}
