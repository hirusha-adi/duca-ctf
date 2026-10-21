import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { StringDecoder } from "node:string_decoder";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { DockerEngine, dockerLogDecoder } from "./docker.mjs";
import { InstanceWorker, TERMINAL_STATES } from "./worker.mjs";
import { findOwnedContainer, inspectOwnedContainer } from "./resources.mjs";
import { consumeTerminalToken, terminalTokenFromRequest, validTerminalResize } from "./terminal-auth.mjs";

function authorized(request, secret) {
  const provided = request.headers.authorization || "";
  const expected = `Bearer ${secret}`;
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes);
}

function reply(response, status, message) { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify({ error: message })); }

export async function streamInstanceLogs({ request, response, db, engine, instanceId, service }) {
  const instance = await db.hostedInstance.findUnique({ where: { id: instanceId } });
  if (!instance || TERMINAL_STATES.includes(instance.state) || new Date(instance.expiresAt).getTime() <= Date.now() || !instance.template?.services?.some((entry) => entry.name === service)) { reply(response, 404, "Instance service not found."); return; }
  const app = await findOwnedContainer(engine, instance, service, "app");
  if (!app) { reply(response, 404, "Service logs are not available yet."); return; }
  const container = await inspectOwnedContainer(engine, app.Id, { instanceId: instance.id, generation: instance.generation, kinds: ["app"] });
  const controller = new AbortController();
  response.once("close", () => controller.abort());
  const url = new URL(request.url, "http://localhost");
  const tail = Math.min(1000, Math.max(1, Number(url.searchParams.get("tail")) || 200));
  const logs = await engine.request("GET", `/containers/${encodeURIComponent(app.Id)}/logs?stdout=1&stderr=1&follow=1&timestamps=1&tail=${Math.floor(tail)}`, undefined, { stream: true, signal: controller.signal, timeout: 0 });
  response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
  response.flushHeaders();
  const decoder = dockerLogDecoder({ tty: container.Config?.Tty === true });
  decoder.output.pipe(response);
  const watchdog = setInterval(async () => {
    try {
      const current = await db.hostedInstance.findUnique({ where: { id: instanceId } });
      if (!current || current.generation !== instance.generation || TERMINAL_STATES.includes(current.state) || new Date(current.expiresAt).getTime() <= Date.now()) controller.abort();
    } catch { controller.abort(); }
  }, 2000);
  watchdog.unref();
  try { for await (const chunk of logs) { if (!decoder.write(chunk)) await once(decoder.output, "drain", { signal: controller.signal }); } }
  catch { /* A client disconnect or lifecycle transition ends a live log stream. */ }
  finally {
    clearInterval(watchdog);
    logs.destroy();
    if (controller.signal.aborted) { decoder.output.unpipe(response); decoder.output.destroy(); response.end(); }
    else decoder.end();
    controller.abort();
  }
}

async function bridgeTerminal({ ws, session, db, engine, shell }) {
  // Keep the client's initial resize/input buffered while Docker creates and
  // attaches the exec session.
  ws.pause();
  let stream;
  let validation;
  let keepalive;
  let validating = false;
  const cleanup = () => {
    ws.resume();
    clearInterval(validation); clearInterval(keepalive);
    if (stream && !stream.destroyed) { stream.write("\x04"); stream.end(); const timer = setTimeout(() => stream.destroy(), 1000); timer.unref(); }
  };
  ws.once("close", cleanup);
  ws.once("error", cleanup);
  try {
    const app = await findOwnedContainer(engine, session.instance, session.service, "app");
    if (!app) throw new Error("Service is unavailable");
    const container = await inspectOwnedContainer(engine, app.Id, { instanceId: session.instanceId, generation: session.generation, kinds: ["app"] });
    if (!container.State?.Running) throw new Error("Service is stopped");
    const execution = await engine.request("POST", `/containers/${encodeURIComponent(app.Id)}/exec`, { AttachStdin: true, AttachStdout: true, AttachStderr: true, Tty: true, Cmd: [shell], Env: ["TERM=xterm-256color"] });
    stream = await engine.attachExec(execution.Id);
    if (ws.readyState !== WebSocket.OPEN) { cleanup(); return; }
    await db.instanceEvent.create({ data: { instanceId: session.instanceId, generation: session.generation, actorId: session.userId, action: "TERMINAL_CONNECTED", message: "Administrator opened an interactive terminal.", metadata: { service: session.service, sessionId: session.id } } });
    const textDecoder = new StringDecoder("utf8");
    stream.on("data", (chunk) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const text = textDecoder.write(chunk);
      if (!text) return;
      if (ws.bufferedAmount > 1024 * 1024) stream.pause();
      ws.send(text, () => { if (ws.bufferedAmount < 256 * 1024) stream.resume(); });
    });
    stream.once("end", () => ws.close(1000, "Terminal exited"));
    stream.once("error", () => ws.close(1011, "Terminal disconnected"));
    ws.on("message", async (data, binary) => {
      if (!stream || stream.destroyed || ws.readyState !== WebSocket.OPEN) return;
      const text = data.toString("utf8");
      if (!binary && text.startsWith("{")) {
        let message;
        try { message = JSON.parse(text); } catch { /* Ordinary shell input can include JSON fragments. */ }
        if (message?.type === "resize") {
          if (!validTerminalResize(message)) { ws.close(1008, "Invalid terminal dimensions"); return; }
          try { await engine.request("POST", `/exec/${encodeURIComponent(execution.Id)}/resize?h=${message.rows}&w=${message.cols}`); } catch { ws.close(1011, "Could not resize terminal"); }
          return;
        }
      }
      if (!stream.write(data)) { ws._socket?.pause(); stream.once("drain", () => ws._socket?.resume()); }
    });
    ws.resume();
    validation = setInterval(async () => {
      if (validating) return;
      validating = true;
      try {
        const [user, instance] = await Promise.all([db.user.findUnique({ where: { id: session.userId }, select: { role: true, disabled: true } }), db.hostedInstance.findUnique({ where: { id: session.instanceId } })]);
        if (!user || user.role !== "ADMIN" || user.disabled || !instance || instance.generation !== session.generation || instance.state !== "RUNNING" || instance.desiredState !== "RUNNING" || new Date(instance.expiresAt).getTime() <= Date.now()) ws.close(1008, "Terminal session ended");
      } catch { ws.close(1011, "Could not validate terminal session"); }
      finally { validating = false; }
    }, 1000);
    let alive = true;
    ws.on("pong", () => { alive = true; });
    keepalive = setInterval(() => { if (!alive) { ws.terminate(); return; } alive = false; ws.ping(); }, 15000);
    validation.unref(); keepalive.unref();
  } catch {
    if (ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ type: "error", message: "Could not open the instance terminal. The image must include the selected shell." })); ws.close(1011, "Terminal unavailable"); }
    cleanup();
  }
}

export function createRunnerServer({ db, engine, secret = process.env.HOSTED_RUNNER_SECRET, appOrigin = process.env.APP_ORIGIN }) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("HOSTED_RUNNER_SECRET must contain at least 32 characters");
  const origin = new URL(appOrigin).origin;
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024, handleProtocols: (protocols) => protocols.has("duca-terminal") ? "duca-terminal" : false });
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (request.method === "GET" && url.pathname === "/health") {
        await Promise.all([db.$queryRaw`SELECT 1`, engine.request("GET", "/_ping", undefined, { timeout: 3000 })]);
        response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ healthy: true })); return;
      }
      if (!authorized(request, secret)) { reply(response, 401, "Unauthorized."); return; }
      const match = /^\/logs\/([A-Za-z0-9_-]{1,100})\/([a-zA-Z0-9_-]{1,64})$/.exec(url.pathname);
      if (request.method !== "GET" || !match) { reply(response, 404, "Not found."); return; }
      await streamInstanceLogs({ request, response, db, engine, instanceId: match[1], service: match[2] });
    } catch { if (!response.headersSent) reply(response, 503, "Runner service unavailable."); else response.end(); }
  });
  server.on("upgrade", async (request, socket, head) => {
    socket.on("error", () => {});
    const reject = () => { socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); socket.destroy(); };
    try {
      const url = new URL(request.url, origin);
      if (url.pathname !== "/instance-terminal" || request.headers.origin !== origin) { reject(); return; }
      const protocols = String(request.headers["sec-websocket-protocol"] || "").split(",").map((entry) => entry.trim());
      const token = terminalTokenFromRequest(url, protocols.join(","));
      if (!token || (protocols.length && protocols[0] && !protocols.includes("duca-terminal"))) { reject(); return; }
      const session = await consumeTerminalToken(db, token);
      if (!session) { reject(); return; }
      sockets.handleUpgrade(request, socket, head, (ws) => {
        const shell = url.searchParams.get("shell") === "bash" ? "/bin/bash" : "/bin/sh";
        void bridgeTerminal({ ws, session, db, engine, shell });
      });
    } catch { reject(); }
  });
  return { server, sockets };
}

export async function runRunner() {
  const require = createRequire(import.meta.url);
  const { createPrismaClient } = require("../prisma/create-client.js");
  const db = createPrismaClient();
  const engine = new DockerEngine();
  await engine.assertRootless();
  const controller = new AbortController();
  const { server, sockets } = createRunnerServer({ db, engine });
  const worker = new InstanceWorker({ db, engine, signal: controller.signal });
  const stop = () => { controller.abort(); for (const socket of sockets.clients) socket.close(1001, "Runner restarting"); server.close(); };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  server.listen(Number(process.env.HOSTED_RUNNER_PORT || 3110), "0.0.0.0");
  try { await worker.run(); }
  finally { stop(); await db.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runRunner().catch(() => { console.error("Hosted runner failed to start. Check its configuration, database, and rootless Docker engine."); process.exitCode = 1; });
