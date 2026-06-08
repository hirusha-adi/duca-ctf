import { prisma } from "./db";

export function isCompetitionActive(competition) {
  const now = new Date();
  return (
    !competition.hidden &&
    competition.status !== "ENDED" &&
    competition.startAt <= now &&
    competition.endAt >= now
  );
}

export function isCompetitionEnded(competition) {
  return competition.status === "ENDED" || competition.endAt < new Date();
}

export function isChallengeAvailable(challenge, competition) {
  const now = new Date();
  return (
    !challenge.hidden &&
    !competition.hidden &&
    challenge.startAt <= now &&
    competition.startAt <= now &&
    competition.endAt >= now &&
    competition.status !== "ENDED"
  );
}

export async function getActiveCompetitions() {
  const now = new Date();
  return prisma.competition.findMany({
    where: {
      hidden: false,
      startAt: { lte: now },
      endAt: { gte: now },
      status: { not: "ENDED" },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getVisibleCompetitions() {
  return prisma.competition.findMany({
    where: { hidden: false },
    orderBy: { createdAt: "desc" },
  });
}
