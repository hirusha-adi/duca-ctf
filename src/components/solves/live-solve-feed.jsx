"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { timeAgoInAEST } from "@/lib/timezone";
import { adminUserPath } from "@/lib/admin-user-paths";
import { useSolvesStream } from "@/hooks/use-solves-stream";

function unsolveKey(userId, challengeId) {
  return `${userId}:${challengeId}`;
}

async function unsolveChallenge(userId, challengeId) {
  const res = await fetch("/api/admin/solves/unsolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, challengeId }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to unsolve challenge");
  }
  return data;
}

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
  const [unsolvingKey, setUnsolvingKey] = useState(null);
  const [error, setError] = useState(null);

  const loadSolves = useCallback(async () => {
    const params = new URLSearchParams();
    if (competitionId) params.set("competitionId", competitionId);
    const query = params.toString();
    const res = await fetch(`/api/solves${query ? `?${query}` : ""}`);
    if (res.ok) {
      const data = await res.json();
      setSolves(data.solves);
    }
  }, [competitionId]);

  const handleSolve = useCallback((solve) => {
    setSolves((prev) => {
      if (prev.some((entry) => entry.id === solve.id)) return prev;
      return [solve, ...prev].slice(0, 50);
    });
  }, []);

  useSolvesStream({
    competitionId,
    onSolve: handleSolve,
    onRefresh: loadSolves,
    onReconnect: loadSolves,
  });

  async function handleUnsolve(solve) {
    const userLabel = solve.user.name || solve.user.email;
    const challengeLabel = solve.challenge.title;

    if (
      !confirm(
        `Mark "${challengeLabel}" as unsolved for ${userLabel}? This removes all flag solves and points for that challenge.`
      )
    ) {
      return;
    }

    const key = unsolveKey(solve.user.id, solve.challenge.id);
    setUnsolvingKey(key);
    setError(null);

    try {
      await unsolveChallenge(solve.user.id, solve.challenge.id);
      setSolves((prev) =>
        prev.filter(
          (entry) =>
            !(
              entry.user.id === solve.user.id &&
              entry.challenge.id === solve.challenge.id
            )
        )
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setUnsolvingKey(null);
    }
  }

  if (solves.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">No solves yet. Be the first!</p>
    );
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {solves.map((solve) => {
        const key = unsolveKey(solve.user.id, solve.challenge.id);
        const isUnsolving = unsolvingKey === key;

        return (
          <div
            key={solve.id}
            className="flex items-center justify-between gap-4 rounded-md border border-border bg-card px-4 py-3"
          >
            <div className="flex flex-wrap items-center gap-3">
              <SolveUserName solve={solve} isAdmin={isAdmin} />
              <span className="text-muted-foreground">solved</span>
              <SolveChallengeTitle solve={solve} isAdmin={isAdmin} />
              {solve.pointsAwarded > 0 && (
                <Badge variant="success">+{solve.pointsAwarded}</Badge>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={isUnsolving}
                  onClick={() => handleUnsolve(solve)}
                >
                  {isUnsolving ? "..." : "Unsolve"}
                </Button>
              )}
              <div className="text-right text-sm text-muted-foreground">
                <SolveCompetitionName solve={solve} isAdmin={isAdmin} />
                <div>{timeAgoInAEST(solve.solvedAt)}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
