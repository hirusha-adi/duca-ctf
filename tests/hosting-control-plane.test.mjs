import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_HOSTING_SETTINGS, INSTANCE_LIFETIME_MS, hostingUsage, requestInstanceAction, serializeHostedInstance, validateHostingSettings } from "../src/lib/hosting/control-plane.mjs";

const now = new Date("2026-10-22T00:00:00Z");
const player = { id: "player", role: "USER" };
const template = { version: 1, services: [{ name: "web", environment: { SECRET: "private" } }, { name: "db" }], resources: { memoryMb: 512, cpuMillicores: 500 } };
const dependencies = { authorizeChallenge: async () => {}, normalizeTemplate: (value) => structuredClone(value) };
const existingInstance = (extra = {}) => ({ id: "existing", userId: "player", challengeId: "challenge", state: "RUNNING", desiredState: "RUNNING", generation: 1, observedGeneration: 1, template, templateVersion: 1, internetEnabled: false, resourceMemoryMb: 512, resourceCpuMillicores: 500, endpoints: [{ port: 21000 }], containers: [{ service: "web", appId: "old" }], expiresAt: new Date(now.getTime() + 3600000), ...extra });

function database({ instances = [], settings = {}, challenge = {} } = {}) {
  const rows = structuredClone(instances);
  const events = [];
  const calls = [];
  const configuration = { id: "challenge", hosted: true, hostingEnabled: true, hostingInternetEnabled: false, hostingTemplate: template, hostingVersion: 1, competition: {}, ...challenge };
  const tx = {
    $executeRaw: async (sql, key) => { calls.push(key ?? sql.join("")); },
    challenge: { findUnique: async () => structuredClone(configuration) },
    hostingSettings: { upsert: async () => ({ ...DEFAULT_HOSTING_SETTINGS, publicHost: "203.0.113.10", ...settings }) },
    hostedInstance: {
      findUnique: async ({ where }) => rows.find((row) => where.id ? row.id === where.id : row.userId === where.userId_challengeId.userId && row.challengeId === where.userId_challengeId.challengeId) ?? null,
      findMany: async () => rows.filter((row) => !["EXPIRED", "DELETED"].includes(row.state)),
      create: async ({ data }) => { const row = { id: "created", observedGeneration: 0, endpoints: [], containers: [], ...data }; rows.push(row); return row; },
      update: async ({ where, data }) => { const index = rows.findIndex((row) => row.id === where.id); rows[index] = { ...rows[index], ...data }; return rows[index]; },
    },
    instanceEvent: { create: async ({ data }) => { events.push(data); return data; } },
  };
  let queue = Promise.resolve();
  return { rows, events, calls, db: { $transaction: (operation) => { const result = queue.then(() => operation(tx)); queue = result.catch(() => {}); return result; } } };
}

test("a multi-service deployment consumes one instance slot and reserves its total resources", async () => {
  const { db, rows, events, calls } = database({ settings: { maxInstances: 1 } });
  const instance = await requestInstanceAction(db, { user: player, challengeId: "challenge", action: "start", now }, dependencies);
  assert.equal(rows.length, 1);
  assert.equal(instance.resourceMemoryMb, 512);
  assert.equal(instance.resourceCpuMillicores, 500);
  assert.equal(instance.expiresAt.getTime(), now.getTime() + INSTANCE_LIFETIME_MS);
  assert.equal(instance.state, "QUEUED");
  assert.match(calls[0], /hosting:capacity/);
  assert.equal(events[0].action, "INSTANCE_START_REQUESTED");
});

test("repeated starts are idempotent and concurrent requests share one player/challenge row", async () => {
  const { db, rows, events } = database();
  const request = () => requestInstanceAction(db, { user: player, challengeId: "challenge", action: "start", now }, dependencies);
  const results = await Promise.all([request(), request()]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(rows.length, 1);
  assert.equal(events.length, 1);
});

test("stop preserves containers, generation, template and original expiry", async () => {
  const original = existingInstance();
  const { db } = database({ instances: [original], challenge: { hostingEnabled: false } });
  const stopped = await requestInstanceAction(db, { user: player, challengeId: "challenge", action: "stop", now }, dependencies);
  assert.equal(stopped.desiredState, "STOPPED");
  assert.equal(stopped.state, "STOPPING");
  assert.deepEqual(stopped.containers, original.containers);
  assert.deepEqual(stopped.template, original.template);
  assert.equal(stopped.generation, original.generation);
  assert.equal(stopped.expiresAt.getTime(), original.expiresAt.getTime());
});

test("resume reacquires resources and preserves its original deadline and pinned template", async () => {
  const original = existingInstance({ state: "STOPPED", desiredState: "STOPPED" });
  const replacement = { ...template, resources: { memoryMb: 1024, cpuMillicores: 1000 } };
  const { db } = database({ instances: [original], challenge: { hostingTemplate: replacement, hostingVersion: 2 } });
  const resumed = await requestInstanceAction(db, { user: player, challengeId: "challenge", action: "start", now }, dependencies);
  assert.equal(resumed.templateVersion, 1);
  assert.equal(resumed.resourceMemoryMb, 512);
  assert.equal(resumed.expiresAt.getTime(), original.expiresAt.getTime());
});

test("recreate makes a new two-hour generation while preserving cleanup ownership", async () => {
  const original = existingInstance({ operationToken: "worker-token", operationLeaseUntil: new Date(now.getTime() + 30000) });
  const { db } = database({ instances: [original], challenge: { hostingVersion: 3, hostingInternetEnabled: true } });
  const recreated = await requestInstanceAction(db, { user: player, challengeId: "challenge", action: "recreate", now }, dependencies);
  assert.equal(recreated.generation, 2);
  assert.equal(recreated.templateVersion, 3);
  assert.equal(recreated.internetEnabled, true);
  assert.equal(recreated.state, "RECREATING");
  assert.equal(recreated.expiresAt.getTime(), now.getTime() + INSTANCE_LIFETIME_MS);
  assert.equal(recreated.operationToken, "worker-token");
  assert.deepEqual(recreated.containers, original.containers);
});

test("stopped instances still count toward the global cap but release compute only after stop confirmation", async () => {
  const stopped = existingInstance({ state: "STOPPED", desiredState: "STOPPED", userId: "other" });
  assert.deepEqual(hostingUsage([stopped]), { instances: 1, memoryMb: 0, cpuMillicores: 0 });
  assert.deepEqual(hostingUsage([{ ...stopped, state: "STOPPING" }]), { instances: 1, memoryMb: 512, cpuMillicores: 500 });
  const { db } = database({ instances: [stopped], settings: { maxInstances: 1 } });
  await assert.rejects(requestInstanceAction(db, { user: player, challengeId: "challenge", action: "start", now }, dependencies), { status: 409 });
});

test("global memory and CPU budgets reject a start without creating an instance", async () => {
  for (const settings of [{ memoryBudgetMb: 511 }, { cpuBudgetMillicores: 499 }]) {
    const { db, rows } = database({ settings });
    await assert.rejects(requestInstanceAction(db, { user: player, challengeId: "challenge", action: "start", now }, dependencies), { status: 409 });
    assert.equal(rows.length, 0);
  }
});

test("disabled hosting rejects fresh starts, resumes and recreates", async () => {
  for (const action of ["start", "recreate"]) {
    const { db } = database({ instances: [existingInstance({ state: "STOPPED", desiredState: "STOPPED" })], challenge: { hostingEnabled: false } });
    await assert.rejects(requestInstanceAction(db, { user: player, challengeId: "challenge", action, now }, dependencies), { status: 409 });
  }
});

test("expired leases cannot resume; cleanup and recreate are explicit", async () => {
  const expired = existingInstance({ expiresAt: new Date(now.getTime() - 1) });
  const { db } = database({ instances: [expired] });
  await assert.rejects(requestInstanceAction(db, { user: player, challengeId: "challenge", action: "start", now }, dependencies), { status: 409 });
  const stopped = await requestInstanceAction(db, { user: player, challengeId: "challenge", action: "stop", now }, dependencies);
  assert.equal(stopped.desiredState, "DELETED");
});

test("player serialization excludes template secrets, Docker IDs and stale endpoints", () => {
  const instance = existingInstance();
  const serialized = serializeHostedInstance(instance, { now });
  assert.equal(serialized.template, undefined);
  assert.equal(serialized.containers, undefined);
  assert.ok(!JSON.stringify(serialized).includes("private"));
  assert.deepEqual(serializeHostedInstance({ ...instance, generation: 2 }, { now }).endpoints, []);
  assert.deepEqual(serializeHostedInstance({ ...instance, expiresAt: now }, { now }).endpoints, []);
});

test("settings default to 500 instances with a configurable ceiling and a fixed high-port pool", () => {
  assert.equal(validateHostingSettings({}).maxInstances, 500);
  assert.equal(validateHostingSettings({ maxInstances: 1000 }).maxInstances, 1000);
  assert.throws(() => validateHostingSettings({ maxInstances: 10001 }), { status: 400 });
  assert.throws(() => validateHostingSettings({ portRangeStart: 80 }), { status: 400 });
  assert.throws(() => validateHostingSettings({ portRangeStart: 30000, portRangeEnd: 20000 }), { status: 400 });
  assert.throws(() => validateHostingSettings({ publicHost: "https://example.test:443" }), { status: 400 });
  assert.equal(validateHostingSettings({ publicHost: "203.0.113.10" }).publicHost, "203.0.113.10");
});
