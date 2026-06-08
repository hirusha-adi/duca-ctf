import { prisma } from "@/lib/db";
import { TELEMETRY_ACTIONS } from "@/lib/constants";
import { AdminSubmissionsTable } from "@/components/admin/submissions-table";
import { UnsolveChallengeForm } from "@/components/admin/unsolve-challenge-form";
import { formatInAEST } from "@/lib/timezone";

const SUBMIT_ACTIONS = [
  TELEMETRY_ACTIONS.FLAG_SUBMIT_CORRECT,
  TELEMETRY_ACTIONS.FLAG_SUBMIT_INCORRECT,
  TELEMETRY_ACTIONS.FLAG_SUBMIT_REVERTED,
];

function buildSubmissionRows(logs, challengeMap, activeSolveSet) {
  return logs.map((log) => {
    const meta = log.metadata || {};
    const challenge = challengeMap[meta.challengeId];
    const status =
      log.action === TELEMETRY_ACTIONS.FLAG_SUBMIT_CORRECT
        ? "correct"
        : log.action === TELEMETRY_ACTIONS.FLAG_SUBMIT_REVERTED
          ? "reverted"
          : "incorrect";

    const targetUserId = log.userId || meta.targetUserId;
    const solveKey =
      targetUserId && meta.challengeId ? `${targetUserId}:${meta.challengeId}` : null;

    return {
      id: log.id,
      submittedAtFormatted: formatInAEST(log.createdAt),
      userId: targetUserId,
      challengeId: meta.challengeId,
      userName:
        log.user?.name ||
        log.user?.email ||
        meta.targetUserName ||
        meta.targetUserEmail ||
        "—",
      challengeTitle: challenge?.title || meta.challengeTitle || meta.challengeId || "Unknown",
      categoryName: challenge?.category?.name || meta.categoryName || "—",
      competitionName: challenge?.competition?.name || meta.competitionName || "—",
      status,
      pointsAwarded: meta.pointsAwarded ?? meta.pointsRemoved ?? 0,
      ip: log.ip,
      revertedBy: meta.revertedByAdminName || meta.revertedByAdminEmail || null,
      canUnsolve: status === "correct" && solveKey ? activeSolveSet.has(solveKey) : false,
    };
  });
}

export default async function AdminSubmissionsPage({ searchParams }) {
  const params = await searchParams;
  const categoryId = params?.category || "";
  const competitionId = params?.competition || "";
  const result = params?.result || "all";

  const [categories, competitions, users] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.competition.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);

  let challengeIds = null;
  if (categoryId || competitionId) {
    const challengeWhere = {};
    if (categoryId) challengeWhere.categoryId = categoryId;
    if (competitionId) challengeWhere.competitionId = competitionId;

    const challenges = await prisma.challenge.findMany({
      where: challengeWhere,
      select: { id: true },
    });
    challengeIds = challenges.map((c) => c.id);

    if (challengeIds.length === 0) {
      return (
        <div>
          <h1 className="mb-2 text-2xl font-bold">Submission History</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Flag submission attempts across all challenges. Filter by category or competition.
          </p>
          <UnsolveChallengeForm users={users} />
          <AdminSubmissionsTable
            submissions={[]}
            categories={categories}
            competitions={competitions}
            filters={{ category: categoryId, competition: competitionId, result }}
          />
        </div>
      );
    }
  }

  const actionFilter =
    result === "correct"
      ? TELEMETRY_ACTIONS.FLAG_SUBMIT_CORRECT
      : result === "incorrect"
        ? TELEMETRY_ACTIONS.FLAG_SUBMIT_INCORRECT
        : result === "reverted"
          ? TELEMETRY_ACTIONS.FLAG_SUBMIT_REVERTED
          : { in: SUBMIT_ACTIONS };

  const logWhere = { action: actionFilter };
  if (challengeIds) {
    logWhere.OR = challengeIds.map((id) => ({
      metadata: { path: ["challengeId"], equals: id },
    }));
  }

  const logs = await prisma.activityLog.findMany({
    where: logWhere,
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const logChallengeIds = [
    ...new Set(
      logs
        .map((log) => log.metadata?.challengeId)
        .filter((id) => typeof id === "string")
    ),
  ];

  const challenges = logChallengeIds.length
    ? await prisma.challenge.findMany({
        where: { id: { in: logChallengeIds } },
        include: {
          category: { select: { id: true, name: true } },
          competition: { select: { id: true, name: true } },
        },
      })
    : [];

  const challengeMap = Object.fromEntries(challenges.map((c) => [c.id, c]));

  const solvePairs = logs
    .filter((log) => log.action === TELEMETRY_ACTIONS.FLAG_SUBMIT_CORRECT)
    .map((log) => ({
      userId: log.userId,
      challengeId: log.metadata?.challengeId,
    }))
    .filter((p) => p.userId && p.challengeId);

  const uniquePairs = [
    ...new Map(solvePairs.map((p) => [`${p.userId}:${p.challengeId}`, p])).values(),
  ];

  const activeSolves =
    uniquePairs.length > 0
      ? await prisma.solve.findMany({
          where: { OR: uniquePairs },
          select: { userId: true, challengeId: true },
        })
      : [];

  const activeSolveSet = new Set(
    activeSolves.map((s) => `${s.userId}:${s.challengeId}`)
  );

  const submissions = buildSubmissionRows(logs, challengeMap, activeSolveSet);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Submission History</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Flag submission attempts across all challenges. Filter by category or competition.
      </p>
      <UnsolveChallengeForm users={users} />
      <AdminSubmissionsTable
        submissions={submissions}
        categories={categories}
        competitions={competitions}
        filters={{ category: categoryId, competition: competitionId, result }}
      />
    </div>
  );
}
