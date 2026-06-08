"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function UnsolveChallengeForm({ users }) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [solvedChallenges, setSolvedChallenges] = useState([]);
  const [loadingSolves, setLoadingSolves] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) {
      setSolvedChallenges([]);
      setChallengeId("");
      return;
    }

    let cancelled = false;
    setLoadingSolves(true);
    setChallengeId("");
    setMessage(null);
    setError(null);

    fetch(`/api/admin/solves?userId=${userId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          setSolvedChallenges([]);
        } else {
          setSolvedChallenges(data.solvedChallenges || []);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load solved challenges");
      })
      .finally(() => {
        if (!cancelled) setLoadingSolves(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function handleUnsolve() {
    if (!userId || !challengeId) return;

    const challenge = solvedChallenges.find((c) => c.challengeId === challengeId);
    const user = users.find((u) => u.id === userId);
    const userLabel = user?.name || user?.email || "this user";
    const challengeLabel = challenge?.title || "this challenge";

    if (
      !confirm(
        `Mark "${challengeLabel}" as unsolved for ${userLabel}? This removes all flag solves and points for that challenge.`
      )
    ) {
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/admin/solves/unsolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, challengeId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to unsolve challenge");
        return;
      }

      setMessage(
        `Removed ${data.deletedCount} solve${data.deletedCount === 1 ? "" : "s"} (−${data.pointsRemoved ?? 0} pts). Reverted entry added to history.`
      );
      setSolvedChallenges((prev) => prev.filter((c) => c.challengeId !== challengeId));
      setChallengeId("");
      router.refresh();
    } catch {
      setError("Failed to unsolve challenge");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedChallenge = solvedChallenges.find((c) => c.challengeId === challengeId);

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="text-base">Mark challenge as unsolved</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Select a user and one of their solved challenges to remove all solves and reset their
          score for that challenge.
        </p>

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label>User</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name || user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Solved challenge</Label>
            <Select
              value={challengeId}
              onValueChange={setChallengeId}
              disabled={!userId || loadingSolves || solvedChallenges.length === 0}
            >
              <SelectTrigger className="w-[320px]">
                <SelectValue
                  placeholder={
                    !userId
                      ? "Select a user first"
                      : loadingSolves
                        ? "Loading..."
                        : solvedChallenges.length === 0
                          ? "No solves for this user"
                          : "Select challenge"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {solvedChallenges.map((ch) => (
                  <SelectItem key={ch.challengeId} value={ch.challengeId}>
                    {ch.title} · {ch.competitionName}
                    {ch.flagCount > 1 ? ` (${ch.flagCount} flags)` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="destructive"
            disabled={!userId || !challengeId || submitting}
            onClick={handleUnsolve}
          >
            {submitting ? "Removing..." : "Mark unsolved"}
          </Button>
        </div>

        {selectedChallenge && (
          <p className="text-sm text-muted-foreground">
            {selectedChallenge.categoryName} · {selectedChallenge.competitionName} ·{" "}
            {selectedChallenge.totalPoints} pts to remove
            {selectedChallenge.flagCount > 1
              ? ` · ${selectedChallenge.flagCount} flags`
              : ""}
          </p>
        )}

        {message && <p className="text-sm text-primary">{message}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
