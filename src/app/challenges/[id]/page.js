import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isChallengeAvailable, isCompetitionEnded } from "@/lib/competitions";
import { isChallengeUpcoming } from "@/lib/challenges";
import { cn } from "@/lib/utils";
import { userHasSolvedChallenge, userSolvedFlags } from "@/lib/scoring";
import { ContentRenderer } from "@/components/challenge/content-renderer";
import { FlagSubmit } from "@/components/challenge/flag-submit";
import { Countdown } from "@/components/challenge/countdown";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatInAEST } from "@/lib/timezone";
import { logActivity, getClientIp, getUserAgent } from "@/lib/telemetry";
import { TELEMETRY_ACTIONS } from "@/lib/constants";
import { headers } from "next/headers";

export default async function ChallengePage({ params }) {
  const { id } = await params;
  const user = await getCurrentUser();

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    include: {
      category: true,
      competition: true,
      flags: {
        orderBy: { order: "asc" },
        select: { id: true, label: true, order: true },
      },
      _count: { select: { solves: { where: { pointsAwarded: { gt: 0 } } } } },
    },
  });

  if (
    !challenge ||
    challenge.hidden ||
    challenge.competition.hidden ||
    isCompetitionEnded(challenge.competition)
  ) {
    notFound();
  }

  if (user) {
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const userAgent = headersList.get("user-agent") || "";
    await logActivity({
      userId: user.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.CHALLENGE_VIEW,
      metadata: { challengeId: id },
    });
  }

  const isUpcoming = isChallengeUpcoming(challenge);
  const available = isChallengeAvailable(challenge, challenge.competition);
  const solved = user ? await userHasSolvedChallenge(user.id, id) : false;
  const solvedFlagIds = user ? await userSolvedFlags(user.id, id) : new Set();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-2 text-sm text-muted-foreground">
        <Link href={`/competitions/${challenge.competition.slug}`} className="hover:text-primary">
          {challenge.competition.name}
        </Link>
        {" / "}
        <span>{challenge.category.name}</span>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{challenge.title}</h1>
        <Badge variant="outline">{challenge.points} pts</Badge>
        {solved && <Badge variant="success">Solved</Badge>}
      </div>

      {isUpcoming && (
        <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4 opacity-80">
          <div className="mb-2 flex items-center gap-2 text-muted-foreground">
            <Lock className="h-4 w-4" />
            <span className="text-sm font-medium">Challenge locked</span>
          </div>
          <Countdown targetDate={challenge.startAt} label="Challenge unlocks in" />
          <p className="mt-2 text-sm text-muted-foreground">
            Available from {formatInAEST(challenge.startAt)}
          </p>
        </div>
      )}

      <Card className={cn("mb-6", isUpcoming && "opacity-60")}>
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <ContentRenderer
            content={challenge.description}
            format={challenge.descriptionFormat}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Submit Flag</CardTitle>
          </CardHeader>
          <CardContent>
            {!user ? (
              <p className="text-sm text-muted-foreground">
                <Link href="/login" className="text-primary hover:underline">
                  Log in
                </Link>{" "}
                to submit flags.
              </p>
            ) : (
              <FlagSubmit challengeId={id} disabled={!available} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Solves: </span>
              {challenge._count.solves}
            </p>
            {challenge.flags.length > 1 && user && (
              <div>
                <span className="text-muted-foreground">Flags captured: </span>
                {solvedFlagIds.size} / {challenge.flags.length}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
