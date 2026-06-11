import { prisma } from "./db";
import { TELEMETRY_ACTIONS } from "./constants";
import { formatInAEST } from "./timezone";

export const USER_SUBMISSION_ACTIONS = [
  TELEMETRY_ACTIONS.FLAG_SUBMIT_CORRECT,
  TELEMETRY_ACTIONS.FLAG_SUBMIT_INCORRECT,
  TELEMETRY_ACTIONS.FLAG_SUBMIT_REVERTED,
];

export function buildUserSubmissionRows(logs, challengeMap) {
  return logs.map((log) => {
    const meta = log.metadata || {};
    const challenge = challengeMap[meta.challengeId];
    const status =
      log.action === TELEMETRY_ACTIONS.FLAG_SUBMIT_CORRECT
        ? "correct"
        : log.action === TELEMETRY_ACTIONS.FLAG_SUBMIT_REVERTED
          ? "reverted"
          : "incorrect";

    return {
      id: log.id,
      submittedAtFormatted: formatInAEST(log.createdAt),
      challengeId: meta.challengeId,
      challengeTitle: challenge?.title || meta.challengeTitle || "Unknown",
      categoryName: challenge?.category?.name || meta.categoryName || "—",
      competitionName: challenge?.competition?.name || meta.competitionName || "—",
      status,
      pointsAwarded: meta.pointsAwarded ?? meta.pointsRemoved ?? 0,
    };
  });
}

export async function getUserSubmissions(userId, { competitionId, page, pageSize }) {
  const logWhere = {
    userId,
    action: { in: USER_SUBMISSION_ACTIONS },
  };

  if (competitionId) {
    logWhere.metadata = {
      path: ["competitionId"],
      equals: competitionId,
    };
  }

  const [logs, totalCount] = await Promise.all([
    prisma.activityLog.findMany({
      where: logWhere,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.activityLog.count({ where: logWhere }),
  ]);

  const challengeIds = [
    ...new Set(
      logs
        .map((log) => log.metadata?.challengeId)
        .filter((id) => typeof id === "string")
    ),
  ];

  const challenges = challengeIds.length
    ? await prisma.challenge.findMany({
        where: { id: { in: challengeIds } },
        include: {
          category: { select: { name: true } },
          competition: { select: { name: true } },
        },
      })
    : [];

  const challengeMap = Object.fromEntries(challenges.map((c) => [c.id, c]));

  return {
    submissions: buildUserSubmissionRows(logs, challengeMap),
    totalCount,
  };
}
