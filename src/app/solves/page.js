import { getCurrentUser } from "@/lib/auth";
import { getVisibleCompetitions } from "@/lib/competitions";
import { listSolveFeed } from "@/lib/solve-feed";
import { LiveSolveFeed } from "@/components/solves/live-solve-feed";
import { SolvesFilter } from "@/components/solves/solves-filter";

export default async function SolvesPage({ searchParams }) {
  const params = await searchParams;
  const competitionId = params?.competition || null;
  const competitions = await getVisibleCompetitions();
  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";

  const solves = await listSolveFeed({ competitionId });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Live Solves</h1>
          <p className="text-sm text-muted-foreground">Live updates</p>
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
