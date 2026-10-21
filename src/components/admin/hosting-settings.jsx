"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hostingMutation, hostingRequest } from "@/components/admin/hosting-shared";

const defaults = { maxInstances: 500, memoryBudgetMb: 4096, cpuBudgetMillicores: 2000, publicHost: "", portRangeStart: 20000, portRangeEnd: 29999 };

export function HostingSettings() {
  const [form, setForm] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoaded(false); setError("");
    hostingRequest("/api/admin/hosting/settings", { signal: controller.signal }).then((data) => { setForm({ ...defaults, ...(data.settings || data) }); setLoaded(true); }).catch((error) => { if (error.name !== "AbortError") setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const payload = Object.fromEntries(Object.keys(defaults).map((key) => [key, key === "publicHost" ? form[key].trim() : Number(form[key])]));
      const data = await hostingMutation("/api/admin/hosting/settings", payload, "PATCH");
      setForm({ ...defaults, ...(data.settings || data) }); setMessage("Hosting settings saved.");
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  const numbers = [
    ["maxInstances", "Maximum active instances", 1, 10000, "Defaults to 500 across every player and challenge; configurable up to 10,000."],
    ["memoryBudgetMb", "Memory pool (MiB)", 64, 1048576, "Total memory reserved by running and pending instances."],
    ["cpuBudgetMillicores", "CPU pool (millicores)", 25, 1000000, "1,000 millicores equals one CPU core."],
    ["portRangeStart", "First published port", 20000, 29999, "Open the published port range in the host firewall."],
    ["portRangeEnd", "Last published port", 20000, 29999, "The range is shared by challenge services."],
  ];
  return <Card><CardHeader><CardTitle className="text-base">Hosting capacity and connection settings</CardTitle></CardHeader><CardContent>
    <p className="mb-4 text-sm text-muted-foreground">Instance starts reserve resources from this shared pool. Stopped instances retain their files until their original two-hour expiry.</p>
    {loading && <p role="status" className="mb-4 text-sm text-muted-foreground">Loading settings…</p>}
    <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="hosting-public-host">Public hostname or IP address</Label><Input id="hosting-public-host" value={form.publicHost || ""} onChange={(event) => setForm((previous) => ({ ...previous, publicHost: event.target.value }))} placeholder="ctf.example.edu" disabled={loading || busy || !loaded} required /><p className="text-xs text-muted-foreground">Players use this host to reach published services. Enter the host without a URL scheme or path.</p></div>
      {numbers.map(([key, label, min, max, help]) => <div key={key} className="space-y-2"><Label htmlFor={`hosting-${key}`}>{label}</Label><Input id={`hosting-${key}`} type="number" min={min} max={max} step={1} value={form[key] ?? ""} onChange={(event) => setForm((previous) => ({ ...previous, [key]: event.target.value }))} disabled={loading || busy || !loaded} required /><p className="text-xs text-muted-foreground">{help}</p></div>)}
      {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
      {message && <p role="status" className="text-sm text-primary sm:col-span-2">{message}</p>}
      <div className="flex gap-2 sm:col-span-2"><Button disabled={loading || busy || !loaded}>{busy ? "Saving…" : "Save settings"}</Button>{error && <Button type="button" variant="outline" onClick={() => setRevision((value) => value + 1)}>Reload settings</Button>}</div>
    </form>
  </CardContent></Card>;
}
