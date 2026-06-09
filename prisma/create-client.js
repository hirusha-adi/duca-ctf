const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

// In Docker/production, DATABASE_URL is injected by Compose — dotenv is not bundled.
if (!process.env.DATABASE_URL) {
  const { config } = require("dotenv");
  config({ path: ".env.local" });
  config();
}

function createPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

module.exports = { createPrismaClient };
