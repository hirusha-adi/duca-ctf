"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { timeAgoInAEST } from "@/lib/timezone";

export function LiveSolveFeed({ initialSolves, competitionId }) {
  const [solves, setSolves] = useState(initialSolves);

  useEffect(() => {
    const interval = setInterval(async () => {
      const params = competitionId ? `?competitionId=${competitionId}` : "";
      const res = await fetch(`/api/solves${params}`);
      if (res.ok) {
        const data = await res.json();
        setSolves(data.solves);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [competitionId]);

  if (solves.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">No solves yet. Be the first!</p>
    );
  }

  return (
    <div className="space-y-2">
      {solves.map((solve) => (
        <div
          key={solve.id}
          className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <span className="font-medium">{solve.user.name || solve.user.email}</span>
            <span className="text-muted-foreground">solved</span>
            <span className="text-primary">{solve.challenge.title}</span>
            {solve.pointsAwarded > 0 && (
              <Badge variant="success">+{solve.pointsAwarded}</Badge>
            )}
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <div>{solve.challenge.competition.name}</div>
            <div>{timeAgoInAEST(solve.solvedAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
