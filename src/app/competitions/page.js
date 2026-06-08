import Link from "next/link";
import { getVisibleCompetitions } from "@/lib/competitions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatInAEST } from "@/lib/timezone";

export default async function CompetitionsPage() {
  const competitions = await getVisibleCompetitions();
  const now = new Date();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Competitions</h1>

      {competitions.length === 0 ? (
        <p className="text-muted-foreground">No competitions available.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {competitions.map((comp) => {
            const isActive =
              comp.status !== "ENDED" && comp.startAt <= now && comp.endAt >= now;
            const isUpcoming = comp.startAt > now;
            const isEnded = comp.status === "ENDED" || comp.endAt < now;

            return (
              <Link key={comp.id} href={`/competitions/${comp.slug}`}>
                <Card className="h-full transition-colors hover:border-primary/50">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{comp.name}</CardTitle>
                      {isActive && <Badge variant="success">Active</Badge>}
                      {isUpcoming && <Badge variant="warning">Upcoming</Badge>}
                      {isEnded && <Badge variant="secondary">Ended</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    <p>Start: {formatInAEST(comp.startAt)}</p>
                    <p>End: {formatInAEST(comp.endAt)}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
