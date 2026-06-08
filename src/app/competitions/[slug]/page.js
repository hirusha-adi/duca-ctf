import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, FileText, Lock } from "lucide-react";
import { formatInAEST } from "@/lib/timezone";
import { isChallengeAvailable, isCompetitionEnded } from "@/lib/competitions";
import { isChallengeUpcoming } from "@/lib/challenges";
import { cn } from "@/lib/utils";
import { ContentRenderer } from "@/components/challenge/content-renderer";

export default async function CompetitionPage({ params }) {
  const { slug } = await params;
  const user = await getCurrentUser();

  const competition = await prisma.competition.findUnique({
    where: { slug },
    include: {
      challenges: {
        where: { hidden: false },
        include: {
          category: true,
          writeup: { select: { id: true } },
          _count: { select: { flags: true } },
        },
        orderBy: [{ category: { name: "asc" } }, { points: "desc" }],
      },
    },
  });

  if (!competition || competition.hidden) notFound();

  const ended = isCompetitionEnded(competition);

  const solvedMap = {};
  const flagProgressMap = {};

  if (user) {
    for (const ch of competition.challenges) {
      flagProgressMap[ch.id] = {
        captured: 0,
        total: ch._count.flags,
        solved: false,
      };
    }

    const userSolves = await prisma.solve.findMany({
      where: {
        userId: user.id,
        challengeId: { in: competition.challenges.map((c) => c.id) },
      },
      select: { challengeId: true, pointsAwarded: true },
    });

    for (const solve of userSolves) {
      const progress = flagProgressMap[solve.challengeId];
      if (!progress) continue;
      progress.captured += 1;
      if (solve.pointsAwarded > 0) progress.solved = true;
    }

    for (const ch of competition.challenges) {
      solvedMap[ch.id] = flagProgressMap[ch.id].solved;
    }
  }

  const byCategory = competition.challenges.reduce((acc, ch) => {
    const cat = ch.category.name;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ch);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{competition.name}</h1>
          {ended && <Badge variant="secondary">Ended</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatInAEST(competition.startAt)} — {formatInAEST(competition.endAt)}
        </p>
        {competition.description && (
          <div className="mt-4 max-w-3xl">
            <ContentRenderer
              content={competition.description}
              format={competition.descriptionFormat}
            />
          </div>
        )}
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
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Challenge
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Tags
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Status
                      </th>
                      {ended && (
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Writeup
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {challenges.map((ch) => {
                      const solved = solvedMap[ch.id];
                      const progress = flagProgressMap[ch.id];
                      const multiFlag = progress && progress.total > 1;
                      const available = isChallengeAvailable(ch, competition);
                      const upcoming = !ended && isChallengeUpcoming(ch);

                      return (
                        <tr
                          key={ch.id}
                          className={cn(
                            "border-b border-border",
                            upcoming
                              ? "bg-muted/30 opacity-50"
                              : "hover:bg-muted/30"
                          )}
                        >
                          <td className="px-4 py-3">
                            <Link
                              href={`/challenges/${ch.id}`}
                              className={cn(
                                "font-medium",
                                upcoming ? "text-muted-foreground" : "hover:text-primary"
                              )}
                            >
                              <span className="flex items-center gap-2">
                                {upcoming && <Lock className="h-4 w-4 shrink-0" />}
                                {ch.title}
                              </span>
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">{ch.category.name}</Badge>
                              <Badge variant="outline">{ch.points} pts</Badge>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {solved ? (
                              <span className="flex items-center gap-1 text-primary">
                                <CheckCircle2 className="h-4 w-4" />
                                Solved
                                {multiFlag && (
                                  <span className="text-muted-foreground">
                                    · {progress.captured}/{progress.total}
                                  </span>
                                )}
                              </span>
                            ) : multiFlag && progress.captured > 0 ? (
                              <span className="text-primary">
                                {progress.captured}/{progress.total} flags
                              </span>
                            ) : ended ? (
                              <Badge variant="secondary">Ended</Badge>
                            ) : upcoming ? (
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Lock className="h-4 w-4" /> Locked · {formatInAEST(ch.startAt)}
                              </span>
                            ) : available ? (
                              <Badge variant="outline">Open</Badge>
                            ) : (
                              <Badge variant="secondary">Closed</Badge>
                            )}
                          </td>
                          {ended && (
                            <td className="px-4 py-3">
                              {ch.writeup ? (
                                <Link
                                  href={`/writeups/${ch.id}`}
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                  <FileText className="h-4 w-4" />
                                  Read
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          )}
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
