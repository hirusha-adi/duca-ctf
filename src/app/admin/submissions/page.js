import { prisma } from "@/lib/db";
import { TELEMETRY_ACTIONS } from "@/lib/constants";
import { AdminSubmissionsTable } from "@/components/admin/submissions-table";
import { formatInAEST } from "@/lib/timezone";

const SUBMIT_ACTIONS = [
  TELEMETRY_ACTIONS.FLAG_SUBMIT_CORRECT,
  TELEMETRY_ACTIONS.FLAG_SUBMIT_INCORRECT,
];

export default async function AdminSubmissionsPage({ searchParams }) {
  const params = await searchParams;
  const categoryId = params?.category || "";
  const competitionId = params?.competition || "";
  const result = params?.result || "all";

  const [categories, competitions] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.competition.findMany({ orderBy: { createdAt: "desc" } }),
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

  const submissions = logs.map((log) => {
    const meta = log.metadata || {};
    const challenge = challengeMap[meta.challengeId];
    const correct = log.action === TELEMETRY_ACTIONS.FLAG_SUBMIT_CORRECT;

    return {
      id: log.id,
      submittedAtFormatted: formatInAEST(log.createdAt),
      userName: log.user?.name || log.user?.email || "—",
      challengeTitle: challenge?.title || meta.challengeId || "Unknown",
      categoryName: challenge?.category?.name || "—",
      competitionName: challenge?.competition?.name || "—",
      correct,
      pointsAwarded: meta.pointsAwarded ?? 0,
      ip: log.ip,
    };
  });

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Submission History</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Flag submission attempts across all challenges. Filter by category or competition.
      </p>
      <AdminSubmissionsTable
        submissions={submissions}
        categories={categories}
        competitions={competitions}
        filters={{ category: categoryId, competition: competitionId, result }}
      />
    </div>
  );
}
