import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getVisibleCompetitions } from "@/lib/competitions";
import { LiveSolveFeed } from "@/components/solves/live-solve-feed";
import { SolvesFilter } from "@/components/solves/solves-filter";

export default async function SolvesPage({ searchParams }) {
  const params = await searchParams;
  const competitionId = params?.competition || null;
  const competitions = await getVisibleCompetitions();
  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";

  const solves = await prisma.solve.findMany({
    where: {
      challenge: {
        hidden: false,
        competition: {
          hidden: false,
          ...(competitionId ? { id: competitionId } : {}),
        },
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      challenge: {
        select: {
          id: true,
          title: true,
          points: true,
          competition: { select: { id: true, name: true, slug: true } },
        },
      },
    },
    orderBy: { solvedAt: "desc" },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Live Solves</h1>
          <p className="text-sm text-muted-foreground">Updates every 5 seconds</p>
        </div>
        <SolvesFilter competitions={competitions} selectedId={competitionId} />
      </div>
      <LiveSolveFeed
        initialSolves={solves}
        competitionId={competitionId}
        isAdmin={isAdmin}
      />
    </div>
  );
}
