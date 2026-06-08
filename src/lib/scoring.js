import { prisma } from "./db";
import { getActiveCompetitions } from "./competitions";

export async function getUserTotalPoints(userId) {
  const result = await prisma.solve.aggregate({
    where: { userId, pointsAwarded: { gt: 0 } },
    _sum: { pointsAwarded: true },
  });
  return result._sum.pointsAwarded ?? 0;
}

export async function getUserPointsSummary(userId) {
  const [activeCompetitions, overallTotal] = await Promise.all([
    getActiveCompetitions(),
    getUserTotalPoints(userId),
  ]);

  const activeBreakdown = await Promise.all(
    activeCompetitions.map(async (comp) => ({
      id: comp.id,
      name: comp.name,
      slug: comp.slug,
      points: await getUserScoreInCompetition(userId, comp.id),
    }))
  );

  const activeTotal = activeBreakdown.reduce((sum, entry) => sum + entry.points, 0);

  return {
    activeTotal,
    overallTotal,
    activeCompetitions: activeBreakdown,
    hasActiveCompetitions: activeCompetitions.length > 0,
  };
}

export async function getUserScoreInCompetition(userId, competitionId) {
  const solves = await prisma.solve.findMany({
    where: {
      userId,
      pointsAwarded: { gt: 0 },
      challenge: { competitionId, hidden: false },
    },
    select: { pointsAwarded: true },
  });

  return solves.reduce((sum, s) => sum + s.pointsAwarded, 0);
}

export async function getCompetitionLeaderboard(competitionId) {
  const solves = await prisma.solve.findMany({
    where: {
      pointsAwarded: { gt: 0 },
      challenge: { competitionId, hidden: false },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { solvedAt: "asc" },
  });

  const scores = new Map();

  for (const solve of solves) {
    const existing = scores.get(solve.userId) || {
      user: solve.user,
      score: 0,
      lastSolve: solve.solvedAt,
    };
    existing.score += solve.pointsAwarded;
    existing.lastSolve = solve.solvedAt;
    scores.set(solve.userId, existing);
  }

  return Array.from(scores.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.lastSolve) - new Date(b.lastSolve);
  });
}

export async function getChallengeLeaderboard(challengeId) {
  return prisma.solve.findMany({
    where: { challengeId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      flag: { select: { label: true } },
    },
    orderBy: { solvedAt: "asc" },
  });
}

export async function userHasSolvedChallenge(userId, challengeId) {
  const solve = await prisma.solve.findFirst({
    where: { userId, challengeId, pointsAwarded: { gt: 0 } },
  });
  return !!solve;
}

export async function userSolvedFlags(userId, challengeId) {
  const solves = await prisma.solve.findMany({
    where: { userId, challengeId },
    select: { flagId: true },
  });
  return new Set(solves.map((s) => s.flagId));
}
