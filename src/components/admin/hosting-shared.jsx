"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";

export async function hostingRequest(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export function hostingMutation(url, body, method = "POST") {
  return hostingRequest(url, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

export function useVisibleHostingPoll(url, enabled = true, intervalMs = 5000, fetcher = hostingRequest) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const controller = useRef(null);
  const sequence = useRef(0);
  const cancel = useCallback(() => {
    sequence.current += 1;
    const previous = controller.current;
    controller.current = null;
    previous?.abort();
  }, []);
  const refresh = useCallback(async (options) => {
    if (!url || !enabled || document.visibilityState === "hidden") return;
    if (controller.current && !options?.force) return;
    if (controller.current) cancel();
    const current = ++sequence.current;
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    try {
      const result = await fetcher(url, { signal: request.signal });
      if (current === sequence.current) { setData(result); setError(""); }
      return result;
    } catch (error) {
      if (error.name !== "AbortError" && current === sequence.current) setError(error.message);
    } finally {
      if (controller.current === request) controller.current = null;
      if (current === sequence.current) setLoading(false);
    }
  }, [url, enabled, cancel, fetcher]);
  useEffect(() => {
    setData(null);
    setError("");
    if (!enabled || !url) return;
    refresh();
    const timer = setInterval(refresh, intervalMs);
    const visible = () => { if (document.visibilityState === "visible") refresh(); else cancel(); };
    document.addEventListener("visibilitychange", visible);
    return () => { cancel(); clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [url, enabled, intervalMs, refresh, cancel]);
  return { data, error, loading, refresh };
}

export function HostingState({ state }) {
  const normalized = String(state || "UNKNOWN").toUpperCase();
  return <Badge variant={["RUNNING", "READY"].includes(normalized) ? "default" : ["FAILED", "ERROR"].includes(normalized) ? "destructive" : "secondary"}>{normalized.replaceAll("_", " ")}</Badge>;
}

export function HostingEndpoints({ endpoints = [] }) {
  if (!Array.isArray(endpoints) || !endpoints.length) return <p className="text-sm text-muted-foreground">Connection details appear when the instance is ready.</p>;
  return <ul className="space-y-2 text-sm">{endpoints.map((endpoint, index) => {
    const protocol = String(endpoint.scheme || endpoint.protocol || "tcp").toLowerCase();
    const host = endpoint.host || endpoint.hostname || "";
    const port = endpoint.port || endpoint.publicPort;
    const authority = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
    const url = typeof endpoint === "string" ? endpoint : endpoint.url || (["http", "https"].includes(protocol) && authority ? `${protocol}://${authority}${port ? `:${port}` : ""}` : null);
    let safeUrl = null;
    if (url) { try { const parsed = new URL(url); if (["http:", "https:"].includes(parsed.protocol)) safeUrl = parsed.href; } catch {} }
    const address = typeof endpoint === "string" ? endpoint : endpoint.address || `${authority}${port ? `:${port}` : ""}`;
    return <li key={`${endpoint.service || endpoint.name || index}-${url || address}`} className="break-all rounded-md border border-border bg-muted/20 px-3 py-2"><span className="mr-2 text-xs font-medium uppercase text-muted-foreground">{endpoint.service || endpoint.name || protocol}</span>{safeUrl ? <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">{safeUrl}</a> : <code>{protocol.toUpperCase()} {address || "Pending"}</code>}</li>;
  })}</ul>;
}

export function InstanceTimeRemaining({ expiresAt }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") setNow(Date.now()); };
    const timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, []);
  if (!expiresAt) return <span>Expiry pending</span>;
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(expires)) return <span>Expiry unavailable</span>;
  const seconds = Math.max(0, Math.ceil((expires - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return <span title={new Date(expiresAt).toLocaleString()}>{seconds ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")} remaining` : "Expired"}</span>;
}
