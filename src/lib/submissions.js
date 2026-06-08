import { prisma } from "./db";
import { TELEMETRY_ACTIONS } from "./constants";

const SUBMIT_ACTIONS = [
  TELEMETRY_ACTIONS.FLAG_SUBMIT_CORRECT,
  TELEMETRY_ACTIONS.FLAG_SUBMIT_INCORRECT,
];

export async function getUserChallengeSubmissionCount(userId, challengeId) {
  return prisma.activityLog.count({
    where: {
      userId,
      action: { in: SUBMIT_ACTIONS },
      metadata: { path: ["challengeId"], equals: challengeId },
    },
  });
}

export async function getUserChallengeSubmissionStats(userId, challengeId) {
  const [total, failed] = await Promise.all([
    getUserChallengeSubmissionCount(userId, challengeId),
    prisma.activityLog.count({
      where: {
        userId,
        action: TELEMETRY_ACTIONS.FLAG_SUBMIT_INCORRECT,
        metadata: { path: ["challengeId"], equals: challengeId },
      },
    }),
  ]);

  return { total, failed, correct: total - failed };
}

export function parseSubmitLimit(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}
