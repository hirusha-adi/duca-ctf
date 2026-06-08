import bcrypt from "bcryptjs";
import { prisma } from "./db";

export async function hashFlag(flag) {
  const normalized = normalizeFlag(flag);
  return bcrypt.hash(normalized, 10);
}

export async function verifyFlag(flag, hash) {
  const normalized = normalizeFlag(flag);
  return bcrypt.compare(normalized, hash);
}

export function normalizeFlag(flag) {
  return flag.trim();
}

export async function syncChallengeFlags(challengeId, flags) {
  if (!Array.isArray(flags)) return;

  const existing = await prisma.flag.findMany({
    where: { challengeId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((f) => f.id));
  const submittedIds = new Set(flags.filter((f) => f.id).map((f) => f.id));

  const toDelete = [...existingIds].filter((id) => !submittedIds.has(id));
  if (toDelete.length > 0) {
    await prisma.flag.deleteMany({ where: { id: { in: toDelete } } });
  }

  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    const label = flag.label || "";

    if (flag.id && existingIds.has(flag.id)) {
      const normalized = flag.value?.trim();
      if (!normalized) {
        throw new Error("FLAG_VALUE_REQUIRED");
      }
      await prisma.flag.update({
        where: { id: flag.id },
        data: {
          label,
          order: i,
          value: normalized,
          flagHash: await hashFlag(normalized),
        },
      });
      continue;
    }

    if (!flag.id && flag.value?.trim()) {
      const normalized = flag.value.trim();
      await prisma.flag.create({
        data: {
          challengeId,
          value: normalized,
          flagHash: await hashFlag(normalized),
          label,
          order: i,
        },
      });
    }
  }

  const count = await prisma.flag.count({ where: { challengeId } });
  if (count === 0) {
    throw new Error("AT_LEAST_ONE_FLAG");
  }
}

export function flagSyncErrorMessage(code) {
  const messages = {
    AT_LEAST_ONE_FLAG: "At least one flag is required",
    FLAG_VALUE_REQUIRED: "Every flag must have a value",
  };
  return messages[code] || "Failed to update flags";
}
