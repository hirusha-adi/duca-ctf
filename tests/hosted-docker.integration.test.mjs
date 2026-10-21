import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import dgram from "node:dgram";
import { WebSocket } from "ws";
import { createRunnerServer } from "../runner/server.mjs";
import { createTerminalToken } from "../src/lib/hosting/secrets.mjs";
import { DockerEngine } from "../runner/docker.mjs";
import { InstanceWorker } from "../runner/worker.mjs";
import { removeGeneration } from "../runner/resources.mjs";
import { resourceLabels } from "../runner/resources.mjs";
import { buildGuardContainerConfig } from "../runner/network-policy.mjs";
import { expireManagedResources } from "../runner/watchdog.mjs";
import { normalizeHostingTemplate } from "../src/lib/hosting/template.mjs";

const require = createRequire(import.meta.url);
const databaseUrl = process.env.DUCA_TEST_DATABASE_URL;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("real Docker hosting lifecycle, network policy and expiry", {
  skip: process.env.DUCA_TEST_DOCKER !== "1" || !databaseUrl,
  timeout: 180000,
}, async (t) => {
  const engine = new DockerEngine();
  // The production entrypoint always enforces rootless Docker. This explicit
  // test-only switch lets CI also exercise Docker API behavior on a rootful fixture.
  if (process.env.DUCA_TEST_ALLOW_ROOTFUL !== "1") await engine.assertRootless();
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const { Pool } = require("pg");
  const db = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: databaseUrl })) });
  const marker = `docker-${randomUUID()}`;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "duca-hosted-"));
  const user = await db.user.create({ data: { email: `${marker}@example.test`, profileComplete: true, role: "ADMIN" } });
  const category = await db.category.create({ data: { name: marker, slug: marker } });
  const competition = await db.competition.create({ data: { name: marker, slug: marker, startAt: new Date(), endAt: new Date(Date.now() + 86400000) } });
  const challenge = await db.challenge.create({ data: { competitionId: competition.id, categoryId: category.id, title: marker, slug: marker, points: 100, startAt: new Date() } });
  const script = "import socket,threading,http.server; s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.bind(('0.0.0.0',9000)); exec('def udp():\\n while True:\\n  data,addr=s.recvfrom(1024); s.sendto(data,addr)'); threading.Thread(target=udp,daemon=True).start(); http.server.HTTPServer(('0.0.0.0',8000),http.server.SimpleHTTPRequestHandler).serve_forever()";
  const template = normalizeHostingTemplate({ services: {
    data: { image: "python:3.12-slim", command: ["python", "-u", "-m", "http.server", "8001"] },
    web: { image: "python:3.12-slim", command: ["python", "-u", "-c", script], depends_on: ["data"], ports: [{ target: 8000, app_protocol: "http" }, "9000/udp"], volumes: ["state:/state", "./config.txt:/etc/challenge-config:ro"] },
  }, volumes: { state: {} } }, { "config.txt": Buffer.from("BUNDLED_CONFIG").toString("base64") });
  const row = await db.hostedInstance.create({ data: { userId: user.id, challengeId: challenge.id, template, templateVersion: 1, resourceMemoryMb: template.resources.memoryMb, resourceCpuMillicores: template.resources.cpuMillicores, expiresAt: new Date(Date.now() + 7200000) } });
  const worker = new InstanceWorker({ db, engine, dataDir: directory, hostDataDir: directory });
  t.after(async () => {
    await removeGeneration(engine, row.id).catch(() => {});
    await db.hostedInstance.deleteMany({ where: { id: row.id } });
    await db.competition.delete({ where: { id: competition.id } });
    await db.category.delete({ where: { id: category.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
    await fs.rm(directory, { recursive: true, force: true });
  });
  async function reconcile(changes = {}) {
    await db.hostedInstance.update({ where: { id: row.id }, data: { operationLeaseUntil: null, ...changes } });
    await worker.process(await db.hostedInstance.findUnique({ where: { id: row.id } }));
    const current = await db.hostedInstance.findUnique({ where: { id: row.id } });
    if (current.state === "FAILED") assert.fail(JSON.stringify(await db.instanceEvent.findMany({ where: { instanceId: row.id }, orderBy: { createdAt: "desc" }, take: 5 })));
    return current;
  }
  async function exec(appId, command) {
    const created = await engine.request("POST", `/containers/${appId}/exec`, { AttachStdout: true, AttachStderr: true, Cmd: ["python", "-c", command] });
    const output = await engine.request("POST", `/exec/${created.Id}/start`, { Detach: false, Tty: false });
    const result = await engine.request("GET", `/exec/${created.Id}/json`);
    assert.equal(result.ExitCode, 0, String(output));
    return String(output);
  }
  let current = await reconcile();
  assert.equal(current.state, "RUNNING");
  const deadline = current.expiresAt.getTime();
  const record = current.containers.find((item) => item.service === "web");
  const http = current.endpoints.find((endpoint) => endpoint.scheme === "http");
  let response;
  for (let attempt = 0; attempt < 20 && !response; attempt++) {
    try { response = await fetch(`http://127.0.0.1:${http.port}`, { signal: AbortSignal.timeout(1000) }); }
    catch { await sleep(250); }
  }
  if (!response) {
    const log = await engine.request("GET", `/containers/${record.appId}/logs?stdout=1&stderr=1&tail=30`);
    assert.fail(`Published HTTP endpoint did not become reachable: ${String(log)}`);
  }
  assert.equal(response.status, 200);
  const udp = current.endpoints.find((endpoint) => endpoint.protocol === "udp");
  await new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    const timeout = setTimeout(() => { socket.close(); reject(new Error("UDP endpoint did not reply")); }, 3000);
    socket.once("error", reject);
    socket.once("message", (buffer) => { clearTimeout(timeout); socket.close(); assert.equal(buffer.toString(), "udp-ok"); resolve(); });
    socket.send(Buffer.from("udp-ok"), udp.port, "127.0.0.1");
  });
  await exec(record.appId, "from pathlib import Path; assert Path('/etc/challenge-config').read_text() == 'BUNDLED_CONFIG'; Path('/state/proof').write_text('persistent'); Path('/tmp/proof').write_text('persistent')");
  await exec(record.appId, "import urllib.request; assert urllib.request.urlopen('http://data:8001',timeout=2).status == 200");
  const networks = (await engine.inspectContainer(record.guardId)).NetworkSettings.Networks;
  const gateway = Object.values(networks)[0].Gateway;
  await exec(record.appId, `import socket; s=socket.socket(); s.settimeout(0.5); assert s.connect_ex(('${gateway}',5432)) != 0; s.close(); s=socket.socket(); s.settimeout(0.5); assert s.connect_ex(('1.1.1.1',443)) != 0`);
  await exec(record.appId, "import socket; s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.settimeout(0.5); exec('try:\\n s.sendto(bytes.fromhex(\"123401000001000000000000076578616d706c6503636f6d0000010001\"),(\"127.0.0.11\",53))\\n s.recv(1024)\\n raise AssertionError(\"External DNS was forwarded\")\\nexcept OSError:\\n pass')");
  const runnerSecret = "docker-integration-runner-secret-32-characters";
  const origin = "https://hosting-test.example";
  const { server, sockets } = createRunnerServer({ db, engine, secret: runnerSecret, appOrigin: origin });
  const connections = new Set();
  server.on("connection", (connection) => { connections.add(connection); connection.once("close", () => connections.delete(connection)); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { for (const socket of sockets.clients) socket.terminate(); for (const connection of connections) connection.destroy(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  const runnerUrl = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${runnerUrl}/logs/${row.id}/web`)).status, 401);
  const logAbort = new AbortController();
  const logs = await fetch(`${runnerUrl}/logs/${row.id}/web`, { headers: { Authorization: `Bearer ${runnerSecret}` }, signal: logAbort.signal });
  assert.equal(logs.status, 200);
  const firstLog = await logs.body.getReader().read();
  assert.match(Buffer.from(firstLog.value).toString(), /GET/);
  logAbort.abort();
  const ticket = createTerminalToken();
  await db.instanceTerminalSession.create({ data: { id: ticket.id, tokenHash: ticket.tokenHash, userId: user.id, instanceId: row.id, service: "web", generation: 1, expiresAt: new Date(Date.now() + 3000) } });
  const socket = new WebSocket(`${runnerUrl.replace("http:", "ws:")}/instance-terminal`, ["duca-terminal", ticket.token], { origin });
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  let terminalOutput = "";
  socket.on("message", (data) => { terminalOutput += data.toString(); });
  // Connection ticket expiry must not close an already-authenticated terminal.
  await sleep(3500);
  assert.equal(socket.readyState, WebSocket.OPEN);
  socket.send(JSON.stringify({ type: "resize", cols: 100, rows: 30 }));
  socket.send("printf DUCA_; printf TERMINAL_PROOF\\n\n");
  const terminalDeadline = Date.now() + 3000;
  while (!terminalOutput.includes("DUCA_TERMINAL_PROOF") && Date.now() < terminalDeadline) await sleep(50);
  assert.match(terminalOutput, /DUCA_TERMINAL_PROOF/);
  await db.user.update({ where: { id: user.id }, data: { role: "USER" } });
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Demoted administrator retained terminal access")), 3000); socket.once("close", () => { clearTimeout(timer); resolve(); }); });
  current = await reconcile({ desiredState: "STOPPED", state: "STOPPING" });
  assert.equal(current.state, "STOPPED");
  assert.equal(current.expiresAt.getTime(), deadline);
  assert.equal((await engine.inspectContainer(record.appId)).State.Running, false);
  current = await reconcile({ desiredState: "RUNNING", state: "QUEUED" });
  assert.equal(current.state, "RUNNING");
  assert.equal(current.expiresAt.getTime(), deadline);
  await exec(record.appId, "from pathlib import Path; assert Path('/state/proof').read_text() == 'persistent'; assert Path('/tmp/proof').read_text() == 'persistent'");
  const crash = await engine.request("POST", `/containers/${record.appId}/exec`, { Cmd: ["python", "-c", "import os,signal,pathlib; [(os.kill(int(p.name),signal.SIGKILL)) for p in pathlib.Path('/proc').iterdir() if p.name.isdigit() and int(p.name) not in [1,os.getpid()] and b'http.server.HTTPServer' in (p/'cmdline').read_bytes()]"] });
  await engine.request("POST", `/exec/${crash.Id}/start`, { Detach: false, Tty: false });
  await sleep(500);
  const until = Date.now() + 10000;
  while (!(await engine.inspectContainer(record.appId)).State.Running && Date.now() < until) await sleep(200);
  assert.equal((await engine.inspectContainer(record.appId)).State.Running, true);
  const previousGuardEpoch = (await engine.inspectContainer(record.guardId)).State.StartedAt;
  // Restart the guard independently while its application remains alive.
  await engine.request("POST", `/containers/${record.guardId}/restart?t=0`);
  assert.notEqual((await engine.inspectContainer(record.guardId)).State.StartedAt, previousGuardEpoch);
  current = await reconcile();
  assert.equal(current.state, "RUNNING");
  assert.equal(current.containers.find((item) => item.service === "web").appId, record.appId);
  await exec(record.appId, "from pathlib import Path; assert Path('/state/proof').read_text() == 'persistent'");
  let rejoined = false;
  for (let attempt = 0; attempt < 20 && !rejoined; attempt++) {
    try { rejoined = (await fetch(`http://127.0.0.1:${http.port}`, { signal: AbortSignal.timeout(500) })).ok; }
    catch { await sleep(100); }
  }
  assert.equal(rejoined, true, "A restarted network guard must restore public ingress");
  const freshDeadline = new Date(Date.now() + 7200000);
  current = await reconcile({ generation: 2, observedGeneration: 0, containers: [], endpoints: [], state: "QUEUED", expiresAt: freshDeadline });
  assert.equal(current.state, "RUNNING");
  assert.equal(current.generation, 2);
  assert.equal(current.expiresAt.getTime(), freshDeadline.getTime());
  await assert.rejects(engine.inspectContainer(record.appId), { status: 404 });
  const fresh = current.containers.find((item) => item.service === "web");
  await exec(fresh.appId, "from pathlib import Path; assert not Path('/state/proof').exists(); assert not Path('/tmp/proof').exists()");
  const expiryProbe = { id: `${row.id}-expiry`, generation: 1, expiresAt: new Date(Date.now() + 5000), internetEnabled: false };
  const freshGuard = await engine.inspectContainer(fresh.guardId);
  const [networkName, networkConfig] = Object.entries(freshGuard.NetworkSettings.Networks)[0];
  const config = buildGuardContainerConfig({ instance: expiryProbe, service: { name: "expiry", ports: [] }, networkName, subnet: `${networkConfig.IPAddress.split('.').slice(0,3).join('.')}.${Math.floor(Number(networkConfig.IPAddress.split('.')[3])/16)*16}/28` });
  config.Labels = resourceLabels(expiryProbe, "guard", "expiry");
  const deadlineGuard = await engine.request("POST", "/containers/create", config);
  t.after(() => removeGeneration(engine, expiryProbe.id));
  await engine.request("POST", `/containers/${deadlineGuard.Id}/start`);
  await sleep(6000);
  const expiredPolicy = await engine.request("POST", `/containers/${deadlineGuard.Id}/exec`, { AttachStdout: true, AttachStderr: true, Cmd: ["sh", "-c", "test ! -e /run/duca-ready && test \"$(iptables -S OUTPUT)\" = '-P OUTPUT DROP'"] });
  await engine.request("POST", `/exec/${expiredPolicy.Id}/start`, { Detach: false, Tty: false });
  assert.equal((await engine.request("GET", `/exec/${expiredPolicy.Id}/json`)).ExitCode, 0, "Expiry must revoke networking without database or worker involvement");
  const results = await expireManagedResources(engine, freshDeadline.getTime() + 1);
  assert.equal(results.some((result) => result.id === row.id && result.generation === 2 && result.removed), true);
  await assert.rejects(engine.inspectContainer(fresh.appId), { status: 404 });
  current = await reconcile({ expiresAt: new Date(Date.now() - 1) });
  assert.equal(current.state, "EXPIRED");
  assert.deepEqual(current.endpoints, []);
});
