"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hostingMutation, hostingRequest } from "@/components/admin/hosting-shared";
import { stringify } from "yaml";

const initialForm = { hosted: false, hostingEnabled: false, hostingInternetEnabled: false, composeYaml: "" };
const composeExample = `services:\n  web:\n    image: ghcr.io/your-club/challenge:latest\n    ports:\n      - target: 8080\n        protocol: tcp\n        app_protocol: http\n    mem_limit: 128m\n    cpus: 0.25\n`;

function templateToYaml(template) {
  if (!template?.services?.length) return "";
  const services = Object.fromEntries(template.services.map((service) => [service.name, {
    image: service.image, ...(service.command ? { command: service.command } : {}), ...(service.entrypoint ? { entrypoint: service.entrypoint } : {}),
    ...(Object.keys(service.environment || {}).length ? { environment: service.environment } : {}),
    ...(service.ports?.length ? { ports: service.ports.map((port) => ({ target: port.target, protocol: port.protocol, app_protocol: port.scheme, ...(port.label ? { name: port.label } : {}) })) } : {}),
    mem_limit: `${service.memoryMb}m`, cpus: service.cpuMillicores / 1000, pids_limit: service.pidsLimit,
    ...(service.mounts?.length ? { volumes: service.mounts.map((mount) => `${mount.type === "config" ? "./" : ""}${mount.source}:${mount.target}:${mount.readOnly ? "ro" : "rw"}`) } : {}),
    ...(service.dependsOn?.length ? { depends_on: service.dependsOn } : {}),
    ...(service.user !== undefined ? { user: service.user } : {}), ...(service.workingDir ? { working_dir: service.workingDir } : {}), read_only: !!service.readOnly,
    ...(service.healthcheck ? { healthcheck: { test: service.healthcheck.Test, interval: `${service.healthcheck.Interval / 1e6}ms`, timeout: `${service.healthcheck.Timeout / 1e6}ms`, ...(service.healthcheck.StartPeriod ? { start_period: `${service.healthcheck.StartPeriod / 1e6}ms` } : {}), retries: service.healthcheck.Retries } } : {}),
  }]));
  return stringify({ services, ...(template.volumes?.length ? { volumes: Object.fromEntries(template.volumes.map((name) => [name, {}])) } : {}) }, { lineWidth: 100 });
}

export function HostingConfig({ challenges }) {
  const [challengeId, setChallengeId] = useState(challenges[0]?.id || "");
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [bundle, setBundle] = useState(null);
  const [config, setConfig] = useState(null);
  const [savedYaml, setSavedYaml] = useState("");
  const [revision, setRevision] = useState(0);
  const apply = useCallback((data) => {
    const value = data.hosting || data.configuration || data;
    setConfig(value);
    const composeYaml = value.composeYaml || value.sourceYaml || templateToYaml(value.template);
    setSavedYaml(composeYaml);
    setForm({ hosted: !!value.hosted, hostingEnabled: !!value.hostingEnabled, hostingInternetEnabled: !!value.hostingInternetEnabled, composeYaml });
  }, []);
  useEffect(() => {
    if (!challengeId) return;
    const controller = new AbortController();
    setLoading(true); setError(""); setMessage(""); setConfig(null); setForm(initialForm); setBundle(null);
    hostingRequest(`/api/admin/hosting/challenges/${challengeId}`, { signal: controller.signal }).then(apply).catch((error) => { if (error.name !== "AbortError") setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [challengeId, apply, revision]);

  async function save(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const { composeYaml, ...toggles } = form;
      const payload = { ...toggles, ...(composeYaml.trim() && (composeYaml !== savedYaml || !config.template) ? { composeYaml } : {}) };
      const data = await hostingMutation(`/api/admin/hosting/challenges/${challengeId}`, payload, "PATCH");
      apply(data);
      setMessage("Hosting configuration saved. Existing instances keep their current expiry.");
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  async function upload(event) {
    event.preventDefault();
    if (!bundle) return;
    if (bundle.size > 10 * 1024 * 1024) { setError("Compose bundles must be at most 10 MiB"); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const body = new FormData(); body.append("file", bundle);
      await hostingRequest(`/api/admin/hosting/challenges/${challengeId}/bundle`, { method: "POST", body });
      const data = await hostingRequest(`/api/admin/hosting/challenges/${challengeId}`);
      apply(data); setBundle(null); setMessage("Bundle uploaded. Review the configuration before enabling new instances.");
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    {!challenges.length ? <p className="rounded-md border p-4 text-sm text-muted-foreground">Create a regular challenge first, then choose it here to configure hosting.</p> : <>
      <div className="space-y-2"><Label htmlFor="hosted-challenge">Challenge</Label><select id="hosted-challenge" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={challengeId} onChange={(event) => setChallengeId(event.target.value)} disabled={busy}>{challenges.map((challenge) => <option key={challenge.id} value={challenge.id}>{challenge.competition.name} / {challenge.title}</option>)}</select></div>
      {loading && <p role="status" className="text-sm text-muted-foreground">Loading challenge configuration…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="text-sm text-primary">{message}</p>}
      {!loading && !config && <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Retry loading</Button>}
      <Card><CardHeader><CardTitle className="text-base">Challenge hosting</CardTitle></CardHeader><CardContent>
        <form className="space-y-5" onSubmit={save}>
          <div className="flex items-start gap-3"><Switch id="challenge-hosted" checked={form.hosted} onCheckedChange={(hosted) => setForm((value) => ({ ...value, hosted }))} disabled={loading || busy || !config} /><div><Label htmlFor="challenge-hosted">Hosted challenge</Label><p className="mt-1 text-xs text-muted-foreground">Shows personal instance controls to players on this challenge.</p></div></div>
          <div className="flex items-start gap-3"><Switch id="challenge-hosting-enabled" checked={form.hostingEnabled} onCheckedChange={(hostingEnabled) => setForm((value) => ({ ...value, hostingEnabled }))} disabled={loading || busy || !config} /><div><Label htmlFor="challenge-hosting-enabled">Allow new starts, resumes and recreations</Label><p className="mt-1 text-xs text-muted-foreground">When disabled, existing instances continue until their expiry.</p></div></div>
          <div className="flex items-start gap-3"><Switch id="challenge-internet" checked={form.hostingInternetEnabled} onCheckedChange={(hostingInternetEnabled) => setForm((value) => ({ ...value, hostingInternetEnabled }))} disabled={loading || busy || !config} /><div><Label htmlFor="challenge-internet">Allow internet access from instances</Label><p className="mt-1 text-xs text-muted-foreground">Enable only when this challenge needs outbound connections.</p></div></div>
          <div className="space-y-2"><Label htmlFor="challenge-compose">Compose YAML</Label><Textarea id="challenge-compose" value={form.composeYaml} onChange={(event) => setForm((value) => ({ ...value, composeYaml: event.target.value }))} placeholder={composeExample} rows={16} className="font-mono text-xs" disabled={loading || busy || !config} spellCheck={false} /><p className="text-xs text-muted-foreground">Use prebuilt images from public registries or a saved private registry. Define each service&apos;s memory, CPU and exposed ports. HTTP/HTTPS ports become links; TCP/UDP ports show connection details. Uploaded bundles may include Compose and configuration files.</p></div>
          {config?.template && <p className="text-xs text-muted-foreground">Template available{config.hostingVersion ? ` · revision ${config.hostingVersion}` : ""}{config.template.services ? ` · ${Array.isArray(config.template.services) ? config.template.services.length : Object.keys(config.template.services).length} services` : ""}{Object.keys(config.template.files || {}).length ? ` · ${Object.keys(config.template.files).length} bundled files retained` : ""}</p>}
          <Button disabled={loading || busy || !config}>{busy ? "Saving…" : "Save hosting configuration"}</Button>
        </form>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Upload Compose bundle</CardTitle></CardHeader><CardContent>
        <form className="space-y-3" onSubmit={upload}><Label htmlFor="compose-bundle">ZIP file with compose.yaml and optional configuration files (maximum 10 MiB)</Label><Input key={challengeId} id="compose-bundle" type="file" accept=".zip,application/zip" onChange={(event) => setBundle(event.target.files?.[0] || null)} disabled={loading || busy || !config} required /><p className="text-xs text-muted-foreground">Use images that are already built. Build contexts and Dockerfiles are not executed. Uploading replaces the saved template for future instances.</p><Button variant="outline" disabled={loading || busy || !config || !bundle}>{busy ? "Uploading…" : "Upload bundle"}</Button></form>
      </CardContent></Card>
    </>}
  </div>;
}
