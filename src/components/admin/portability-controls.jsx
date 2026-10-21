"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function downloadPrivateYaml(url, filename) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Export failed");
  }
  const blobUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

export async function readYamlFile(file) {
  if (!file) throw new Error("Choose a YAML file");
  if (file.size > 32 * 1024 * 1024) throw new Error("YAML files must be at most 32 MB");
  return file.text();
}

export function CompetitionPortabilityTools({ cloneSource, onCancel }) {
  const [name, setName] = useState(cloneSource ? `${cloneSource.name} (copy)` : "");
  const [startAt, setStartAt] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = { ...(name.trim() ? { name: name.trim() } : {}), ...(startAt ? { startAt } : {}) };
      if (!cloneSource) payload.yaml = await readYamlFile(file);
      const response = await fetch(cloneSource ? `/api/admin/competitions/${cloneSource.id}/clone` : "/api/admin/competitions/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create competition");
      window.location.reload();
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }

  return (
    <Card id="competition-portability">
      <CardHeader><CardTitle className="text-base">{cloneSource ? `Clone ${cloneSource.name}` : "Import competition"}</CardTitle></CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">Creates a hidden draft with fresh challenges, hints, prerequisites and writeups. Participant activity is excluded. Leave the new start blank to keep the original schedule; changing it keeps the same duration and release intervals.</p>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {!cloneSource && <div className="space-y-2 sm:col-span-2"><Label htmlFor="event-yaml">DUCA competition YAML</Label><Input id="event-yaml" type="file" accept=".yaml,.yml,application/yaml,text/yaml" onChange={(event) => setFile(event.target.files?.[0] || null)} required /></div>}
          <div className="space-y-2"><Label htmlFor="import-name">{cloneSource ? "New name" : "New name (optional)"}</Label><Input id="import-name" value={name} maxLength={200} onChange={(event) => setName(event.target.value)} required={!!cloneSource} /></div>
          <div className="space-y-2"><Label htmlFor="import-start">New start (AEST/AEDT, optional)</Label><Input id="import-start" type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} /></div>
          <p className="text-xs text-muted-foreground sm:col-span-2">Exports include secret flag answers and uploaded images. Store YAML files privately. External image links remain external.</p>
          {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2"><Button disabled={busy}>{busy ? "Creating…" : cloneSource ? "Create hidden clone" : "Import as hidden draft"}</Button>{cloneSource && <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancel clone</Button>}</div>
        </form>
      </CardContent>
    </Card>
  );
}
