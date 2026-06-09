import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config.js");
    await purgeExpiredActivityLogs();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config.js");
  }
}

async function purgeExpiredActivityLogs() {
  const { prisma } = await import("./lib/db.js");
  const { purgeExpiredActivityLogs } = await import("./lib/activity-retention.js");

  try {
    const { deleted } = await purgeExpiredActivityLogs(prisma);
    if (deleted > 0) {
      console.log(`Purged ${deleted} expired activity log(s).`);
    }
  } catch (error) {
    console.error("Failed to purge expired activity logs:", error);
  }
}

export const onRequestError = Sentry.captureRequestError;
