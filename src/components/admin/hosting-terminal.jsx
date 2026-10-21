"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { hostingMutation } from "@/components/admin/hosting-shared";
import "@xterm/xterm/css/xterm.css";

export function HostingTerminal({ instanceId, service, onClose }) {
  const container = useRef(null);
  const [state, setState] = useState("Connecting…");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    let terminal;
    let socket;
    let observer;
    let input;
    let resize;
    async function connect() {
      try {
        const [{ Terminal }, { FitAddon }, ticket] = await Promise.all([
          import("@xterm/xterm"), import("@xterm/addon-fit"),
          hostingMutation(`/api/admin/hosting/instances/${instanceId}/terminal`, { service }),
        ]);
        if (disposed) return;
        terminal = new Terminal({ cursorBlink: true, convertEol: true, fontSize: 13, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", scrollback: 5000, theme: { background: "#09090b", foreground: "#e4e4e7" } });
        const fit = new FitAddon();
        terminal.loadAddon(fit);
        terminal.open(container.current);
        fit.fit();
        const target = new URL(ticket.webSocketUrl || ticket.url || "/instance-terminal", window.location.href);
        if (!["http:", "https:", "ws:", "wss:"].includes(target.protocol) || target.host !== window.location.host) throw new Error("Terminal endpoint must use this server");
        target.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        if (typeof ticket.token !== "string" || !ticket.token || /[\s,]/.test(ticket.token)) throw new Error("The server did not return a valid terminal ticket");
        socket = new WebSocket(target.href, ["duca-terminal", ticket.token]);
        const sendResize = () => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows })); };
        input = terminal.onData((data) => { if (socket.readyState === WebSocket.OPEN) socket.send(data); });
        resize = terminal.onResize(sendResize);
        observer = new ResizeObserver(() => fit.fit());
        observer.observe(container.current);
        socket.onopen = () => { if (!disposed) { setState("Connected"); sendResize(); terminal.focus(); } };
        socket.onmessage = (event) => {
          if (disposed || typeof event.data !== "string") return;
          try { const message = JSON.parse(event.data); if (message?.type === "error" && typeof message.message === "string") { setError(message.message); return; } } catch {}
          terminal.write(event.data);
        };
        socket.onerror = () => { if (!disposed) setError("Terminal connection failed. Check that the instance and hosting runner are available."); };
        socket.onclose = () => { if (!disposed) setState("Disconnected"); };
      } catch (error) { if (!disposed) { setError(error.message); setState("Disconnected"); } }
    }
    setState("Connecting…"); setError("");
    connect();
    return () => { disposed = true; observer?.disconnect(); input?.dispose(); resize?.dispose(); socket?.close(); terminal?.dispose(); };
  }, [instanceId, service, attempt]);

  return <section className="space-y-3 rounded-md border border-border p-4" aria-label={`Terminal for ${service}`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-medium">Terminal · {service}</h3><p role="status" className="text-xs text-muted-foreground">{state}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setAttempt((value) => value + 1)}>Reconnect</Button><Button size="sm" variant="ghost" onClick={onClose}>Close terminal</Button></div></div>
    <p className="text-xs text-muted-foreground">Commands run inside this player&apos;s container. Changes affect their challenge instance.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div ref={container} className="h-80 w-full min-w-0 overflow-hidden rounded-md bg-zinc-950 p-2" />
  </section>;
}
