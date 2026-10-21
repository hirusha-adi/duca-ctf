import { challengeConfigurationError } from "./challenge-rules.mjs";

// Dependencies are injected so the transaction's balance and authorization rules can be tested without a server.
export async function purchaseHintWithClient(db, { userId, challengeId, hintId, expectedCost }, { isChallengeAvailable, getChallengePrerequisiteStatus }) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${challengeId}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`user:${userId}`}))`;
    const hint = await tx.hint.findFirst({ where: { id: hintId, challengeId }, include: { challenge: { include: { competition: true } } } });
    if (!hint || hint.challenge.hidden || hint.challenge.competition.hidden) {
      throw challengeConfigurationError("Hint not found.", 404);
    }
    const prerequisiteStatus = await getChallengePrerequisiteStatus(userId, challengeId, tx);
    if (!prerequisiteStatus.unlocked || !isChallengeAvailable(hint.challenge, hint.challenge.competition)) {
      throw challengeConfigurationError("This challenge is locked. Hints are available while the challenge is open.", 403);
    }
    const existing = await tx.hintUnlock.findUnique({ where: { userId_hintId: { userId, hintId } } });
    if (hint.retired && !existing) throw challengeConfigurationError("Hint not found.", 404);
    if (existing) return { hint, unlock: existing, charged: false };
    if (expectedCost !== undefined && hint.cost !== expectedCost) {
      throw Object.assign(challengeConfigurationError("The hint price has changed. Review the updated price before unlocking it.", 409), { code: "HINT_PRICE_CHANGED" });
    }

    const competitionId = hint.challenge.competitionId;
    const [earned, spent] = await Promise.all([
      tx.solve.aggregate({ where: { userId, challenge: { competitionId } }, _sum: { pointsAwarded: true } }),
      tx.hintUnlock.aggregate({ where: { userId, hint: { challenge: { competitionId } } }, _sum: { costPaid: true } }),
    ]);
    const balance = (earned._sum.pointsAwarded ?? 0) - (spent._sum.costPaid ?? 0);
    if (hint.cost > 0 && balance < hint.cost) {
      throw challengeConfigurationError(`You need ${hint.cost} points in this competition to unlock this hint. Your balance is ${balance}.`, 409);
    }
    const unlock = await tx.hintUnlock.create({ data: { userId, hintId, costPaid: hint.cost } });
    return { hint, unlock, charged: hint.cost > 0, balance: balance - hint.cost };
  });
}
