import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { sealData } from "iron-session";

const databaseUrl = process.env.DUCA_TEST_DATABASE_URL;
const baseUrl = process.env.DUCA_TEST_BASE_URL;
const password = process.env.DUCA_TEST_SESSION_SECRET;
const require = createRequire(import.meta.url);

test("hosted instance control plane against an isolated database and HTTP server", {
  skip: !databaseUrl || !baseUrl || !password,
  timeout: 180000,
}, async (t) => {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const { Pool } = require("pg");
  const db = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: databaseUrl })) });
  const readyDeadline = Date.now() + 45000;
  let ready = false;
  while (!ready && Date.now() < readyDeadline) {
    try { ready = (await fetch(baseUrl, { signal: AbortSignal.timeout(1500) })).ok; }
    catch { /* A fresh production container may still be migrating and seeding. */ }
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) { await db.$disconnect(); assert.fail("The test app did not become ready within 45 seconds"); }
  const marker = `hosting-${randomUUID()}`;
  const category = await db.category.create({ data: { name: marker, slug: marker } });
  const users = await Promise.all(["admin", "player", "other"].map((name) => db.user.create({ data: { email: `${marker}-${name}@example.test`, name, role: name === "admin" ? "ADMIN" : "USER", profileComplete: true } })));
  const [admin, player, other] = users;
  const cookies = new Map(await Promise.all(users.map(async (user) => [user.id, `duca_ctf_session=${await sealData({ userId: user.id }, { password, ttl: 3600 })}`])));
  const competition = await db.competition.create({ data: { name: marker, slug: marker, status: "ACTIVE", startAt: new Date(Date.now() - 3600000), endAt: new Date(Date.now() + 14400000) } });
  const challenge = await db.challenge.create({ data: { competitionId: competition.id, categoryId: category.id, title: marker, slug: "hosted", points: 100, startAt: competition.startAt } });
  const previousSettings = await db.hostingSettings.findUnique({ where: { id: "default" } });
  const settingsFields = ["maxInstances", "memoryBudgetMb", "cpuBudgetMillicores", "publicHost", "portRangeStart", "portRangeEnd"];
  const configUrl = `/api/admin/hosting/challenges/${challenge.id}`;
  const instanceUrl = `/api/challenges/${challenge.id}/instance`;
  const compose = "services:\n  web:\n    image: nginx:alpine\n    environment:\n      FLAG: HOSTING_CONFIG_MUST_STAY_PRIVATE\n    ports:\n      - target: 80\n        app_protocol: http\n";

  async function request(url, { user = admin, method = "GET", body } = {}) {
    return fetch(`${baseUrl}${url}`, { method, headers: { ...(user ? { cookie: cookies.get(user.id) } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  }
  async function json(url, options) {
    const response = await request(url, options);
    return { status: response.status, body: await response.json() };
  }
  const action = (user, name) => json(instanceUrl, { user, method: "POST", body: { action: name } });
  let winner;
  let instance;

  t.after(async () => {
    const instances = await db.hostedInstance.findMany({ where: { challengeId: challenge.id }, select: { id: true } });
    await db.instanceEvent.deleteMany({ where: { OR: [{ actorId: { in: users.map((user) => user.id) } }, { instanceId: { in: instances.map((row) => row.id) } }] } });
    await db.hostedInstance.deleteMany({ where: { challengeId: challenge.id } });
    await db.registryCredential.deleteMany({ where: { server: `${marker}.example.test` } });
    await db.competition.delete({ where: { id: competition.id } });
    await db.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await db.category.delete({ where: { id: category.id } });
    if (previousSettings) {
      const data = Object.fromEntries(settingsFields.map((key) => [key, previousSettings[key]]));
      await db.hostingSettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
    } else await db.hostingSettings.deleteMany({ where: { id: "default" } });
    await db.$disconnect();
  });

  await t.test("authorization and disabled feature flags block unauthorized launches", async () => {
    assert.equal((await json(configUrl, { user: player })).status, 403);
    assert.equal((await json("/api/admin/hosting/settings", { user: player })).status, 403);
    assert.equal((await json(instanceUrl, { user: null })).status, 401);
    assert.equal((await action(player, "start")).status, 409);
    const configured = await json(configUrl, { method: "PATCH", body: { hosted: true, hostingEnabled: false, composeYaml: compose } });
    assert.equal(configured.status, 200, JSON.stringify(configured.body));
    assert.equal((await action(player, "start")).status, 409);
    assert.equal((await json(configUrl, { method: "PATCH", body: { hostingEnabled: true } })).status, 200);
    const settings = await json("/api/admin/hosting/settings", { method: "PATCH", body: { maxInstances: 1, memoryBudgetMb: 4096, cpuBudgetMillicores: 2000, publicHost: "203.0.113.10", portRangeStart: 20000, portRangeEnd: 29999 } });
    assert.equal(settings.status, 200, JSON.stringify(settings.body));
  });

  await t.test("template environment values never cross player API or public leaderboard boundaries", async () => {
    const own = await request(instanceUrl, { user: player });
    assert.ok(!(await own.text()).includes("HOSTING_CONFIG_MUST_STAY_PRIVATE"));
    const leaderboard = await request(`/leaderboard?competition=${competition.id}`, { user: null });
    assert.equal(leaderboard.status, 200);
    assert.ok(!(await leaderboard.text()).includes("HOSTING_CONFIG_MUST_STAY_PRIVATE"));
  });

  await t.test("concurrent players cannot exceed an atomic one-instance cap", async () => {
    const outcomes = await Promise.all([action(player, "start"), action(other, "start")]);
    assert.deepEqual(outcomes.map((result) => result.status).sort(), [200, 409]);
    winner = outcomes[0].status === 200 ? player : other;
    instance = outcomes.find((result) => result.status === 200).body.instance;
    assert.equal(await db.hostedInstance.count({ where: { challengeId: challenge.id } }), 1);
    assert.equal((await action(winner, "start")).body.instance.id, instance.id);
    const loser = winner.id === player.id ? other : player;
    assert.equal((await json(instanceUrl, { user: loser })).body.instance, null);
    const internal = await db.hostedInstance.findUnique({ where: { id: instance.id } });
    assert.equal(internal.template.services[0].environment.FLAG, "HOSTING_CONFIG_MUST_STAY_PRIVATE");
  });

  await t.test("stop and resume preserve state and deadline while compute must be readmitted", async () => {
    const original = await db.hostedInstance.findUnique({ where: { id: instance.id } });
    await db.hostedInstance.update({ where: { id: instance.id }, data: { state: "RUNNING", observedGeneration: original.generation, containers: [{ service: "web", appId: "DOCKER_INTERNAL_TEST_ID", guardId: "GUARD_INTERNAL_TEST_ID" }], endpoints: [{ service: "web", host: "203.0.113.10", port: 21000, protocol: "tcp", scheme: "http" }] } });
    const view = await request(instanceUrl, { user: winner });
    const source = await view.text();
    assert.ok(!source.includes("DOCKER_INTERNAL_TEST_ID"));
    assert.ok(!source.includes("HOSTING_CONFIG_MUST_STAY_PRIVATE"));
    const stopped = await action(winner, "stop");
    assert.equal(stopped.status, 200);
    assert.equal(stopped.body.instance.desiredState, "STOPPED");
    assert.equal(stopped.body.instance.expiresAt, original.expiresAt.toISOString());
    const saved = await db.hostedInstance.findUnique({ where: { id: instance.id } });
    assert.equal(saved.containers[0].appId, "DOCKER_INTERNAL_TEST_ID");
    await db.hostedInstance.update({ where: { id: instance.id }, data: { state: "STOPPED" } });
    const stoppedUsage = (await json("/api/admin/hosting/settings")).body.usage;
    assert.equal(stoppedUsage.instances, 1);
    assert.equal(stoppedUsage.memoryMb, 0);
    await json("/api/admin/hosting/settings", { method: "PATCH", body: { memoryBudgetMb: 64 } });
    assert.equal((await action(winner, "start")).status, 409);
    await json("/api/admin/hosting/settings", { method: "PATCH", body: { memoryBudgetMb: 4096 } });
    const resumed = await action(winner, "start");
    assert.equal(resumed.status, 200, JSON.stringify(resumed.body));
    assert.equal(resumed.body.instance.generation, original.generation);
    assert.equal(resumed.body.instance.expiresAt, original.expiresAt.toISOString());
  });

  await t.test("disabled hosting leaves existing leases intact and blocks start and recreate", async () => {
    const before = await db.hostedInstance.findUnique({ where: { id: instance.id } });
    assert.equal((await json(configUrl, { method: "PATCH", body: { hostingEnabled: false } })).status, 200);
    assert.equal((await action(winner, "start")).status, 409);
    assert.equal((await action(winner, "recreate")).status, 409);
    const after = await db.hostedInstance.findUnique({ where: { id: instance.id } });
    assert.equal(after.desiredState, before.desiredState);
    assert.equal(after.expiresAt.getTime(), before.expiresAt.getTime());
    assert.equal((await action(winner, "stop")).status, 200);
    await db.hostedInstance.update({ where: { id: instance.id }, data: { state: "STOPPED" } });
    await json(configUrl, { method: "PATCH", body: { hostingEnabled: true } });
  });

  await t.test("recreate makes a new generation and a new two-hour lease", async () => {
    const previous = await db.hostedInstance.findUnique({ where: { id: instance.id } });
    const before = Date.now();
    const recreated = await action(winner, "recreate");
    const after = Date.now();
    assert.equal(recreated.status, 200, JSON.stringify(recreated.body));
    assert.equal(recreated.body.instance.generation, previous.generation + 1);
    const deadline = Date.parse(recreated.body.instance.expiresAt);
    assert.ok(deadline >= before + 7200000 && deadline <= after + 7200000);
    assert.ok(!recreated.body.instance.endpoints.length);
    assert.equal((await json(`/api/admin/hosting/instances/${instance.id}/events`)).body.events[0].action, "INSTANCE_RECREATE_REQUESTED");
    assert.equal((await json(`/api/admin/hosting/instances/${instance.id}/terminal`, { user: player, method: "POST", body: { service: "web" } })).status, 403);
    assert.equal((await json(`/api/admin/hosting/instances/${instance.id}/terminal`, { method: "POST", body: { service: "web" } })).status, 409);
    await db.hostedInstance.update({ where: { id: instance.id }, data: { state: "RUNNING", observedGeneration: recreated.body.instance.generation } });
    const terminal = await json(`/api/admin/hosting/instances/${instance.id}/terminal`, { method: "POST", body: { service: "web" } });
    assert.equal(terminal.status, 200, JSON.stringify(terminal.body));
    const session = await db.instanceTerminalSession.findUnique({ where: { id: terminal.body.sessionId } });
    assert.equal(session.generation, recreated.body.instance.generation);
    assert.ok(!terminal.body.token.includes(session.tokenHash));
    assert.equal(session.userId, admin.id);
  });

  await t.test("registry APIs never return plaintext passwords or encrypted credential material", async () => {
    const saved = await json("/api/admin/hosting/registries", { method: "POST", body: { server: `${marker}.example.test`, username: "test-user", password: "TEST_PRIVATE_REGISTRY_PASSWORD" } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.registry.passwordEncrypted, undefined);
    const row = await db.registryCredential.findUnique({ where: { id: saved.body.registry.id } });
    assert.notEqual(row.passwordEncrypted, "TEST_PRIVATE_REGISTRY_PASSWORD");
    const list = await request("/api/admin/hosting/registries");
    const source = await list.text();
    assert.ok(!source.includes("TEST_PRIVATE_REGISTRY_PASSWORD"));
    assert.ok(!source.includes(row.passwordEncrypted));
    assert.equal((await json("/api/admin/hosting/registries", { user: player })).status, 403);
  });
});
