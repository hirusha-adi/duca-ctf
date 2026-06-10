const { createPrismaClient } = require("../prisma/create-client");

module.exports = async function registerNodeInstrumentation() {
  const { purgeExpiredActivityLogs } = await import("./lib/activity-retention.js");
  const prisma = createPrismaClient();

  try {
    const { deleted } = await purgeExpiredActivityLogs(prisma);
    if (deleted > 0) {
      console.log(`Purged ${deleted} expired activity log(s).`);
    }
  } catch (error) {
    console.error("Failed to purge expired activity logs:", error);
  } finally {
    await prisma.$disconnect();
  }
};
