"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hostingMutation, useVisibleHostingPoll } from "@/components/admin/hosting-shared";

export function HostingRegistries() {
  const resource = useVisibleHostingPoll("/api/admin/hosting/registries", true, 30_000);
  const [form, setForm] = useState({ server: "", username: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const registries = resource.data?.registries || [];
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      await hostingMutation("/api/admin/hosting/registries", { server: form.server.trim(), username: form.username.trim(), password: form.password });
      setForm({ server: "", username: "", password: "" }); setMessage("Registry credentials saved. Passwords are never displayed."); await resource.refresh();
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  async function remove(registry) {
    if (!confirm(`Remove credentials for ${registry.server}? Future pulls of private images may fail.`)) return;
    setBusy(true); setError(""); setMessage("");
    try { await hostingMutation(`/api/admin/hosting/registries/${registry.id}`, undefined, "DELETE"); await resource.refresh(); setMessage("Registry credentials removed."); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <Card><CardHeader><CardTitle className="text-base">Private image registries</CardTitle></CardHeader><CardContent>
      <p className="mb-4 text-sm text-muted-foreground">Save credentials to pull private challenge images. Saving an existing registry updates its credentials.</p>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="registry-server">Registry server</Label><Input id="registry-server" value={form.server} onChange={(event) => setForm((previous) => ({ ...previous, server: event.target.value }))} placeholder="ghcr.io" autoComplete="off" required disabled={busy} /></div>
        <div className="space-y-2"><Label htmlFor="registry-username">Username</Label><Input id="registry-username" value={form.username} onChange={(event) => setForm((previous) => ({ ...previous, username: event.target.value }))} autoComplete="off" required disabled={busy} /></div>
        <div className="space-y-2"><Label htmlFor="registry-password">Password or access token</Label><Input id="registry-password" type="password" value={form.password} onChange={(event) => setForm((previous) => ({ ...previous, password: event.target.value }))} autoComplete="new-password" required disabled={busy} /></div>
        <div className="sm:col-span-2"><Button disabled={busy}>{busy ? "Saving…" : "Save registry credentials"}</Button></div>
      </form>
    </CardContent></Card>
    {(error || resource.error) && <p role="alert" className="text-sm text-destructive">{error || resource.error}</p>}
    {message && <p role="status" className="text-sm text-primary">{message}</p>}
    {resource.loading && !resource.data && <p role="status" className="text-sm text-muted-foreground">Loading registries…</p>}
    {resource.data && !registries.length && <p className="rounded-md border p-4 text-sm text-muted-foreground">No private registries saved. Public images can be used without credentials.</p>}
    <div className="space-y-2">{registries.map((registry) => <div key={registry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4"><div><p className="font-medium">{registry.server}</p><p className="text-sm text-muted-foreground">{registry.username || "Credentials saved"}</p></div><Button size="sm" variant="destructive" disabled={busy} onClick={() => remove(registry)}>Remove</Button></div>)}</div>
    {resource.error && <Button variant="outline" onClick={resource.refresh}>Retry loading</Button>}
  </div>;
}
