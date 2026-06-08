"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { timeAgoInAEST } from "@/lib/timezone";
import { adminUserPath } from "@/lib/admin-user-paths";

function SolveUserName({ solve, isAdmin }) {
  const label = solve.user.name || solve.user.email;
  if (!isAdmin || !solve.user.email) {
    return <span className="font-medium">{label}</span>;
  }
  return (
    <Link
      href={adminUserPath(solve.user.email)}
      className="font-medium hover:text-primary hover:underline"
    >
      {label}
    </Link>
  );
}

function SolveChallengeTitle({ solve, isAdmin }) {
  if (!isAdmin) {
    return <span className="text-primary">{solve.challenge.title}</span>;
  }
  return (
    <Link
      href={`/challenges/${solve.challenge.id}`}
      className="text-primary hover:underline"
    >
      {solve.challenge.title}
    </Link>
  );
}

function SolveCompetitionName({ solve, isAdmin }) {
  const name = solve.challenge.competition.name;
  if (!isAdmin || !solve.challenge.competition.slug) {
    return <div>{name}</div>;
  }
  return (
    <Link
      href={`/competitions/${solve.challenge.competition.slug}`}
      className="hover:text-foreground hover:underline"
    >
      {name}
    </Link>
  );
}

export function LiveSolveFeed({ initialSolves, competitionId, isAdmin = false }) {
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
          <div className="flex flex-wrap items-center gap-3">
            <SolveUserName solve={solve} isAdmin={isAdmin} />
            <span className="text-muted-foreground">solved</span>
            <SolveChallengeTitle solve={solve} isAdmin={isAdmin} />
            {solve.pointsAwarded > 0 && (
              <Badge variant="success">+{solve.pointsAwarded}</Badge>
            )}
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <SolveCompetitionName solve={solve} isAdmin={isAdmin} />
            <div>{timeAgoInAEST(solve.solvedAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
