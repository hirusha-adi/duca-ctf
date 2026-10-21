import { prisma } from "./db";
import { challengeConfigurationError, getPrerequisiteProgress, normalizePrerequisiteIds, wouldCreatePrerequisiteCycle } from "./challenge-rules.mjs";

export async function getChallengePrerequisiteStatus(userId, challengeId, db = prisma) {
  const dependencies = await db.challengePrerequisite.findMany({
    where: { challengeId },
    include: { requiredChallenge: { select: { id: true, title: true, hidden: true } } },
  });
  const requiredIds = dependencies.map((entry) => entry.requiredChallengeId);
  const solves = requiredIds.length ? await db.solve.findMany({
    where: { userId, challengeId: { in: requiredIds } },
    select: { challengeId: true },
  }) : [];
  const solved = new Set(solves.map((entry) => entry.challengeId));
  const requirements = dependencies.map((entry) => ({ ...entry.requiredChallenge, solved: solved.has(entry.requiredChallengeId) }));
  return { unlocked: getPrerequisiteProgress(requiredIds, solved).unlocked, requirements };
}

// Call inside the same transaction as the challenge update and association sync.
export async function validateChallengePrerequisites(tx, { challengeId, competitionId, prerequisiteIds }) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('challenge-prerequisites'))`;
  const existing = challengeId ? await tx.challengePrerequisite.findMany({ where: { challengeId } }) : [];
  const ids = normalizePrerequisiteIds(prerequisiteIds === undefined ? existing.map((entry) => entry.requiredChallengeId) : prerequisiteIds);
  if (challengeId && ids.includes(challengeId)) {
    throw challengeConfigurationError("A challenge cannot require itself.");
  }
  const required = ids.length ? await tx.challenge.findMany({ where: { id: { in: ids } }, select: { id: true, competitionId: true } }) : [];
  if (required.length !== ids.length || required.some((entry) => entry.competitionId !== competitionId)) {
    throw challengeConfigurationError("Prerequisites must be challenges in the same competition.");
  }
  if (challengeId) {
    const dependents = await tx.challengePrerequisite.findMany({
      where: { requiredChallengeId: challengeId },
      include: { challenge: { select: { competitionId: true } } },
    });
    if (dependents.some((entry) => entry.challenge.competitionId !== competitionId)) {
      throw challengeConfigurationError("Remove dependent challenges' prerequisites before moving this challenge to another competition.");
    }
    const edges = await tx.challengePrerequisite.findMany({ select: { challengeId: true, requiredChallengeId: true } });
    if (wouldCreatePrerequisiteCycle(challengeId, ids, edges)) {
      throw challengeConfigurationError("These prerequisites would create a cycle.");
    }
  }
  return ids;
}

export async function syncChallengePrerequisites(tx, challengeId, prerequisiteIds) {
  if (prerequisiteIds === undefined) return;
  await tx.challengePrerequisite.deleteMany({ where: { challengeId } });
  if (prerequisiteIds.length) {
    await tx.challengePrerequisite.createMany({ data: prerequisiteIds.map((requiredChallengeId) => ({ challengeId, requiredChallengeId })) });
  }
}
