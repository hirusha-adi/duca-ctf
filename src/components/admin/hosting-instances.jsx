"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HostingEndpoints, HostingState, InstanceTimeRemaining, hostingMutation, hostingRequest, useVisibleHostingPoll } from "@/components/admin/hosting-shared";
import { HostingLogs } from "@/components/admin/hosting-logs";
import { HostingTerminal } from "@/components/admin/hosting-terminal";

const PENDING = new Set(["QUEUED", "PENDING", "STARTING", "PROVISIONING", "STOPPING", "RECREATING", "RESTARTING", "DELETING", "EXPIRING"]);

function serviceNames(instance) {
  const services = instance.services || instance.template?.services || instance.containers || [];
  const names = Array.isArray(services) ? services.map((service) => typeof service === "string" ? service : service.service || service.name).filter(Boolean) : Object.keys(services);
  return [...new Set([...names, ...(instance.endpoints || []).map((endpoint) => endpoint.service).filter(Boolean)])];
}

async function loadInventory(url, options) {
  const first = await hostingRequest(url, options);
  const instances = new Map((first.instances || []).map((instance) => [instance.id, instance]));
  const cursors = new Set();
  let cursor = first.nextCursor;
  // Fetch every active-instance API page up to the configurable 10,000 ceiling
  // so inventory search and client pagination cover the whole current pool.
  while (cursor && !cursors.has(cursor) && cursors.size < 100) {
    cursors.add(cursor);
    const target = new URL(url, window.location.href);
    target.searchParams.set("cursor", cursor);
    const next = await hostingRequest(target.href, options);
    for (const instance of next.instances || []) instances.set(instance.id, instance);
    cursor = next.nextCursor;
  }
  return { ...first, instances: [...instances.values()] };
}

export function HostingInstances() {
  const resource = useVisibleHostingPoll("/api/admin/hosting/instances?limit=100", true, 5000, loadInventory);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [service, setService] = useState("");
  const [terminal, setTerminal] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const instances = useMemo(() => resource.data?.instances || [], [resource.data]);
  const selected = instances.find((instance) => instance.id === selectedId);
  const services = selected ? serviceNames(selected) : [];
  const selectedService = services.includes(service) ? service : services[0] || "";
  const rows = instances.filter((instance) => `${instance.user?.name || ""} ${instance.user?.email || ""} ${instance.challenge?.title || ""} ${instance.id} ${instance.state || instance.status}`.toLowerCase().includes(filter.toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(rows.length / 25));
  const currentPage = Math.min(page, pageCount - 1);
  const usage = resource.data?.usage || resource.data?.capacity || {};
  const settings = resource.data?.settings || {};

  async function operate(instance, action) {
    if (["recreate", "delete"].includes(action) && !confirm(action === "recreate" ? "Recreate this player's instance? All current files and databases will be permanently deleted. A fresh instance gets a new two-hour lifetime." : "Delete this player's instance and all its files and databases?")) return;
    setBusy(instance.id); setError(""); setMessage("");
    try { await hostingMutation(`/api/admin/hosting/instances/${instance.id}`, { action: action === "delete" ? "destroy" : action }); await resource.refresh({ force: true }); setMessage(`Instance ${action} requested.`); if (["recreate", "delete", "stop"].includes(action) && selectedId === instance.id) { setTerminal(false); setShowLogs(false); } }
    catch (error) { setError(error.message); }
    finally { setBusy(null); }
  }
  function inspect(instance) { setSelectedId(instance.id); setService(serviceNames(instance)[0] || ""); setTerminal(false); setShowLogs(false); }

  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Active instances</p><p className="mt-1 text-2xl font-semibold">{usage.activeInstances ?? usage.instances ?? instances.filter((instance) => !["EXPIRED", "DELETED", "FAILED"].includes(String(instance.state || instance.status).toUpperCase())).length}<span className="text-sm font-normal text-muted-foreground"> / {settings.maxInstances || 500}</span></p></CardContent></Card>
      <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Reserved memory</p><p className="mt-1 text-2xl font-semibold">{usage.memoryMb ?? usage.memoryUsedMb ?? "—"}<span className="text-sm font-normal text-muted-foreground"> / {settings.memoryBudgetMb || 4096} MiB</span></p></CardContent></Card>
      <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Reserved CPU</p><p className="mt-1 text-2xl font-semibold">{usage.cpuMillicores ?? usage.cpuUsedMillicores ?? "—"}<span className="text-sm font-normal text-muted-foreground"> / {settings.cpuBudgetMillicores || 2000} millicores</span></p></CardContent></Card>
    </div>
    <div className="flex flex-wrap items-end gap-3"><div className="min-w-52 flex-1 space-y-2"><Label htmlFor="hosting-instance-filter">Find by player, challenge, state or instance ID</Label><Input id="hosting-instance-filter" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(0); }} placeholder="Search instances" /></div><Button variant="outline" onClick={resource.refresh} disabled={resource.loading}>{resource.loading ? "Refreshing…" : "Refresh"}</Button></div>
    {(error || resource.error) && <p role="alert" className="text-sm text-destructive">{error || resource.error}</p>}
    {message && <p role="status" className="text-sm text-primary">{message}</p>}
    {!resource.data && resource.loading && <p role="status" className="text-sm text-muted-foreground">Loading instance inventory…</p>}
    {resource.data && !rows.length && <p className="rounded-md border p-4 text-sm text-muted-foreground">{instances.length ? "No instances match this search." : "No player instances yet. Configure a hosted challenge and enable starts to get started."}</p>}
    <div className="space-y-3">{rows.slice(currentPage * 25, (currentPage + 1) * 25).map((instance) => {
      const state = String(instance.state || instance.status || "UNKNOWN").toUpperCase();
      const running = ["RUNNING", "READY"].includes(state);
      const pending = PENDING.has(state);
      const names = serviceNames(instance);
      return <Card key={instance.id}><CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium">{instance.challenge?.title || instance.challengeId}</p><p className="break-all text-sm text-muted-foreground">{instance.user?.name || instance.user?.email || instance.userId}{instance.user?.name && instance.user?.email ? ` · ${instance.user.email}` : ""}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{instance.id} · generation {instance.generation ?? 1}</p></div><HostingState state={state} /></div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{instance.containerCount ?? instance.containers?.length ?? names.length} containers</span><span>{instance.memoryMb ?? instance.reservedMemoryMb ?? instance.resources?.memoryMb ?? "—"} MiB</span><span>{instance.cpuMillicores ?? instance.reservedCpuMillicores ?? instance.resources?.cpuMillicores ?? "—"} millicores</span><span><InstanceTimeRemaining expiresAt={instance.expiresAt} /></span></div>
        {(instance.lastError || instance.error) && <p className="text-sm text-destructive">{instance.lastError || instance.error}</p>}
        {running && <HostingEndpoints endpoints={instance.endpoints || []} />}
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => inspect(instance)}>Inspect</Button>{!running && !pending && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => operate(instance, "start")}>{state === "STOPPED" ? "Resume" : "Start"}</Button>}{running && <Button size="sm" variant="outline" disabled={!!busy || pending} onClick={() => operate(instance, "stop")}>Stop</Button>}<Button size="sm" variant="outline" disabled={!!busy || pending} onClick={() => operate(instance, "recreate")}>Recreate</Button><Button size="sm" variant="destructive" disabled={!!busy || pending} onClick={() => operate(instance, "delete")}>Delete</Button>{busy === instance.id && <span role="status" className="self-center text-xs text-muted-foreground">Requesting…</span>}</div>
      </CardContent></Card>;
    })}</div>
    {rows.length > 25 && <div className="flex items-center justify-between gap-3 text-sm"><Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button><span>Page {currentPage + 1} of {pageCount} · {rows.length} instances</span><Button variant="outline" size="sm" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button></div>}
    {selected && <Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="text-base">Inspect {selected.challenge?.title || "instance"}</CardTitle><Button size="sm" variant="ghost" onClick={() => { setSelectedId(null); setTerminal(false); setShowLogs(false); }}>Close inspection</Button></div></CardHeader><CardContent className="space-y-4">
      <HostingEndpoints endpoints={selected.endpoints || []} />
      {services.length ? <><div className="flex flex-wrap items-end gap-3"><div className="min-w-44 flex-1 space-y-2"><Label htmlFor="hosting-service">Container service</Label><select id="hosting-service" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedService} onChange={(event) => { setService(event.target.value); setTerminal(false); }}>{services.map((name) => <option key={name} value={name}>{name}</option>)}</select></div><Button variant="outline" onClick={() => setShowLogs((value) => !value)}>{showLogs ? "Hide logs" : "Stream logs"}</Button><Button disabled={!["RUNNING", "READY"].includes(String(selected.state || selected.status).toUpperCase())} onClick={() => setTerminal(true)}>Open terminal</Button></div>{showLogs && <HostingLogs key={`${selected.id}-${selectedService}`} instanceId={selected.id} service={selectedService} />}{terminal && <HostingTerminal key={`${selected.id}-${selectedService}`} instanceId={selected.id} service={selectedService} onClose={() => setTerminal(false)} />}</> : <p className="text-sm text-muted-foreground">Container details appear after the runner has created this instance.</p>}
    </CardContent></Card>}
  </div>;
}
