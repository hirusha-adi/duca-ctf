import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { prepareFlagChanges } from "./flag-changes.mjs";

export { prepareFlagChanges } from "./flag-changes.mjs";

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

export async function syncChallengeFlags(challengeId, flags, client = prisma) {
  if (client === prisma) {
    return prisma.$transaction((tx) => syncChallengeFlags(challengeId, flags, tx));
  }

  const existing = await client.flag.findMany({
    where: { challengeId },
    select: { id: true, retired: true },
  });
  const changes = prepareFlagChanges(flags, existing);
  // Hash everything before the first write, including flags late in the list.
  const prepared = await Promise.all(
    changes.flags.map(async (flag) => ({ ...flag, flagHash: await hashFlag(flag.value) }))
  );

  for (const { id, ...data } of prepared) {
    if (id) {
      await client.flag.update({
        where: { id },
        data,
      });
    } else {
      await client.flag.create({
        data: { challengeId, ...data },
      });
    }
  }

  if (changes.retiredIds.length > 0) {
    // Historical solves keep their original flag and awarded points.
    await client.flag.updateMany({
      where: { challengeId, id: { in: changes.retiredIds } },
      data: { retired: true },
    });
  }
}

export function flagSyncErrorMessage(code) {
  const messages = {
    AT_LEAST_ONE_FLAG: "At least one flag is required",
    FLAG_VALUE_REQUIRED: "Every flag must have a value",
    INVALID_FLAGS: "Flags must be a list of valid flag entries",
    TOO_MANY_FLAGS: "A challenge can have at most 20 flags",
    FLAG_VALUE_TOO_LONG: "Flag values must be at most 4,096 characters",
    INVALID_FLAG_ID: "A flag no longer exists or does not belong to this challenge",
    DUPLICATE_FLAG: "The same flag cannot be included more than once",
    DUPLICATE_FLAG_VALUE: "Each flag must have a different value",
    INVALID_FLAG_LABEL: "Flag labels must be text of at most 200 characters",
  };
  return messages[code] || "Failed to update flags";
}
