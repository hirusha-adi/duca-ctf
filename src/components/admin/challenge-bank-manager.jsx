"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContentRenderer } from "@/components/challenge/content-renderer";
import { downloadPrivateYaml, readYamlFile } from "@/components/admin/portability-controls";
import { replaceLocalAssetUrls } from "@/lib/portability-content.mjs";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

export function AdminChallengeBankManager({ entries, challenges, competitions }) {
  const [sourceId, setSourceId] = useState("");
  const [competitionId, setCompetitionId] = useState("");
  const [selected, setSelected] = useState([]);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function action(operation) {
    setBusy(true); setError(""); setMessage("");
    try { await operation(); } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  async function post(url, payload, method = "POST") {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  }
  async function previewEntry(id) {
    const response = await fetch(`/api/admin/challenge-bank/${id}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Preview failed");
    setPreview(data.entry);
  }
  function previewContent(challenge) {
    const images = new Map((preview.definition.assets || []).map((asset) => {
      const ext = asset.url.split(".").at(-1);
      return [asset.url, `data:image/${["jpg", "jpeg"].includes(ext) ? "jpeg" : ext};base64,${asset.data}`];
    }));
    return replaceLocalAssetUrls(challenge.description, (url) => images.get(url) || url);
  }

  return <div className="space-y-6">
    <p className="text-sm text-muted-foreground">Save reusable snapshots of authored challenges, including hints, writeups, images and every prerequisite. <Link className="text-primary underline" href="/admin/challenges">Author or edit a challenge</Link>, then save a new snapshot here.</p>
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="text-base">Save from a competition</CardTitle></CardHeader><CardContent>
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); action(async () => { await post("/api/admin/challenge-bank", { challengeId: sourceId }); window.location.reload(); }); }}>
          <Label htmlFor="bank-source">Challenge</Label><select id="bank-source" className={selectClass} required value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">Choose a challenge</option>{challenges.map((challenge) => <option key={challenge.id} value={challenge.id}>{challenge.competition.name} / {challenge.title}</option>)}</select>
          <Button disabled={busy || !sourceId}>Save snapshot</Button>
        </form>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Import a bank snapshot</CardTitle></CardHeader><CardContent>
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); action(async () => { await post("/api/admin/challenge-bank/import", { yaml: await readYamlFile(file) }); window.location.reload(); }); }}>
          <Label htmlFor="bank-yaml">DUCA challenge bank YAML</Label><Input id="bank-yaml" type="file" accept=".yaml,.yml" required onChange={(event) => setFile(event.target.files?.[0] || null)} />
          <Button disabled={busy || !file}>Import snapshot</Button>
        </form>
      </CardContent></Card>
    </div>
    <p className="text-xs text-muted-foreground">YAML exports contain secret flag answers and bundled uploaded images. Store exports privately. External image links remain external.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="text-sm text-primary">{message}</p>}
    <Card><CardHeader><CardTitle className="text-base">Saved challenges ({entries.length})</CardTitle></CardHeader><CardContent className="space-y-4">
      {!entries.length && <p className="text-sm text-muted-foreground">No snapshots yet. Save an existing challenge or import a bank YAML file.</p>}
      <div className="space-y-2">{entries.map((entry) => <div key={entry.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
        <input aria-label={`Select ${entry.title}`} type="checkbox" checked={selected.includes(entry.id)} onChange={(event) => setSelected((previous) => event.target.checked ? [...previous, entry.id] : previous.filter((id) => id !== entry.id))} />
        <div className="min-w-0 flex-1"><p className="font-medium">{entry.title}</p><p className="text-xs text-muted-foreground">{entry.categoryName} · {entry.challengeCount} challenge{entry.challengeCount === 1 ? "" : "s"} including prerequisites</p></div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => action(() => previewEntry(entry.id))}>Preview</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => action(() => downloadPrivateYaml(`/api/admin/challenge-bank/${entry.id}/export`, `duca-challenge-${entry.id}.yaml`))}>Export YAML</Button>
        <Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (confirm(`Delete the saved snapshot “${entry.title}”? Deployed challenges remain available.`)) action(async () => { await post(`/api/admin/challenge-bank/${entry.id}`, null, "DELETE"); window.location.reload(); }); }}>Delete</Button>
      </div>)}</div>
      <form className="flex flex-wrap items-end gap-3 border-t pt-4" onSubmit={(event) => { event.preventDefault(); action(async () => { const data = await post("/api/admin/challenge-bank/deploy", { entryIds: selected, competitionId }); setSelected([]); setMessage(`Created ${data.challenges.length} hidden challenges. Review their settings in Challenges before publishing.`); }); }}>
        <div className="min-w-48 flex-1 space-y-2"><Label htmlFor="bank-destination">Destination competition</Label><select id="bank-destination" className={selectClass} required value={competitionId} onChange={(event) => setCompetitionId(event.target.value)}><option value="">Choose a competition</option>{competitions.map((competition) => <option key={competition.id} value={competition.id}>{competition.name} ({competition.status})</option>)}</select></div>
        <Button disabled={busy || !selected.length || !competitionId}>{busy ? "Working…" : `Deploy selected (${selected.length})`}</Button>
      </form>
      <p className="text-xs text-muted-foreground">Deployments create fresh hidden challenges and include prerequisites. Release intervals are measured from the destination event start. Overlapping snapshots deploy their own prerequisite copies.</p>
    </CardContent></Card>
    {preview && <Card><CardHeader><div className="flex items-center justify-between"><CardTitle className="text-base">Preview: {preview.title}</CardTitle><Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Close</Button></div></CardHeader><CardContent className="space-y-6">{preview.definition.challenges.map((challenge) => <div key={challenge.key} className="space-y-3 border-t pt-4"><h2 className="font-semibold">{challenge.title}{challenge.key === preview.definition.rootKey ? "" : " (prerequisite)"}</h2><p className="text-xs text-muted-foreground">{challenge.category} · {challenge.points} points · {challenge.flags.length} flags · {challenge.hints.length} hints · release +{challenge.releaseOffsetSeconds} seconds · {challenge.writeup ? "writeup included" : "no writeup"}</p><ContentRenderer content={previewContent(challenge)} format={challenge.descriptionFormat} />{challenge.hints.length > 0 && <ul className="list-disc pl-5 text-sm">{challenge.hints.map((hint, index) => <li key={index}>{hint.title || `Hint ${index + 1}`} ({hint.cost} points)</li>)}</ul>}</div>)}</CardContent></Card>}
  </div>;
}
