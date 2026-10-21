"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HostingEndpoints, HostingState, InstanceTimeRemaining, hostingMutation, useVisibleHostingPoll } from "@/components/admin/hosting-shared";

const PENDING = new Set(["QUEUED", "PENDING", "STARTING", "PROVISIONING", "STOPPING", "RECREATING", "RESTARTING", "DELETING", "EXPIRING"]);

export function HostedInstance({ challengeId, canStart = true }) {
  const resource = useVisibleHostingPoll(`/api/challenges/${challengeId}/instance`);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const instance = resource.data?.instance;
  const state = String(instance?.state || instance?.status || "").toUpperCase();
  const pending = PENDING.has(state);
  const running = ["RUNNING", "READY"].includes(state);
  const failed = ["FAILED", "ERROR"].includes(state);
  const terminal = ["EXPIRED", "DELETED"].includes(state);
  const stopped = ["STOPPED", "PAUSED"].includes(state);
  const expired = ["EXPIRED", "DELETED"].includes(state) || (instance?.expiresAt && Date.parse(instance.expiresAt) <= Date.now());
  const enabled = canStart && resource.data?.hostingEnabled !== false && resource.data?.canStart !== false;

  async function operate(action) {
    if (action === "recreate" && !confirm("Recreate this instance? All files and databases in the current instance will be permanently deleted. The new instance gets a fresh two-hour lifetime.")) return;
    setBusy(action); setError("");
    try { await hostingMutation(`/api/challenges/${challengeId}/instance`, { action }); await resource.refresh({ force: true }); }
    catch (error) { setError(error.message); }
    finally { setBusy(""); }
  }

  return <Card className="mb-6">
    <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">Your challenge instance</CardTitle>{instance && <HostingState state={state} />}</div></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Your instance belongs to you and lasts two hours. Stopping it keeps its files and databases until its original expiry. Recreating starts fresh and resets the lifetime.</p>
      {!resource.data && !resource.error && <p role="status" className="text-sm text-muted-foreground">Loading your instance…</p>}
      {(error || resource.error) && <p role="alert" className="text-sm text-destructive">{error || resource.error}</p>}
      {!enabled && resource.data && <p className="rounded-md border p-3 text-sm text-muted-foreground">{resource.data.disabledReason || "New starts, resumes and recreations are currently unavailable."} Existing instances keep their expiry time.</p>}
      {instance && !expired && <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm"><span className="font-medium"><InstanceTimeRemaining expiresAt={instance.expiresAt} /></span>{(instance.lastError || instance.error) && <span className="text-destructive">{instance.lastError || instance.error}</span>}</div>}
      {running && <HostingEndpoints endpoints={instance.endpoints || []} />}
      {pending && <p role="status" className="text-sm text-muted-foreground">Your instance is {state.toLowerCase().replaceAll("_", " ")}… This page updates automatically.</p>}
      {stopped && !expired && <p className="text-sm text-muted-foreground">Your instance is stopped. Resume it before expiry to continue with the same files.</p>}
      {expired && <p className="text-sm text-muted-foreground">This instance has expired. Recreate it for a fresh two-hour instance, or wait for cleanup before starting again.</p>}
      <div className="flex flex-wrap gap-2">
        {resource.data && (!instance || terminal || (failed && !expired)) && <Button disabled={!!busy || pending || !enabled} onClick={() => operate("start")}>{busy === "start" ? "Starting…" : "Start instance"}</Button>}
        {stopped && !expired && <Button disabled={!!busy || pending || !enabled} onClick={() => operate("start")}>{busy === "start" ? "Resuming…" : "Resume instance"}</Button>}
        {(running || failed) && !terminal && !pending && <Button variant="outline" disabled={!!busy} onClick={() => operate("stop")}>{busy === "stop" ? "Stopping…" : "Stop instance"}</Button>}
        {instance && !pending && <Button variant="outline" disabled={!!busy || !enabled} onClick={() => operate("recreate")}>{busy === "recreate" ? "Recreating…" : "Recreate instance"}</Button>}
        {resource.error && <Button variant="outline" disabled={resource.loading} onClick={resource.refresh}>Retry</Button>}
      </div>
    </CardContent>
  </Card>;
}
