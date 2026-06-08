import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { userHasSolvedChallenge } from "@/lib/scoring";
import { Badge } from "@/components/ui/badge";
import { formatInAEST } from "@/lib/timezone";
import { isChallengeAvailable, isCompetitionEnded } from "@/lib/competitions";
import { isChallengeUpcoming } from "@/lib/challenges";
import { ContentRenderer } from "@/components/challenge/content-renderer";
import { ChallengePreview } from "@/components/challenge/challenge-preview";
import { ChallengeCard } from "@/components/challenge/challenge-card";

function isChallengeFeatured(challenge, competition, ended) {
  if (ended) return true;
  return !isChallengeUpcoming(challenge);
}

export default async function CompetitionPage({ params }) {
  const { slug } = await params;
  const user = await getCurrentUser();

  const competition = await prisma.competition.findUnique({
    where: { slug },
    include: {
      challenges: {
        where: { hidden: false },
        include: { category: true, writeup: { select: { id: true } } },
        orderBy: [{ category: { name: "asc" } }, { points: "desc" }],
      },
    },
  });

  if (!competition || competition.hidden) notFound();

  const ended = isCompetitionEnded(competition);

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
        <div className="space-y-10">
          {Object.entries(byCategory).map(([category, challenges]) => {
            const featured = challenges.filter((ch) =>
              isChallengeFeatured(ch, competition, ended)
            );
            const inactive = challenges.filter(
              (ch) => !isChallengeFeatured(ch, competition, ended)
            );

            return (
              <section key={category}>
                <h2 className="mb-4 text-lg font-semibold text-primary">{category}</h2>

                {featured.length > 0 && (
                  <div className="space-y-4">
                    {featured.map((ch) => (
                      <ChallengePreview
                        key={ch.id}
                        challenge={ch}
                        solved={solvedMap[ch.id]}
                        ended={ended}
                        available={isChallengeAvailable(ch, competition)}
                      />
                    ))}
                  </div>
                )}

                {inactive.length > 0 && (
                  <div
                    className={featured.length > 0 ? "mt-6" : undefined}
                  >
                    {featured.length > 0 && (
                      <p className="mb-3 text-sm font-medium text-muted-foreground">
                        Upcoming
                      </p>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {inactive.map((ch) => (
                        <div key={ch.id}>
                          <ChallengeCard
                            challenge={ch}
                            solved={solvedMap[ch.id]}
                          />
                          <p className="mt-1 px-1 text-xs text-muted-foreground">
                            Starts {formatInAEST(ch.startAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
