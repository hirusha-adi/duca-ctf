import Link from "next/link";
import { prisma } from "@/lib/db";
import { getActiveCompetitions } from "@/lib/competitions";
import { getCurrentUser } from "@/lib/auth";
import { userHasSolvedChallenge } from "@/lib/scoring";
import { ChallengeCard } from "@/components/challenge/challenge-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatInAEST } from "@/lib/timezone";
import { ArrowRight, Trophy, Zap, BookOpen } from "lucide-react";
export default async function HomePage() {
  const user = await getCurrentUser();
  const activeCompetitions = await getActiveCompetitions();
  const now = new Date();

  const upcomingChallenges = await prisma.challenge.findMany({
    where: {
      hidden: false,
      startAt: { gt: now },
      competition: {
        hidden: false,
        status: { not: "ENDED" },
        endAt: { gte: now },
      },
    },
    include: {
      category: true,
      competition: { select: { name: true, slug: true } },
    },
    orderBy: { startAt: "asc" },
    take: 12,
  });

  const solvedMap = {};
  if (user) {
    for (const ch of upcomingChallenges) {
      solvedMap[ch.id] = await userHasSolvedChallenge(user.id, ch.id);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <section className="mb-12">
        <h1 className="text-3xl font-bold tracking-tight">DUCA CTF</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Deakin University Cybersecurity Association capture-the-flag platform.
        </p>

        {activeCompetitions.length > 0 ? (
          <div className="mt-6 flex flex-wrap gap-3">
            {activeCompetitions.map((comp) => (
              <Button key={comp.id} asChild variant="outline">
                <Link href={`/competitions/${comp.slug}`}>
                  {comp.name}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            No active competitions right now. Check back soon.
          </p>
        )}
      </section>

      <section className="mb-12 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-primary" />
              Live Solves
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Watch solves happen in real time.</p>
            <Button asChild variant="link" className="mt-2 h-auto p-0">
              <Link href="/solves">View solves</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-primary" />
              Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">See who is leading the scoreboard.</p>
            <Button asChild variant="link" className="mt-2 h-auto p-0">
              <Link href="/leaderboard">View rankings</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-primary" />
              Writeups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Challenge solutions after competitions end.</p>
            <Button asChild variant="link" className="mt-2 h-auto p-0">
              <Link href="/writeups">Browse writeups</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      {upcomingChallenges.length > 0 && (
        <section>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Upcoming Challenges</h2>
            <span className="text-sm text-muted-foreground">
              Times in AEST/AEDT
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingChallenges.map((challenge) => (
              <div key={challenge.id}>
                <ChallengeCard
                  challenge={challenge}
                  solved={solvedMap[challenge.id]}
                />
                <p className="mt-1 px-1 text-xs text-muted-foreground">
                  Starts {formatInAEST(challenge.startAt)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
