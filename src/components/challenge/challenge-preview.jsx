import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContentRenderer } from "@/components/challenge/content-renderer";
import { CheckCircle2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChallengePreview({
  challenge,
  solved = false,
  ended = false,
  available = false,
}) {
  return (
    <Card className="w-full transition-colors hover:border-primary/50">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <CardTitle className="text-xl">
              <Link
                href={`/challenges/${challenge.id}`}
                className="hover:text-primary"
              >
                {challenge.title}
              </Link>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{challenge.category.name}</Badge>
              <Badge variant="outline">{challenge.points} pts</Badge>
              {solved && (
                <Badge variant="success" className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Solved
                </Badge>
              )}
              {!ended && available && !solved && <Badge variant="outline">Open</Badge>}
              {ended && <Badge variant="secondary">Ended</Badge>}
            </div>
          </div>
          {ended && challenge.writeup && (
            <Link
              href={`/writeups/${challenge.id}`}
              className="inline-flex shrink-0 items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <FileText className="h-4 w-4" />
              Read writeup
            </Link>
          )}
        </div>
      </CardHeader>
      {challenge.description && (
        <CardContent className={cn("border-t border-border pt-4")}>
          <ContentRenderer
            content={challenge.description}
            format={challenge.descriptionFormat}
          />
        </CardContent>
      )}
    </Card>
  );
}
