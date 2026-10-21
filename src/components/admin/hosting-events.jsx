"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HostingState, useVisibleHostingPoll } from "@/components/admin/hosting-shared";

export function HostingEvents() {
  const resource = useVisibleHostingPoll("/api/admin/hosting/events");
  const [filter, setFilter] = useState("");
  const events = resource.data?.events || [];
  const filtered = events.filter((event) => `${event.type || event.action || event.event || ""} ${event.instanceId || ""} ${event.message || ""} ${typeof event.metadata?.detail === "string" ? event.metadata.detail : ""} ${event.challenge?.title || event.instance?.challenge?.title || ""} ${event.user?.email || event.instance?.user?.email || ""}`.toLowerCase().includes(filter.toLowerCase()));
  return <div className="space-y-4">
    <div className="flex flex-wrap items-end gap-3"><div className="min-w-52 flex-1 space-y-2"><Label htmlFor="hosting-event-filter">Filter lifecycle events</Label><Input id="hosting-event-filter" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Player, challenge, instance or event" /></div><Button variant="outline" onClick={resource.refresh} disabled={resource.loading}>Refresh</Button></div>
    {resource.error && <p role="alert" className="text-sm text-destructive">{resource.error}</p>}
    {!resource.data && resource.loading && <p role="status" className="text-sm text-muted-foreground">Loading lifecycle events…</p>}
    {resource.data && !filtered.length && <p className="rounded-md border p-4 text-sm text-muted-foreground">{events.length ? "No events match this search." : "No lifecycle events recorded yet."}</p>}
    <ol className="space-y-2">{filtered.map((event, index) => <li key={event.id || index} className="space-y-2 rounded-md border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{String(event.type || event.action || event.event || "Event").replaceAll("_", " ")}</p><time className="text-xs text-muted-foreground" dateTime={event.createdAt || event.timestamp}>{event.createdAt || event.timestamp ? new Date(event.createdAt || event.timestamp).toLocaleString("en-AU", { timeZone: "Australia/Melbourne" }) : ""}</time></div><p className="break-all text-xs text-muted-foreground">{event.challenge?.title || event.instance?.challenge?.title || ""}{event.user?.email || event.instance?.user?.email ? ` · ${event.user?.email || event.instance?.user?.email}` : ""}{event.instanceId ? ` · ${event.instanceId}` : ""}</p>{event.message && <p className="whitespace-pre-wrap break-words text-sm">{event.message}</p>}{typeof event.metadata?.detail === "string" && event.metadata.detail && <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 font-mono text-xs">{event.metadata.detail}</pre>}{event.state && <HostingState state={event.state} />}</li>)}</ol>
  </div>;
}
