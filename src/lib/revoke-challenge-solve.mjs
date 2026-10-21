function notFound(message) {
  return Object.assign(new Error(message), { status: 404 });
}

/** Serialize an explicit admin revoke with submissions and paid hint purchases. */
export async function revokeChallengeSolve(db, userId, challengeId) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${challengeId}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`user:${userId}`}))`;
    const [user, challenge, solves] = await Promise.all([
      tx.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true },
      }),
      tx.challenge.findUnique({
        where: { id: challengeId },
        select: {
          id: true,
          title: true,
          categoryId: true,
          competitionId: true,
          category: { select: { name: true } },
          competition: { select: { name: true } },
        },
      }),
      tx.solve.findMany({
        where: { userId, challengeId },
        select: { id: true, pointsAwarded: true },
      }),
    ]);
    if (!user) throw notFound("User not found");
    if (!challenge) throw notFound("Challenge not found");
    if (solves.length === 0) throw notFound("User has not solved this challenge");

    const pointsRemoved = solves.reduce((sum, solve) => sum + solve.pointsAwarded, 0);
    const result = await tx.solve.deleteMany({ where: { userId, challengeId } });
    return { user, challenge, pointsRemoved, result };
  }, { timeout: 15000 });
}
