import { prisma } from "@/lib/db";

export const solveFeedInclude = {
  user: { select: { id: true, name: true, email: true } },
  challenge: {
    select: {
      id: true,
      title: true,
      points: true,
      hidden: true,
      competition: {
        select: { id: true, name: true, slug: true, hidden: true },
      },
    },
  },
};

export function solveFeedWhere(competitionId) {
  return {
    challenge: {
      hidden: false,
      competition: {
        hidden: false,
        ...(competitionId ? { id: competitionId } : {}),
      },
    },
  };
}

export function serializeSolve(solve) {
  return {
    id: solve.id,
    pointsAwarded: solve.pointsAwarded,
    solvedAt: solve.solvedAt.toISOString(),
    user: solve.user,
    challenge: {
      id: solve.challenge.id,
      title: solve.challenge.title,
      points: solve.challenge.points,
      competition: solve.challenge.competition,
    },
  };
}

export function isSolveVisibleOnFeed(solve) {
  return !solve.challenge.hidden && !solve.challenge.competition.hidden;
}

export async function listSolveFeed({ competitionId = null, limit = 50 } = {}) {
  const solves = await prisma.solve.findMany({
    where: solveFeedWhere(competitionId),
    include: solveFeedInclude,
    orderBy: { solvedAt: "desc" },
    take: Math.min(limit, 100),
  });

  return solves.map(serializeSolve);
}

export async function getSolveForFeed(solveId) {
  const solve = await prisma.solve.findUnique({
    where: { id: solveId },
    include: solveFeedInclude,
  });

  if (!solve || !isSolveVisibleOnFeed(solve)) return null;
  return serializeSolve(solve);
}
