import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePageAuth } from "@/lib/auth";
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
import { getUserChallengeSubmissionStats } from "@/lib/submissions";

export default async function ChallengePage({ params }) {
  const { id } = await params;
  const user = await requirePageAuth(`/challenges/${id}`);

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    include: {
      category: true,
      competition: true,
      flags: {
        orderBy: { order: "asc" },
        select: { id: true, label: true, order: true },
      },
      writeup: { select: { id: true } },
    },
  });

  if (!challenge || challenge.hidden || challenge.competition.hidden) {
    notFound();
  }

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

  const [solves, submissionStats] = await Promise.all([
    prisma.solve.findMany({
      where: { challengeId: id, pointsAwarded: { gt: 0 } },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { solvedAt: "asc" },
    }),
    getUserChallengeSubmissionStats(user.id, id),
  ]);

  const ended = isCompetitionEnded(challenge.competition);
  const isUpcoming = !ended && isChallengeUpcoming(challenge);
  const available = isChallengeAvailable(challenge, challenge.competition);
  const submissionLimitReached =
    challenge.submitLimit != null &&
    submissionStats &&
    submissionStats.total >= challenge.submitLimit;

  const submitDisabledMessage = submissionLimitReached
    ? "You have reached the submission limit for this challenge."
    : ended
      ? "This competition has ended. Flag submissions are closed."
      : isUpcoming
        ? "This challenge is not yet available for submission."
        : "This challenge is not available for submission.";
  const solved = await userHasSolvedChallenge(user.id, id);
  const solvedFlagIds = await userSolvedFlags(user.id, id);

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
        {ended && <Badge variant="secondary">Ended</Badge>}
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

      <div className="mb-6 grid gap-6 lg:grid-cols-2 lg:items-stretch">
        <Card className={cn("flex flex-col", isUpcoming && "opacity-60")}>
          <CardHeader>
            <CardTitle className="text-base">Submit Flag</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {submissionStats && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm">
                <span>
                  <span className="text-muted-foreground">Failed: </span>
                  <span className="font-medium">{submissionStats.failed}</span>
                </span>
                {challenge.submitLimit != null ? (
                  <span>
                    <span className="text-muted-foreground">Submissions: </span>
                    <span className="font-medium">
                      {submissionStats.total} / {challenge.submitLimit}
                    </span>
                  </span>
                ) : (
                  <span>
                    <span className="text-muted-foreground">Submissions: </span>
                    <span className="font-medium">{submissionStats.total}</span>
                  </span>
                )}
                {challenge.flags.length > 1 && (
                  <span>
                    <span className="text-muted-foreground">Flags captured: </span>
                    <span className="font-medium">
                      {solvedFlagIds.size} / {challenge.flags.length}
                    </span>
                  </span>
                )}
              </div>
            )}

            <FlagSubmit
              challengeId={id}
              disabled={!available || submissionLimitReached}
              disabledMessage={submitDisabledMessage}
            />
          </CardContent>
        </Card>

        <Card className="flex min-h-[220px] max-h-[320px] flex-col overflow-hidden">
          <CardHeader className="shrink-0">
            <CardTitle className="text-base">Solves ({solves.length})</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            {solves.length === 0 ? (
              <p className="text-sm text-muted-foreground">No solves yet.</p>
            ) : (
              <ul className="space-y-2 pr-1">
                {solves.map((solve) => (
                  <li
                    key={solve.id}
                    className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 text-sm last:border-0 last:pb-0"
                  >
                    <span className="truncate font-medium">
                      {solve.user.name || solve.user.email}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatInAEST(solve.solvedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

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

      {ended && challenge.writeup && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Writeup</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href={`/writeups/${id}`} className="text-sm text-primary hover:underline">
              Read the official writeup
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
