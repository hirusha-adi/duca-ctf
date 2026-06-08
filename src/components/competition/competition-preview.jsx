import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContentRenderer } from "@/components/challenge/content-renderer";
import { formatInAEST } from "@/lib/timezone";
import { cn } from "@/lib/utils";

export function CompetitionPreview({ competition }) {
  return (
    <Card className="w-full transition-colors hover:border-primary/50">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <CardTitle className="text-xl">
              <Link
                href={`/competitions/${competition.slug}`}
                className="hover:text-primary"
              >
                {competition.name}
              </Link>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">Active</Badge>
              <span className="text-sm text-muted-foreground">
                {formatInAEST(competition.startAt)} — {formatInAEST(competition.endAt)}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      {competition.description && (
        <CardContent className={cn("border-t border-border pt-4")}>
          <ContentRenderer
            content={competition.description}
            format={competition.descriptionFormat}
          />
        </CardContent>
      )}
    </Card>
  );
}
