import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatInAEST } from "@/lib/timezone";
import { isCompetitionEnded } from "@/lib/competitions";

export function CompetitionCard({ competition }) {
  const now = new Date();
  const isUpcoming = competition.startAt > now;
  const isEnded = isCompetitionEnded(competition);

  return (
    <Link href={`/competitions/${competition.slug}`}>
      <Card className="h-full transition-colors hover:border-primary/50">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-lg">{competition.name}</CardTitle>
            {isUpcoming && <Badge variant="warning">Upcoming</Badge>}
            {isEnded && <Badge variant="secondary">Ended</Badge>}
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>Start: {formatInAEST(competition.startAt)}</p>
          <p>End: {formatInAEST(competition.endAt)}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
