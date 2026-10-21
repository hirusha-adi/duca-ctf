"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function HostingLogs({ instanceId, service }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("Connecting…");
  const [paused, setPaused] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const viewport = useRef(null);
  useEffect(() => {
    setText("");
    if (paused) { setStatus("Paused"); return; }
    let controller;
    let disposed = false;
    const open = () => {
      controller?.abort();
      if (document.visibilityState === "hidden") { setStatus("Paused while this tab is hidden"); return; }
      const request = new AbortController();
      controller = request;
      setStatus("Connecting…"); setText("");
      async function read() {
        try {
          const response = await fetch(`/api/admin/hosting/instances/${instanceId}/logs/${encodeURIComponent(service)}`, { cache: "no-store", signal: request.signal });
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || `Log request failed (${response.status})`);
          }
          if (!response.body) throw new Error("The runner did not return a log stream");
          if (disposed || request.signal.aborted) return;
          setStatus("Streaming");
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          while (!request.signal.aborted) {
            const { done, value } = await reader.read();
            if (disposed || request.signal.aborted) return;
            const chunk = decoder.decode(value || new Uint8Array(), { stream: !done });
            if (chunk) setText((previous) => `${previous}${chunk}`.slice(-200_000));
            if (done) break;
          }
          if (!disposed && !request.signal.aborted) setStatus("Stream ended. Reconnect to view new logs.");
        } catch (error) { if (!disposed && !request.signal.aborted) setStatus(error.message); }
      }
      read();
    };
    open();
    document.addEventListener("visibilitychange", open);
    return () => { disposed = true; controller?.abort(); document.removeEventListener("visibilitychange", open); };
  }, [instanceId, service, paused, attempt]);
  useEffect(() => { const element = viewport.current; if (element) element.scrollTop = element.scrollHeight; }, [text]);
  return <section className="space-y-3 rounded-md border border-border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-medium">Logs · {service}</h3><p role="status" className="text-xs text-muted-foreground">{status}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setPaused((value) => !value)}>{paused ? "Resume" : "Pause"}</Button><Button size="sm" variant="outline" onClick={() => setAttempt((value) => value + 1)}>Reconnect</Button></div></div>
    <pre ref={viewport} aria-label={`Logs for ${service}`} className="h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-zinc-950 p-3 font-mono text-xs text-zinc-100">{text || "Waiting for logs…"}</pre>
  </section>;
}
