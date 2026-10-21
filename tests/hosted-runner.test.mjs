import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { PassThrough } from "node:stream";
import { once } from "node:events";
import { WebSocket } from "ws";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DockerEngine, dockerLogDecoder } from "../runner/docker.mjs";
import { resourceLabels, LABELS, ownedResource, removeGeneration } from "../runner/resources.mjs";
import { expireManagedResources } from "../runner/watchdog.mjs";
import { allocateServicePorts, buildAppContainerConfig, guardEpochChanged, imageRegistryServer, serviceAddresses, serviceHostsFile, serviceOrder } from "../runner/runtime-plan.mjs";
import { consumeTerminalToken, terminalSessionAllowed, terminalTokenFromRequest, validTerminalResize } from "../runner/terminal-auth.mjs";
import { createTerminalToken } from "../src/lib/hosting/secrets.mjs";
import { InstanceWorker, StaleOperation } from "../runner/worker.mjs";
import { sanitizedOperationError } from "../runner/diagnostics.mjs";
import { createRunnerServer } from "../runner/server.mjs";
import { buildGuardContainerConfig } from "../runner/network-policy.mjs";

const instance = (overrides = {}) => ({ id: "instance1", generation: 1, observedGeneration: 1, operationToken: "lease", desiredState: "RUNNING", state: "RUNNING", internetEnabled: false, expiresAt: new Date(Date.now() + 7200000), ...overrides });

test("resource ownership requires the complete managed instance and generation scope", () => {
  const labels = resourceLabels(instance(), "app", "web");
  assert.equal(ownedResource(labels, { instanceId: "instance1", generation: 1, kinds: ["app"] }), true);
  assert.equal(ownedResource(labels, { instanceId: "instance2" }), false);
  assert.equal(ownedResource(labels, { generation: 2 }), false);
  assert.equal(ownedResource({ [LABELS.managed]: "true" }), false);
  assert.equal(ownedResource({ ...labels, [LABELS.kind]: "platform" }), false);
});

function resourceEngine(containers = [], networks = [], volumes = []) {
  const mutations = [];
  const engine = {
    listContainers: async () => containers,
    listNetworks: async () => networks,
    listVolumes: async () => volumes,
    inspectContainer: async (id) => ({ Config: { Labels: containers.find((item) => item.Id === id)?.Labels } }),
    inspectNetwork: async (id) => networks.find((item) => item.Id === id),
    inspectVolume: async (name) => volumes.find((item) => item.Name === name),
    request: async (method, url) => { mutations.push({ method, url }); },
  };
  return { engine, mutations };
}

test("expiry cleanup removes only the expired generation and keeps platform and recreated resources", async () => {
  const expired = instance({ expiresAt: new Date(Date.now() - 1) });
  const newer = instance({ generation: 2 });
  const { engine, mutations } = resourceEngine([
    { Id: "expired-app", Labels: resourceLabels(expired, "app", "web") },
    { Id: "expired-guard", Labels: resourceLabels(expired, "guard", "web") },
    { Id: "new-app", Labels: resourceLabels(newer, "app", "web") },
    { Id: "platform", Labels: {} },
  ], [{ Id: "old-net", Labels: resourceLabels(expired, "network") }], [{ Name: "old-volume", Labels: resourceLabels(expired, "volume") }]);
  const results = await expireManagedResources(engine);
  assert.deepEqual(results, [{ id: expired.id, generation: 1, removed: true }]);
  assert.equal(mutations.length, 4);
  assert.equal(mutations.some((entry) => /platform|new-app/.test(entry.url)), false);
  assert.match(mutations[0].url, /expired-app/);
  assert.match(mutations[1].url, /expired-guard/);
});

test("stale cleanup cannot delete a future generation even if Docker ignores list filters", async () => {
  const { engine, mutations } = resourceEngine([
    { Id: "old", Labels: resourceLabels(instance(), "app", "web") },
    { Id: "new", Labels: resourceLabels(instance({ generation: 3 }), "app", "web") },
  ]);
  await removeGeneration(engine, "instance1", undefined, { maxGeneration: 2 });
  assert.equal(mutations.length, 1);
  assert.match(mutations[0].url, /old/);
});

test("resource ownership is rechecked immediately before destructive Docker operations", async () => {
  const { engine, mutations } = resourceEngine([{ Id: "changed", Labels: resourceLabels(instance(), "app", "web") }]);
  engine.inspectContainer = async () => ({ Config: { Labels: {} } });
  await assert.rejects(removeGeneration(engine, "instance1", 1), /outside/);
  assert.equal(mutations.length, 0);
});

test("Docker rootless verification refuses rootful engines and unenforceable limits", async () => {
  const engine = new DockerEngine();
  for (const info of [{ SecurityOptions: [] }, { SecurityOptions: ["name=rootless"], MemoryLimit: false, CpuCfsQuota: true, CgroupVersion: "2" }, { SecurityOptions: ["name=rootless"], MemoryLimit: true, CpuCfsQuota: true, CgroupVersion: "1" }]) {
    engine.request = async () => info;
    await assert.rejects(engine.assertRootless());
  }
  engine.request = async () => ({ SecurityOptions: ["name=rootless"], MemoryLimit: true, CpuCfsQuota: true, CgroupVersion: "2" });
  await engine.assertRootless();
});

test("ports are allocated on all interfaces within the fixed range and avoid stopped-instance reservations", () => {
  const used = new Set([20000, 20001]);
  const result = allocateServicePorts([{ target: 80, protocol: "tcp", scheme: "http" }, { target: 53, protocol: "udp", scheme: "udp" }], used);
  assert.deepEqual(result.bindings["80/tcp"], [{ HostIp: "0.0.0.0", HostPort: "20002" }]);
  assert.equal(result.endpoints[1].port, 20003);
  assert.throws(() => allocateServicePorts([], new Set(), { start: 1000 }), /20000/);
  assert.throws(() => allocateServicePorts([{ target: 80, protocol: "tcp" }], new Set([20000]), { start: 20000, end: 20000 }), /No hosted/);
});

test("applications receive immutable images, explicit limits, no capabilities, and only their guard network", () => {
  const config = buildAppContainerConfig({ instance: instance(), service: { memoryMb: 128, cpuMillicores: 100, pidsLimit: 32, environment: { FLAG: "secret" } }, imageId: `sha256:${"a".repeat(64)}`, guardId: "guard", mounts: [], labels: {} });
  assert.equal(config.HostConfig.NetworkMode, "container:guard");
  assert.equal(config.HostConfig.Memory, 128 * 1048576);
  assert.equal(config.HostConfig.NanoCpus, 100000000);
  assert.deepEqual(config.HostConfig.CapDrop, ["ALL"]);
  assert.deepEqual(config.HostConfig.SecurityOpt, ["no-new-privileges:true"]);
  assert.equal(config.HostConfig.Privileged, false);
  assert.equal(config.HostConfig.RestartPolicy.Name, "unless-stopped");
  assert.equal(config.HostConfig.LogConfig.Config["max-size"], "20m");
  assert.equal(Object.hasOwn(config.HostConfig, "PortBindings"), false);
  assert.throws(() => buildAppContainerConfig({ service: {}, imageId: "busybox:latest" }), /immutable/);
});

test("service dependencies are ordered before consumers and missing/cyclic dependencies are rejected", () => {
  assert.deepEqual(serviceOrder([{ name: "web", dependsOn: ["db"] }, { name: "db", dependsOn: [] }]).map((entry) => entry.name), ["db", "web"]);
  assert.throws(() => serviceOrder([{ name: "a", dependsOn: ["b"] }]), /does not exist/);
  assert.throws(() => serviceOrder([{ name: "a", dependsOn: ["b"] }, { name: "b", dependsOn: ["a"] }]), /cycle/);
});

test("stable service addresses and hosts files resolve only the instance's services without an external DNS server", () => {
  const services = [{ name: "web" }, { name: "db" }];
  const addresses = serviceAddresses(services, "10.210.1.240/28");
  assert.deepEqual(addresses, { web: "10.210.1.242", db: "10.210.1.243" });
  const hosts = serviceHostsFile(services, "10.210.1.240/28");
  assert.match(hosts, /^127\.0\.0\.1 localhost\n/);
  assert.match(hosts, /10\.210\.1\.243 db\n/);
  assert.equal(hosts.includes("gateway"), false);
  assert.throws(() => serviceAddresses(Array.from({ length: 9 }, (_, index) => ({ name: `s${index}` })), "10.210.1.0/28"), /address plan/);
  const guard = buildGuardContainerConfig({ instance: instance(), service: { name: "web", ports: [] }, networkName: "private", subnet: "10.210.1.240/28", serviceAddress: addresses.web });
  assert.deepEqual(guard.NetworkingConfig.EndpointsConfig.private.IPAMConfig, { IPv4Address: "10.210.1.242" });
  assert.deepEqual(guard.NetworkingConfig.EndpointsConfig.private.Aliases, ["web"]);
});

test("Docker multiplexed log decoding preserves split headers and mixed stdout/stderr", async () => {
  const frame = (channel, value) => { const body = Buffer.from(value); const header = Buffer.alloc(8); header[0] = channel; header.writeUInt32BE(body.length, 4); return Buffer.concat([header, body]); };
  const data = Buffer.concat([frame(1, "hello\n"), frame(2, "error\n")]);
  const decoder = dockerLogDecoder();
  let output = "";
  decoder.output.on("data", (chunk) => { output += chunk.toString(); });
  for (let offset = 0; offset < data.length; offset += 3) decoder.write(data.subarray(offset, offset + 3));
  decoder.end();
  assert.equal(output, "hello\nerror\n");
});

test("a slow log consumer propagates backpressure before more Docker output is read", async () => {
  const decoder = dockerLogDecoder({ tty: true });
  assert.equal(decoder.write(Buffer.alloc(1024 * 1024, "x")), false);
  assert.equal(decoder.output.writableNeedDrain, true);
  decoder.output.resume();
  await new Promise((resolve) => decoder.output.once("drain", resolve));
  assert.equal(decoder.output.writableNeedDrain, false);
  decoder.end();
});

test("Docker pulls send credentials only as a registry header and save immutable digests", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "duca-engine-"));
  const socketPath = path.join(directory, "docker.sock");
  let auth;
  const server = createServer((request, response) => {
    if (request.url.includes("/images/create")) { auth = request.headers["x-registry-auth"]; response.write('{"status":"pulling"}\n'); response.end('{"status":"done"}\n'); }
    else { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ Id: `sha256:${"b".repeat(64)}`, RepoDigests: [`registry.example/app@sha256:${"c".repeat(64)}`] })); }
  });
  await new Promise((resolve) => server.listen(socketPath, resolve));
  try {
    const engine = new DockerEngine({ socketPath });
    const result = await engine.pullImage("registry.example/app:latest", { username: "name", password: "do-not-log" });
    assert.equal(JSON.parse(Buffer.from(auth, "base64url")).password, "do-not-log");
    assert.match(result.id, /^sha256:/);
    assert.match(result.digest, /^registry\.example\/app@sha256:/);
  } finally { await new Promise((resolve) => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); }
});

test("image tags and digests select Docker Hub credentials while explicit registries keep their own credentials", () => {
  for (const reference of ["python:3.12-slim", `ubuntu@sha256:${"a".repeat(64)}`, "namespace/name:tag", "docker.io/library/python:3", "index.docker.io/library/python:3"]) assert.equal(imageRegistryServer(reference), "docker.io");
  assert.equal(imageRegistryServer("ghcr.io/name/image:tag"), "ghcr.io");
  assert.equal(imageRegistryServer("private:5000/name:tag"), "private:5000");
  assert.equal(imageRegistryServer("localhost/name:tag"), "localhost");
});

function terminalFixture() {
  const token = createTerminalToken();
  const session = { id: token.id, tokenHash: token.tokenHash, usedAt: null, userId: "admin", instanceId: "instance1", service: "web", generation: 1, expiresAt: new Date(Date.now() + 60000), user: { role: "ADMIN", disabled: false }, instance: instance() };
  const tx = { instanceTerminalSession: { findUnique: async () => ({ ...session }), updateMany: async () => { if (session.usedAt) return { count: 0 }; session.usedAt = new Date(); return { count: 1 }; } } };
  return { token, session, db: { $transaction: async (callback) => callback(tx) } };
}

test("interactive terminal tickets are consumed once, including simultaneous connection attempts", async () => {
  const fixture = terminalFixture();
  const results = await Promise.all([consumeTerminalToken(fixture.db, fixture.token.token), consumeTerminalToken(fixture.db, fixture.token.token)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await consumeTerminalToken(fixture.db, fixture.token.token), null);
});

test("terminal tickets reject bad secrets, demotion, disabled accounts, stale generations, and expiry", async () => {
  const fixture = terminalFixture();
  assert.equal(await consumeTerminalToken(fixture.db, `${fixture.token.id}.${"x".repeat(43)}`), null);
  assert.equal(terminalSessionAllowed(fixture.session), true);
  for (const mutation of [{ user: { role: "USER", disabled: false } }, { user: { role: "ADMIN", disabled: true } }, { generation: 2 }, { expiresAt: new Date(0) }, { instance: instance({ desiredState: "STOPPED" }) }]) assert.equal(terminalSessionAllowed({ ...fixture.session, ...mutation }), false);
});

test("terminal protocol tokens take precedence over query strings and resize controls are bounded", () => {
  const token = createTerminalToken().token;
  assert.equal(terminalTokenFromRequest(new URL("https://ctf.example/instance-terminal?token=other"), `duca-terminal, ${token}`), token);
  assert.equal(validTerminalResize({ type: "resize", cols: 80, rows: 24 }), true);
  assert.equal(validTerminalResize({ type: "resize", cols: 100000, rows: 24 }), false);
  assert.equal(validTerminalResize({ type: "resize", cols: 80.5, rows: 24 }), false);
});

test("worker rejects stale generations and changed desired state before launching anything", async () => {
  const current = instance();
  const worker = new InstanceWorker({ db: { hostedInstance: { findUnique: async () => current } }, engine: {} });
  await worker.assertCurrent(current);
  await assert.rejects(worker.assertCurrent({ ...current, generation: 2 }), StaleOperation);
  await assert.rejects(worker.assertCurrent({ ...current, desiredState: "STOPPED" }), StaleOperation);
  await assert.rejects(worker.assertCurrent({ ...current, state: "RESTARTING" }), StaleOperation);
});

test("claim compares the requested state and returns the authoritative claimed row", async () => {
  const candidate = instance({ updatedAt: new Date() });
  let predicate;
  let current;
  const db = { hostedInstance: {
    updateMany: async ({ where, data }) => { predicate = where; current = { ...candidate, ...data, state: "RESTARTING" }; return { count: 1 }; },
    findUnique: async () => current,
  } };
  const worker = new InstanceWorker({ db, engine: {} });
  const claimed = await worker.claim(candidate);
  assert.equal(predicate.state, "RUNNING");
  assert.equal(predicate.desiredState, "RUNNING");
  assert.equal(predicate.updatedAt, candidate.updatedAt);
  assert.equal(claimed.state, "RESTARTING");
});

test("guard startup epoch changes force running apps to rejoin, while stopped apps can resume directly", () => {
  const oldEpoch = "2026-10-21T10:00:00.000Z";
  const newEpoch = "2026-10-21T10:01:00.000Z";
  const app = { State: { Running: true, StartedAt: oldEpoch } };
  const guard = { State: { StartedAt: newEpoch } };
  assert.equal(guardEpochChanged({ guardStartedAt: oldEpoch }, app, guard), true);
  assert.equal(guardEpochChanged({}, app, guard), true);
  assert.equal(guardEpochChanged({ guardStartedAt: newEpoch }, app, guard), false);
  assert.equal(guardEpochChanged({ guardStartedAt: oldEpoch }, { State: { Running: false } }, guard), false);
});

test("administrator failure details are bounded and redact registry, environment and bearer secrets", () => {
  const current = instance({ operationPhase: "pull:web", template: { services: [{ environment: { FLAG: "DUCA{private}" } }] } });
  const result = sanitizedOperationError(Object.assign(new Error("failed password supersecret FLAG DUCA{private} Bearer abc123 https://user:password@registry.example"), { status: 401 }), current, ["supersecret"]);
  assert.equal(result.phase, "pull:web");
  assert.equal(result.status, 401);
  assert.equal(/supersecret|DUCA\{private\}|abc123|user:password/.test(result.detail), false);
  assert.equal(sanitizedOperationError(new Error("x".repeat(5000)), current).detail.length, 1200);
});

test("outbound blocks include IPv6 public hosts and the own-subnet host gateway", async () => {
  const worker = new InstanceWorker({ db: {}, engine: { listNetworks: async () => [{ IPAM: { Config: [{ Gateway: "172.17.0.1" }] } }], request: async () => ({ Swarm: { NodeAddr: "198.51.100.8" } }) } });
  const addresses = await worker.blockedAddresses({ publicHost: "2001:db8::4" }, { subnet: "10.210.2.16/28", gateway: "10.210.2.17" });
  assert.equal(addresses.includes("2001:db8::4"), true);
  assert.equal(addresses.includes("10.210.2.17"), true);
  assert.equal(addresses.includes("172.17.0.1"), true);
});

test("the terminal WebSocket checks origin/protocol, preserves immediate input, and consumes the ticket once", async () => {
  const fixture = terminalFixture();
  const label = resourceLabels(fixture.session.instance, "app", "web");
  const execution = new PassThrough();
  const db = { ...fixture.db, instanceEvent: { create: async () => {} }, user: { findUnique: async () => fixture.session.user }, hostedInstance: { findUnique: async () => fixture.session.instance } };
  const engine = {
    listContainers: async () => [{ Id: "app", Labels: label }],
    inspectContainer: async () => ({ Config: { Labels: label }, State: { Running: true } }),
    request: async (_method, pathname) => pathname.includes("/resize") ? null : { Id: "exec" },
    attachExec: async () => { await new Promise((resolve) => setTimeout(resolve, 25)); return execution; },
  };
  const { server, sockets } = createRunnerServer({ db, engine, secret: "s".repeat(32), appOrigin: "http://ctf.local" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = `ws://127.0.0.1:${server.address().port}/instance-terminal`;
  try {
    const denied = new WebSocket(address, ["duca-terminal", fixture.token.token], { origin: "http://other.local" });
    await assert.rejects(once(denied, "open"), /401/);
    const ws = new WebSocket(address, ["duca-terminal", fixture.token.token], { origin: "http://ctf.local" });
    const output = once(ws, "message");
    await once(ws, "open");
    assert.equal(ws.protocol, "duca-terminal");
    ws.send("first input");
    assert.equal((await output)[0].toString(), "first input");
    ws.close();
    await once(ws, "close");
    const replay = new WebSocket(address, ["duca-terminal", fixture.token.token], { origin: "http://ctf.local" });
    await assert.rejects(once(replay, "open"), /401/);
  } finally { for (const ws of sockets.clients) ws.terminate(); execution.destroy(); await new Promise((resolve) => server.close(resolve)); }
});

test("Stop stops apps before guards while preserving generation, deadline, endpoints and volumes", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "duca-stop-"));
  const current = instance({ desiredState: "STOPPED", state: "STOPPING", endpoints: [{ port: 20000 }], containers: [{ appId: "app", guardId: "guard" }] });
  const { engine, mutations } = resourceEngine([
    { Id: "guard", Labels: resourceLabels(current, "guard", "web") },
    { Id: "app", Labels: resourceLabels(current, "app", "web") },
    { Id: "platform", Labels: {} },
  ]);
  const originalDeadline = current.expiresAt;
  const db = { hostedInstance: { findUnique: async () => current, updateMany: async ({ data }) => { Object.assign(current, data); return { count: 1 }; } }, instanceEvent: { create: async () => {} } };
  const worker = new InstanceWorker({ db, engine, dataDir: directory });
  try {
    await worker.reconcile(current);
    assert.equal(current.state, "STOPPED");
    assert.equal(current.generation, 1);
    assert.equal(current.expiresAt, originalDeadline);
    assert.deepEqual(current.endpoints, [{ port: 20000 }]);
    assert.deepEqual(mutations.map((entry) => entry.url), ["/containers/app/stop?t=5", "/containers/guard/stop?t=5"]);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test("unhealthy running apps and guards recover once per operation without resetting their generation or deadline", async () => {
  for (const kind of ["app", "guard"]) {
    const current = instance();
    const deadline = current.expiresAt;
    const requests = [];
    const state = { Running: true, Health: { Status: "unhealthy" } };
    const engine = {
      inspectContainer: async () => ({ Config: { Labels: resourceLabels(current, kind, "web") }, State: state }),
      request: async (_method, url) => { requests.push(url); },
    };
    const db = { hostedInstance: { findUnique: async () => current }, instanceEvent: { create: async () => {} } };
    const worker = new InstanceWorker({ db, engine });
    worker.checkDisk = async () => {};
    await worker.startOwned(current, "service");
    assert.deepEqual(requests, ["/containers/service/restart?t=5"]);
    await assert.rejects(worker.startOwned(current, "service"), /already restarted/);
    assert.equal(requests.length, 1);
    assert.equal(current.generation, 1);
    assert.equal(current.expiresAt, deadline);
  }
});
