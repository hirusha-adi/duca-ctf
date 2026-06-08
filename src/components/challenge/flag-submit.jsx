"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FlagSubmit({ challengeId, disabled = false }) {
  const [flag, setFlag] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!flag.trim()) return;

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/challenges/${challengeId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flag }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        setMessage(data.message);
        setFlag("");
      } else {
        setMessage(data.error || "Incorrect flag");
      }
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (disabled) {
    return (
      <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
        This challenge is not yet available for submission.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="flag">Submit Flag</Label>
        <Input
          id="flag"
          value={flag}
          onChange={(e) => setFlag(e.target.value)}
          placeholder="DUCA{...}"
          className="font-mono"
          disabled={loading}
        />
      </div>
      <Button type="submit" disabled={loading || !flag.trim()}>
        {loading ? "Submitting..." : "Submit"}
      </Button>
      {message && (
        <p className={`text-sm ${success ? "text-primary" : "text-destructive"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
