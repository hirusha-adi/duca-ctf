"use client";

import { useCallback, useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export function NavbarPoints({ className }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchPoints = useCallback(async () => {
    try {
      const res = await fetch("/api/user/points");
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch {
      // ignore transient errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPoints();

    const interval = setInterval(fetchPoints, 20000);
    const onFocus = () => fetchPoints();
    const onPointsUpdate = () => fetchPoints();

    window.addEventListener("focus", onFocus);
    window.addEventListener("duca-points-update", onPointsUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("duca-points-update", onPointsUpdate);
    };
  }, [fetchPoints]);

  if (loading && !summary) {
    return (
      <span
        className={cn(
          "inline-block h-4 w-12 animate-pulse rounded bg-muted",
          className ?? "hidden sm:inline-block"
        )}
      />
    );
  }

  if (!summary) return null;

  const displayPoints = summary.hasActiveCompetitions
    ? summary.activeTotal
    : summary.overallTotal;

  return (
    <div className={cn("group relative", className ?? "hidden sm:block")}>
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5",
          "text-sm font-medium text-primary transition-colors hover:bg-primary/15"
        )}
        aria-label="Your points"
      >
        <Trophy className="h-3.5 w-3.5" />
        {displayPoints} pts
      </button>

      <div
        className={cn(
          "invisible absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-border",
          "bg-popover p-3 text-popover-foreground opacity-0 shadow-lg transition",
          "group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
        )}
      >
        {summary.hasActiveCompetitions ? (
          <>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active competitions
            </p>
            <ul className="space-y-1.5">
              {summary.activeCompetitions.map((comp) => (
                <li
                  key={comp.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="truncate text-foreground">{comp.name}</span>
                  <span className="shrink-0 font-medium text-primary">
                    {comp.points} pts
                  </span>
                </li>
              ))}
            </ul>
            <div className="my-2 border-t border-border" />
          </>
        ) : (
          <p className="mb-2 text-xs text-muted-foreground">No active competitions</p>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">All time</span>
          <span className="font-semibold text-primary">{summary.overallTotal} pts</span>
        </div>
      </div>
    </div>
  );
}
