import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { userHasSolvedChallenge } from "@/lib/scoring";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Lock } from "lucide-react";
import { formatInAEST } from "@/lib/timezone";
import { isChallengeAvailable } from "@/lib/competitions";

export default async function CompetitionPage({ params }) {
  const { slug } = await params;
  const user = await getCurrentUser();

  const competition = await prisma.competition.findUnique({
    where: { slug },
    include: {
      challenges: {
        where: { hidden: false },
        include: { category: true },
        orderBy: [{ category: { name: "asc" } }, { points: "desc" }],
      },
    },
  });

  if (!competition || competition.hidden) notFound();

  const solvedMap = {};
  if (user) {
    for (const ch of competition.challenges) {
      solvedMap[ch.id] = await userHasSolvedChallenge(user.id, ch.id);
    }
  }

  const byCategory = competition.challenges.reduce((acc, ch) => {
    const cat = ch.category.name;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ch);
    return acc;
  }, {});

  const now = new Date();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">{competition.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatInAEST(competition.startAt)} — {formatInAEST(competition.endAt)}
        </p>
      </div>

      {Object.keys(byCategory).length === 0 ? (
        <p className="text-muted-foreground">No challenges published yet.</p>
      ) : (
        <div className="space-y-8">
          {Object.entries(byCategory).map(([category, challenges]) => (
            <section key={category}>
              <h2 className="mb-4 text-lg font-semibold text-primary">{category}</h2>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-card">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Challenge</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Points</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {challenges.map((ch) => {
                      const solved = solvedMap[ch.id];
                      const available = isChallengeAvailable(ch, competition);
                      const upcoming = new Date(ch.startAt) > now;

                      return (
                        <tr key={ch.id} className="border-b border-border hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <Link
                              href={`/challenges/${ch.id}`}
                              className="font-medium hover:text-primary"
                            >
                              {ch.title}
                            </Link>
                          </td>
                          <td className="px-4 py-3">{ch.points}</td>
                          <td className="px-4 py-3">
                            {solved ? (
                              <span className="flex items-center gap-1 text-primary">
                                <CheckCircle2 className="h-4 w-4" /> Solved
                              </span>
                            ) : upcoming ? (
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Lock className="h-4 w-4" /> {formatInAEST(ch.startAt)}
                              </span>
                            ) : available ? (
                              <Badge variant="outline">Open</Badge>
                            ) : (
                              <Badge variant="secondary">Closed</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
