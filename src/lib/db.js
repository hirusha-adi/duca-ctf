import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis;

function createPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function modelDelegateKey(modelName) {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

function isStalePrismaClient(client) {
  if (!client) return true;

  return Object.values(Prisma.ModelName).some((modelName) => {
    const delegate = client[modelDelegateKey(modelName)];
    return typeof delegate?.findMany !== "function";
  });
}

if (isStalePrismaClient(globalForPrisma.prisma)) {
  if (globalForPrisma.prisma) {
    void globalForPrisma.prisma.$disconnect();
  }
  globalForPrisma.prisma = createPrismaClient();
}

export const prisma = globalForPrisma.prisma;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
