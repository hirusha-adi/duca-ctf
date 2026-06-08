import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Countdown } from "./countdown";
import { CheckCircle2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChallengeCard({ challenge, solved = false, showCountdown = true }) {
  const now = new Date();
  const isUpcoming = new Date(challenge.startAt) > now;
  const isLocked = isUpcoming;

  return (
    <Card
      className={cn(
        "transition-colors",
        isLocked
          ? "border-border bg-muted/30 opacity-60"
          : "hover:border-primary/50"
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">
            <Link
              href={`/challenges/${challenge.id}`}
              className={cn(
                isLocked ? "text-muted-foreground" : "hover:text-primary"
              )}
            >
              {challenge.title}
            </Link>
          </CardTitle>
          {solved && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
          {isLocked && !solved && <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{challenge.category?.name}</Badge>
          <Badge variant="outline">{challenge.points} pts</Badge>
          {challenge.competition && (
            <span className="text-xs text-muted-foreground">{challenge.competition.name}</span>
          )}
        </div>
      </CardHeader>
      {showCountdown && isUpcoming && (
        <CardContent className="pt-0">
          <Countdown targetDate={challenge.startAt} />
        </CardContent>
      )}
    </Card>
  );
}
