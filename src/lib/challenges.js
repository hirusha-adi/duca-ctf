import { prisma } from "./db";
import { parseDatetimeLocalToUTC } from "./timezone";

export function isChallengeUpcoming(challenge) {
  return new Date(challenge.startAt) > new Date();
}

export async function resolveChallengeStartAt(competitionId, { useCustomStart, startAt }) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
  });

  if (!competition) {
    throw new Error("COMPETITION_NOT_FOUND");
  }

  let resolved;
  if (useCustomStart && startAt) {
    resolved = parseDatetimeLocalToUTC(startAt);
  } else {
    resolved = competition.startAt;
  }

  if (!resolved) {
    throw new Error("INVALID_START");
  }

  if (resolved.getTime() > competition.endAt.getTime()) {
    throw new Error("START_AFTER_COMPETITION_END");
  }

  if (resolved.getTime() < competition.startAt.getTime()) {
    throw new Error("START_BEFORE_COMPETITION");
  }

  return { startAt: resolved, competition };
}

export function challengeStartErrorMessage(code) {
  const messages = {
    COMPETITION_NOT_FOUND: "Competition not found",
    INVALID_START: "Invalid challenge start time",
    START_AFTER_COMPETITION_END: "Challenge start cannot be after the competition ends",
    START_BEFORE_COMPETITION: "Challenge start cannot be before the competition starts",
  };
  return messages[code] || "Invalid challenge start time";
}
