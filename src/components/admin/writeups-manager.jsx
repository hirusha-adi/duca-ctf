"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WriteupEditor } from "@/components/editor/writeup-editor";
import { cn } from "@/lib/utils";

function getWriteupContent(writeup) {
  if (!writeup?.content) return "";
  if (writeup.contentFormat === "MARKDOWN") {
    return marked.parse(writeup.content);
  }
  return writeup.content;
}

export function AdminWriteupsManager({ competitions }) {
  const [competitionId, setCompetitionId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [content, setContent] = useState("");
  const [saveState, setSaveState] = useState("idle");
  const [error, setError] = useState(null);
  const saveTimerRef = useRef(null);
  const latestContentRef = useRef("");
  const skipSaveRef = useRef(false);

  const selectedCompetition = useMemo(
    () => competitions.find((c) => c.id === competitionId),
    [competitions, competitionId]
  );

  const challenges = selectedCompetition?.challenges || [];

  const selectedChallenge = useMemo(
    () => challenges.find((c) => c.id === challengeId),
    [challenges, challengeId]
  );

  const loadChallenge = useCallback((ch) => {
    skipSaveRef.current = true;
    if (!ch) {
      setContent("");
      latestContentRef.current = "";
      return;
    }
    const html = getWriteupContent(ch.writeup);
    setContent(html);
    latestContentRef.current = html;
    setSaveState(ch.writeup ? "saved" : "idle");
    setError(null);
  }, []);

  function handleCompetitionChange(id) {
    skipSaveRef.current = true;
    setCompetitionId(id);
    setChallengeId("");
    setContent("");
    latestContentRef.current = "";
    setSaveState("idle");
    setError(null);
  }

  function handleChallengeChange(id) {
    setChallengeId(id);
    const ch = challenges.find((c) => c.id === id);
    loadChallenge(ch);
  }

  const saveWriteup = useCallback(async (html) => {
    if (!challengeId) return;

    setSaveState("saving");
    setError(null);

    try {
      const res = await fetch(`/api/admin/writeups/${challengeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: html,
          contentFormat: "RICHTEXT",
          images: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveState("error");
        setError(data.error || "Save failed");
        return;
      }
      setSaveState("saved");
    } catch {
      setSaveState("error");
      setError("Save failed");
    }
  }, [challengeId]);

  useEffect(() => {
    latestContentRef.current = content;

    if (!challengeId) return;

    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      if (latestContentRef.current !== undefined) {
        saveWriteup(latestContentRef.current);
      }
    }, 1200);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [content, challengeId, saveWriteup]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>1. Competition</Label>
          <Select value={competitionId} onValueChange={handleCompetitionChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select a competition" />
            </SelectTrigger>
            <SelectContent>
              {competitions.map((comp) => (
                <SelectItem key={comp.id} value={comp.id}>
                  {comp.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>2. Challenge</Label>
          <Select
            value={challengeId}
            onValueChange={handleChallengeChange}
            disabled={!competitionId}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  competitionId ? "Select a challenge" : "Choose a competition first"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {challenges.map((ch) => (
                <SelectItem key={ch.id} value={ch.id}>
                  <span className="flex items-center gap-2">
                    {ch.title}
                    {ch.writeup && <span className="text-primary">•</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!competitionId && (
        <p className="text-sm text-muted-foreground">
          Pick a competition, then a challenge to start writing.
        </p>
      )}

      {competitionId && !challengeId && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {challenges.map((ch) => (
            <button
              key={ch.id}
              type="button"
              onClick={() => handleChallengeChange(ch.id)}
              className={cn(
                "rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-secondary/40"
              )}
            >
              <div className="font-medium">{ch.title}</div>
              <div className="mt-2 flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {ch.category.name}
                </Badge>
                {ch.writeup && <Badge variant="success" className="text-xs">Draft</Badge>}
              </div>
            </button>
          ))}
          {challenges.length === 0 && (
            <p className="text-sm text-muted-foreground">No challenges in this competition.</p>
          )}
        </div>
      )}

      {selectedChallenge && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <h2 className="text-xl font-semibold">{selectedChallenge.title}</h2>
              <p className="text-sm text-muted-foreground">
                {selectedCompetition.name} · {selectedChallenge.category.name}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {saveState === "saving" && (
                <span className="text-xs text-muted-foreground">Saving…</span>
              )}
              {saveState === "saved" && (
                <span className="text-xs text-primary">Saved</span>
              )}
              {saveState === "error" && (
                <span className="text-xs text-destructive">{error || "Save failed"}</span>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => saveWriteup(content)}
              >
                Save now
              </Button>
            </div>
          </div>

          <WriteupEditor key={challengeId} content={content} onChange={setContent} />
        </div>
      )}
    </div>
  );
}
