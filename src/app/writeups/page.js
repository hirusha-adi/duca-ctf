import Link from "next/link";
import { prisma } from "@/lib/db";
import { isCompetitionEnded } from "@/lib/competitions";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock, FileText } from "lucide-react";
import { formatInAEST } from "@/lib/timezone";

export default async function WriteupsPage() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";

  const competitions = await prisma.competition.findMany({
    where: { hidden: false },
    include: {
      challenges: {
        where: { hidden: false },
        include: {
          writeup: true,
          category: true,
        },
        orderBy: { title: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold">Writeups</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Writeups are unlocked after each competition ends.
      </p>

      {competitions.length === 0 ? (
        <p className="text-muted-foreground">No competitions yet.</p>
      ) : (
        <div className="space-y-8">
          {competitions.map((comp) => {
            const ended = isCompetitionEnded(comp);
            const unlocked = ended || isAdmin;

            return (
              <section key={comp.id}>
                <div className="mb-4 flex items-center gap-3">
                  <h2 className="text-lg font-semibold">{comp.name}</h2>
                  {unlocked ? (
                    <Badge variant="success">Unlocked</Badge>
                  ) : (
                    <Badge variant="warning" className="flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      Locked until {formatInAEST(comp.endAt)}
                    </Badge>
                  )}
                </div>

                {comp.challenges.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No challenges.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {comp.challenges.map((ch) => (
                      <Card key={ch.id} className={!unlocked ? "opacity-60" : ""}>
                        <CardHeader className="pb-2">
                          <CardTitle className="flex items-center gap-2 text-base">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            {ch.title}
                            <Badge variant="secondary" className="ml-auto">
                              {ch.category.name}
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {unlocked ? (
                            ch.writeup ? (
                              <Link
                                href={`/writeups/${ch.id}`}
                                className="text-sm text-primary hover:underline"
                              >
                                Read writeup
                              </Link>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                No writeup published yet
                              </span>
                            )
                          ) : (
                            <span className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Lock className="h-3 w-3" />
                              Locked
                            </span>
                          )}
                        </CardContent>
                      </Card>
                    ))}
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
