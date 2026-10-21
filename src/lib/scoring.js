import { prisma } from "./db";
import { getActiveCompetitions } from "./competitions";
import { rankCompetitionScores } from "./leaderboard-ranking.mjs";

export async function getUserTotalPoints(userId) {
  const [awards, hints] = await Promise.all([
    prisma.solve.aggregate({
      where: { userId, pointsAwarded: { gt: 0 } },
      _sum: { pointsAwarded: true },
    }),
    prisma.hintUnlock.aggregate({
      where: { userId },
      _sum: { costPaid: true },
    }),
  ]);
  return (awards._sum.pointsAwarded ?? 0) - (hints._sum.costPaid ?? 0);
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
  const [awards, hints] = await Promise.all([
    prisma.solve.aggregate({
      where: { userId, pointsAwarded: { gt: 0 }, challenge: { competitionId } },
      _sum: { pointsAwarded: true },
    }),
    prisma.hintUnlock.aggregate({
      where: { userId, hint: { challenge: { competitionId } } },
      _sum: { costPaid: true },
    }),
  ]);
  return (awards._sum.pointsAwarded ?? 0) - (hints._sum.costPaid ?? 0);
}

export async function getCompetitionLeaderboard(competitionId) {
  // Visibility is a presentation choice; it must not revoke earned points.
  const [awards, hints] = await Promise.all([
    prisma.solve.groupBy({
      by: ["userId"],
      where: { pointsAwarded: { gt: 0 }, challenge: { competitionId } },
      _sum: { pointsAwarded: true },
      _max: { solvedAt: true },
    }),
    prisma.hintUnlock.groupBy({
      by: ["userId"],
      where: { hint: { challenge: { competitionId } }, costPaid: { gt: 0 } },
      _sum: { costPaid: true },
    }),
  ]);
  const userIds = [...new Set([...awards, ...hints].map((row) => row.userId))];
  if (userIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  return rankCompetitionScores(awards, hints, users);
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
    where: { userId, challengeId },
  });
  return !!solve;
}

export async function userSolvedFlags(userId, challengeId) {
  const solves = await prisma.solve.findMany({
    where: { userId, challengeId, flag: { retired: false } },
    select: { flagId: true },
  });
  return new Set(solves.map((s) => s.flagId));
}
