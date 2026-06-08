import { prisma } from "@/lib/db";
import { getVisibleCompetitions } from "@/lib/competitions";
import { getCompetitionLeaderboard, getChallengeLeaderboard } from "@/lib/scoring";
import { LeaderboardTabs } from "@/components/leaderboard/leaderboard-tabs";

export default async function LeaderboardPage({ searchParams }) {
  const params = await searchParams;
  const competitions = await getVisibleCompetitions();
  const competitionId = params?.competition || competitions[0]?.id || null;

  let overall = [];
  let challenges = [];
  let challengeLeaderboards = {};

  if (competitionId) {
    overall = await getCompetitionLeaderboard(competitionId);
    challenges = await prisma.challenge.findMany({
      where: { competitionId, hidden: false },
      include: { category: true },
      orderBy: { title: "asc" },
    });

    for (const ch of challenges) {
      challengeLeaderboards[ch.id] = await getChallengeLeaderboard(ch.id);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Leaderboard</h1>
      <LeaderboardTabs
        competitions={competitions}
        selectedCompetitionId={competitionId}
        overall={overall}
        challenges={challenges}
        challengeLeaderboards={challengeLeaderboards}
      />
    </div>
  );
}
