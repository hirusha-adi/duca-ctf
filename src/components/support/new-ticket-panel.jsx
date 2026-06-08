"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageComposer } from "@/components/support/message-composer";

export function NewTicketPanel({ onCancel, basePath = "/support" }) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  async function handleCreate(payload) {
    if (!subject.trim()) {
      setError("Subject is required");
      throw new Error("Subject is required");
    }

    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          ...payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create ticket");

      router.push(`${basePath}/${data.ticket.id}`);
      router.refresh();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-4 py-4 sm:px-6">
        <h2 className="text-lg font-semibold">New support ticket</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe your issue and our admins will respond here.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ticket-subject">Subject</Label>
            <Input
              id="ticket-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Can't submit flag on Web challenge"
              maxLength={200}
              disabled={creating}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>

      <MessageComposer
        onSend={handleCreate}
        disabled={creating || !subject.trim()}
        placeholder="Describe the problem, steps to reproduce, what you've tried…"
      />

      {onCancel && (
        <div className="border-t border-border px-4 py-3 sm:px-6">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={creating}>
            Cancel
          </Button>
        </div>
      )}

      {creating && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}
