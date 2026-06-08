"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUPPORT_MESSAGE_COOLDOWN_MS } from "@/lib/support-constants";

export function MessageComposer({
  onSend,
  disabled = false,
  disabledMessage,
  placeholder = "Write a message…",
  showReferences = true,
  referencesCollapsible = false,
}) {
  const fileRef = useRef(null);
  const [body, setBody] = useState("");
  const [competitionId, setCompetitionId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [referencesExpanded, setReferencesExpanded] = useState(!referencesCollapsible);
  const [references, setReferences] = useState({ competitions: [] });
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldownMs, setCooldownMs] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (cooldownMs <= 0) return undefined;
    const timer = setTimeout(() => setCooldownMs(0), cooldownMs);
    return () => clearTimeout(timer);
  }, [cooldownMs]);

  useEffect(() => {
    setReferencesExpanded(!referencesCollapsible);
  }, [referencesCollapsible]);

  const shouldLoadReferences =
    showReferences && (!referencesCollapsible || referencesExpanded);

  useEffect(() => {
    if (!shouldLoadReferences) return;
    fetch("/api/support/references")
      .then((res) => res.json())
      .then((data) => setReferences(data))
      .catch(() => {});
  }, [shouldLoadReferences]);

  const selectedCompetition = references.competitions?.find((c) => c.id === competitionId);
  const challenges = selectedCompetition?.challenges ?? [];

  async function uploadFile(file) {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/support/upload", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data;
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      const uploaded = [];
      for (const file of files) {
        if (attachments.length + uploaded.length >= 5) break;
        uploaded.push(await uploadFile(file));
      }
      setAttachments((prev) => [...prev, ...uploaded].slice(0, 5));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (disabled || sending || uploading || cooldownMs > 0) return;
    if (!body.trim() && attachments.length === 0) return;

    setSending(true);
    setError(null);

    try {
      const payload = {
        body: body.trim(),
        competitionId: competitionId || null,
        challengeId: challengeId || null,
        attachments,
      };
      await onSend(payload);
      setBody("");
      setCompetitionId("");
      setChallengeId("");
      setAttachments([]);
      setCooldownMs(SUPPORT_MESSAGE_COOLDOWN_MS);
      if (referencesCollapsible && payload.challengeId) {
        setReferencesExpanded(false);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  const composerDisabled = disabled || sending || uploading || cooldownMs > 0;

  return (
    <form onSubmit={handleSubmit} className="border-t border-border bg-card p-4">
      {disabled && disabledMessage && (
        <p className="mb-3 text-sm text-muted-foreground">{disabledMessage}</p>
      )}

      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((file, index) => (
            <div
              key={`${file.url}-${index}`}
              className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-2 py-1 text-xs"
            >
              <span className="max-w-[160px] truncate">{file.name}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                disabled={composerDisabled}
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showReferences && (!referencesCollapsible || referencesExpanded) && (
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Reference competition</Label>
            <Select
              value={competitionId || "none"}
              onValueChange={(value) => {
                setCompetitionId(value === "none" ? "" : value);
                setChallengeId("");
              }}
              disabled={composerDisabled}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {references.competitions?.map((comp) => (
                  <SelectItem key={comp.id} value={comp.id}>
                    {comp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Reference challenge</Label>
            <Select
              value={challengeId || "none"}
              onValueChange={(value) => setChallengeId(value === "none" ? "" : value)}
              disabled={composerDisabled || !competitionId}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={competitionId ? "Optional" : "Select competition first"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {challenges.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    {ch.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {showReferences && referencesCollapsible && (
        <button
          type="button"
          className="mb-2 flex w-full items-center gap-3 py-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          disabled={composerDisabled}
          onClick={() => setReferencesExpanded((open) => !open)}
          aria-expanded={referencesExpanded}
          aria-label={
            referencesExpanded
              ? "Hide competition and challenge references"
              : "Show competition and challenge references"
          }
        >
          <span className="h-px flex-1 bg-border" />
          {referencesExpanded ? (
            <ChevronUp className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="h-px flex-1 bg-border" />
        </button>
      )}

      <div className="flex gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={placeholder}
          className="min-h-[80px] resize-none bg-background/60"
          disabled={composerDisabled}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        <div className="flex shrink-0 flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            multiple
            accept="image/*,.pdf,.txt,.zip"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            disabled={composerDisabled || attachments.length >= 5}
            onClick={() => fileRef.current?.click()}
            aria-label="Attach file"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </Button>
          <Button
            type="submit"
            size="icon"
            className="h-9 w-9"
            disabled={composerDisabled || (!body.trim() && attachments.length === 0)}
            aria-label="Send message"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {cooldownMs > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Wait {Math.ceil(cooldownMs / 1000)}s before sending again
        </p>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </form>
  );
}
