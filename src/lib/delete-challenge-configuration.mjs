function deletionError(message, status = 409) {
  return Object.assign(new Error(message), { status });
}

export async function deleteChallengeConfiguration(db, challengeId) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${challengeId}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('challenge-prerequisites'))`;
    const dependent = await tx.challengePrerequisite.findFirst({
      where: { requiredChallengeId: challengeId },
      select: { challengeId: true },
    });
    if (dependent) {
      throw deletionError("Remove this challenge from dependent challenges' prerequisites before deleting it");
    }
    return tx.challenge.delete({ where: { id: challengeId } });
  }, { timeout: 15000 });
}

export async function deleteCompetitionConfiguration(db, competitionId) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('challenge-prerequisites'))`;
    const competition = await tx.competition.findUnique({ where: { id: competitionId }, select: { id: true } });
    if (!competition) throw deletionError("Competition not found", 404);
    const outsideDependent = await tx.challengePrerequisite.findFirst({
      where: {
        requiredChallenge: { competitionId },
        challenge: { competitionId: { not: competitionId } },
      },
      select: { challengeId: true },
    });
    if (outsideDependent) {
      throw deletionError("Remove prerequisite references from other competitions before deleting this competition");
    }
    // Clear only this event's outgoing graph edges. Cross-event dependents are
    // never silently unlocked, and the restrictive FK can stay in place.
    await tx.challengePrerequisite.deleteMany({ where: { challenge: { competitionId } } });
    return tx.competition.delete({ where: { id: competitionId } });
  }, { timeout: 15000 });
}
