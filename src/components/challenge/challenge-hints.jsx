"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContentRenderer } from "./content-renderer";

export function ChallengeHints({ challengeId, hints: initialHints, canUnlock, preview = false }) {
  const router = useRouter();
  const [hints, setHints] = useState(initialHints);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { setHints(initialHints); }, [initialHints]);

  async function unlock(hint) {
    if (hint.cost > 0 && !window.confirm(`Unlock ${hint.title} for ${hint.cost} points? This cost is deducted from your competition score.`)) return;
    setPending(hint.id);
    setError("");
    try {
      const response = await fetch(`/api/challenges/${challengeId}/hints/${hint.id}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedCost: hint.cost }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.code === "HINT_PRICE_CHANGED") router.refresh();
        throw new Error(data.error || "Could not unlock hint.");
      }
      setHints((current) => current.map((entry) => entry.id === hint.id ? data.hint : entry));
      window.dispatchEvent(new Event("duca-points-update"));
      router.refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending(null);
    }
  }

  if (!hints.length) return null;
  return (
    <Card className="mb-6">
      <CardHeader><CardTitle className="text-base">Hints</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {preview && <p className="text-sm text-muted-foreground">Admin preview. Hints are shown without a purchase.</p>}
        {hints.map((hint) => (
          <div key={hint.id} className="space-y-2 rounded-md border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">{hint.title}</h3>
              <span className="text-sm text-muted-foreground">{hint.unlocked && !preview ? `Unlocked · ${hint.costPaid} points paid` : hint.cost ? `${hint.cost} points` : "Free"}</span>
            </div>
            {hint.unlocked ? <ContentRenderer content={hint.content} format={hint.contentFormat} /> : (
              <Button type="button" variant="outline" disabled={!canUnlock || !!pending} onClick={() => unlock(hint)}>
                {pending === hint.id ? "Unlocking…" : hint.cost ? `Unlock for ${hint.cost} points` : "Reveal hint"}
              </Button>
            )}
          </div>
        ))}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
