const { createPrismaClient } = require("../prisma/create-client");

async function main() {
  const prisma = createPrismaClient();
  const { purgeExpiredActivityLogs } = await import(
    "../src/lib/activity-retention.js"
  );

  try {
    const { deleted, cutoff } = await purgeExpiredActivityLogs(prisma);

    if (deleted > 0) {
      console.log(
        `Purged ${deleted} activity log(s) older than ${cutoff.toISOString()}.`
      );
    } else {
      console.log("No expired activity logs to purge.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
