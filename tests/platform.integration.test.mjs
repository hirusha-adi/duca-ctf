import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { sealData } from "iron-session";

const databaseUrl = process.env.DUCA_TEST_DATABASE_URL;
const baseUrl = process.env.DUCA_TEST_BASE_URL;
const password = process.env.DUCA_TEST_SESSION_SECRET;
const require = createRequire(import.meta.url);

test("platform HTTP workflows against an isolated migrated database", {
  skip: !databaseUrl || !baseUrl || !password,
  timeout: 240000,
}, async (t) => {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const { Pool } = require("pg");
  const bcrypt = require("bcryptjs");
  const db = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: databaseUrl })) });
  const readyDeadline = Date.now() + 30000;
  let ready = false;
  while (!ready && Date.now() < readyDeadline) {
    try { ready = (await fetch(baseUrl, { signal: AbortSignal.timeout(1500) })).ok; }
    catch { /* Containers may still be applying migrations and seeding. */ }
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) { await db.$disconnect(); assert.fail("The test app did not become ready within 30 seconds"); }
  const marker = `integration-${randomUUID()}`;
  const category = await db.category.create({ data: { name: marker, slug: marker } });
  const admin = await db.user.create({ data: { email: `${marker}-admin@example.test`, name: "Test admin", role: "ADMIN", profileComplete: true } });
  const player = await db.user.create({ data: { email: `${marker}-player@example.test`, name: "Test player", profileComplete: true } });
  const outsider = await db.user.create({ data: { email: `${marker}-outsider@example.test`, name: "Other player", profileComplete: true } });
  const cookies = new Map();
  for (const user of [admin, player, outsider]) {
    cookies.set(user.id, `duca_ctf_session=${await sealData({ userId: user.id }, { password, ttl: 3600 })}`);
  }
  const competition = await db.competition.create({ data: {
    name: marker, slug: marker, startAt: new Date(Date.now() - 3600000), endAt: new Date(Date.now() + 86400000), status: "ACTIVE",
  } });
  const destination = await db.competition.create({ data: {
    name: `${marker}-destination`, slug: `${marker}-destination`, startAt: competition.startAt, endAt: competition.endAt, status: "DRAFT", hidden: true,
  } });
  const createChallenge = async (slug, points, values, extra = {}) => db.challenge.create({ data: {
    competitionId: competition.id, categoryId: category.id, title: `${marker}-${slug}`, slug,
    points, startAt: competition.startAt, ...extra,
    flags: { create: await Promise.all(values.map(async (value, order) => ({ value, flagHash: await bcrypt.hash(value, 4), order }))) },
  }, include: { flags: true } });
  const parent = await createChallenge("parent", 100, ["DUCA{first}", "DUCA{second}"]);
  const child = await createChallenge("child", 200, ["DUCA{child}"], { description: "PREREQUISITE_SECRET_CONTENT" });
  await db.challengePrerequisite.create({ data: { challengeId: child.id, requiredChallengeId: parent.id } });
  const hint = await db.hint.create({ data: { challengeId: child.id, title: "Paid hint", content: "PAID_HINT_SECRET", cost: 20 } });
  const expensive = await db.hint.create({ data: { challengeId: child.id, title: "Expensive", content: "EXPENSIVE_SECRET", cost: 100 } });
  const free = await db.hint.create({ data: { challengeId: child.id, title: "Free hint", content: "FREE_HINT_SECRET", cost: 0 } });

  async function request(url, { user = admin, method = "GET", body, form, signal } = {}) {
    const response = await fetch(`${baseUrl}${url}`, {
      method,
      signal,
      headers: { ...(user ? { cookie: cookies.get(user.id) } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: form || (body ? JSON.stringify(body) : undefined),
    });
    return response;
  }
  async function json(url, options) {
    const response = await request(url, options);
    const body = await response.json();
    return { status: response.status, body };
  }

  t.after(async () => {
    const events = await db.competition.findMany({ where: { name: { startsWith: marker } }, select: { id: true } });
    const eventIds = events.map((event) => event.id);
    await db.challengePrerequisite.deleteMany({ where: { challenge: { competitionId: { in: eventIds } } } });
    await db.competition.deleteMany({ where: { id: { in: eventIds } } });
    await db.challengeBankEntry.deleteMany({ where: { title: { startsWith: marker } } });
    await db.user.deleteMany({ where: { id: { in: [admin.id, player.id, outsider.id] } } });
    await db.category.delete({ where: { id: category.id } });
    await db.$disconnect();
  });

  await t.test("prerequisites block content, hints and submissions", async () => {
    const page = await request(`/challenges/${child.id}`, { user: player });
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.ok(!html.includes("PREREQUISITE_SECRET_CONTENT"));
    assert.ok(!html.includes("PAID_HINT_SECRET"));
    assert.equal((await json(`/api/challenges/${child.id}/submit`, { user: player, method: "POST", body: { flag: "DUCA{child}" } })).status, 403);
    assert.equal((await json(`/api/challenges/${child.id}/hints/${hint.id}/unlock`, { user: player, method: "POST", body: {} })).status, 403);
    assert.equal((await json(`/api/challenges/${child.id}/hints/${hint.id}/unlock`, { user: null, method: "POST", body: {} })).status, 401);
  });

  await t.test("concurrent different flags award challenge points once", async () => {
    const outcomes = await Promise.all(["DUCA{first}", "DUCA{second}"].map((flag) => json(`/api/challenges/${parent.id}/submit`, { user: player, method: "POST", body: { flag } })));
    assert.deepEqual(outcomes.map((outcome) => outcome.status), [200, 200]);
    assert.equal(outcomes.reduce((sum, outcome) => sum + outcome.body.pointsAwarded, 0), 100);
    assert.equal(await db.solve.count({ where: { userId: player.id, challengeId: parent.id } }), 2);
    const page = await request(`/challenges/${child.id}`, { user: player });
    const html = await page.text();
    assert.ok(html.includes("PREREQUISITE_SECRET_CONTENT"));
    assert.ok(!html.includes("PAID_HINT_SECRET"));
  });

  await t.test("concurrent hint unlock charges once and checks event balance", async () => {
    const unlock = () => json(`/api/challenges/${child.id}/hints/${hint.id}/unlock`, { user: player, method: "POST", body: {} });
    const results = await Promise.all([unlock(), unlock()]);
    assert.deepEqual(results.map((result) => result.status), [200, 200]);
    assert.equal(results.filter((result) => result.body.charged).length, 1);
    assert.equal(results[0].body.hint.content, "PAID_HINT_SECRET");
    assert.equal(await db.hintUnlock.count({ where: { userId: player.id, hintId: hint.id } }), 1);
    assert.equal((await json(`/api/challenges/${child.id}/hints/${expensive.id}/unlock`, { user: player, method: "POST", body: {} })).status, 409);
    assert.equal((await json(`/api/challenges/${child.id}/hints/${free.id}/unlock`, { user: player, method: "POST", body: {} })).status, 200);
  });

  await t.test("challenge edits retire flags and preserve historical points atomically", async () => {
    const invalid = await json(`/api/admin/challenges/${parent.id}`, { method: "PATCH", body: { title: "SHOULD_NOT_SAVE", flags: [] } });
    assert.equal(invalid.status, 400);
    assert.equal((await db.challenge.findUnique({ where: { id: parent.id } })).title, parent.title);
    const edited = await json(`/api/admin/challenges/${parent.id}`, { method: "PATCH", body: {
      points: 250, hidden: true, flags: [{ id: parent.flags[0].id, value: "DUCA{changed}", label: "Updated answer" }],
    } });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal((await db.flag.findUnique({ where: { id: parent.flags[1].id } })).retired, true);
    const results = await db.solve.aggregate({ where: { userId: player.id, challengeId: parent.id }, _sum: { pointsAwarded: true }, _count: true });
    assert.equal(results._sum.pointsAwarded, 100);
    assert.equal(results._count, 2);
    const summary = await json("/api/user/points", { user: player });
    assert.equal(summary.status, 200);
    assert.equal(summary.body.overallTotal, 80);
    assert.equal((await json(`/api/admin/challenges/${parent.id}`, { method: "PATCH", body: { competitionId: destination.id } })).status, 409);
    await json(`/api/admin/challenges/${parent.id}`, { method: "PATCH", body: { hidden: false } });
    const retired = await json(`/api/challenges/${parent.id}/submit`, { user: outsider, method: "POST", body: { flag: "DUCA{second}" } });
    assert.equal(retired.status, 400);
  });

  await t.test("hint edits keep original purchase costs and prerequisite cycles are rejected", async () => {
    const edited = await json(`/api/admin/challenges/${child.id}`, { method: "PATCH", body: {
      hints: [{ id: hint.id, title: "Updated hint", content: "NEW_HINT", cost: 75, contentFormat: "MARKDOWN" }],
    } });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    const purchase = await db.hintUnlock.findUnique({ where: { userId_hintId: { userId: player.id, hintId: hint.id } } });
    assert.equal(purchase.costPaid, 20);
    const cyclic = await json(`/api/admin/challenges/${parent.id}`, { method: "PATCH", body: { prerequisiteIds: [child.id] } });
    assert.equal(cyclic.status, 400);
    assert.equal(await db.challengePrerequisite.count({ where: { challengeId: parent.id } }), 0);
    const retired = await json(`/api/admin/challenges/${child.id}`, { method: "PATCH", body: {
      hints: [{ title: "Portable hint", content: "EXPORT_HINT_CONTENT", cost: 5, contentFormat: "MARKDOWN" }],
    } });
    assert.equal(retired.status, 200);
    assert.equal((await db.hint.findUnique({ where: { id: hint.id } })).retired, true);
    const page = await request(`/challenges/${child.id}`, { user: player });
    const html = await page.text();
    assert.ok(html.includes("NEW_HINT"), "Purchased retired hints stay readable");
    assert.ok(!html.includes("EXPORT_HINT_CONTENT"), "Unpurchased hint bodies stay private");
  });

  let imageUrl;
  await t.test("uploads survive absolute storage paths and support files enforce ticket access", async () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6mS8AAAAASUVORK5CYII=", "base64");
    const form = new FormData();
    form.append("file", new File([png], "tiny.png", { type: "image/png" }));
    const upload = await (await request("/api/upload", { method: "POST", form })).json();
    assert.ok(upload.url, JSON.stringify(upload));
    imageUrl = upload.url;
    const download = await request(upload.url, { user: null });
    assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
    await db.challenge.update({ where: { id: child.id }, data: { description: `![image](${imageUrl})` } });
    const attachmentForm = new FormData();
    attachmentForm.append("file", new File(["private notes"], "notes.txt", { type: "text/plain" }));
    const attachment = await (await request("/api/support/upload", { user: player, method: "POST", form: attachmentForm })).json();
    assert.ok(attachment.url, JSON.stringify(attachment));
    const ticket = await json("/api/support/tickets", { user: player, method: "POST", body: { subject: "Attachment test", body: "See notes", attachments: [attachment] } });
    assert.equal(ticket.status, 201, JSON.stringify(ticket.body));
    const spoofed = await json("/api/support/tickets", { user: outsider, method: "POST", body: { subject: "Forged attachment", body: "Spoof", attachments: [attachment] } });
    assert.equal(spoofed.status, 400, "Another uploader's signed attachment cannot grant ticket access");
    assert.equal((await request(attachment.url, { user: null })).status, 401);
    assert.equal((await request(attachment.url, { user: outsider })).status, 404);
    assert.equal((await request(attachment.url, { user: player })).status, 200);
    assert.equal((await request(attachment.url)).status, 200);
    assert.equal((await request(attachment.url, { user: player })).headers.get("cache-control"), "private, no-store");
  });

  await t.test("event cloning and YAML round trips preserve content without participant history", async () => {
    const clone = await json(`/api/admin/competitions/${competition.id}/clone`, { method: "POST", body: { name: `${marker}-clone`, startAt: "2030-01-01T00:00:00Z" } });
    assert.equal(clone.status, 201, JSON.stringify(clone.body));
    const cloned = await db.competition.findFirst({ where: { name: `${marker}-clone` }, include: { challenges: { include: { flags: true, hints: true, prerequisites: true, solves: true } } } });
    assert.equal(cloned.hidden, true);
    assert.equal(cloned.status, "DRAFT");
    assert.equal(cloned.challenges.length, 2);
    assert.ok(cloned.challenges.every((challenge) => challenge.solves.length === 0));
    assert.ok(cloned.challenges.every((challenge) => challenge.id !== parent.id && challenge.id !== child.id));
    assert.equal(cloned.challenges.reduce((sum, challenge) => sum + challenge.prerequisites.length, 0), 1);
    assert.equal(cloned.challenges.reduce((sum, challenge) => sum + challenge.flags.length, 0), 2);
    assert.equal(cloned.challenges.reduce((sum, challenge) => sum + challenge.hints.length, 0), 1);
    const exported = await request(`/api/admin/competitions/${competition.id}/export`);
    assert.equal(exported.status, 200);
    const yaml = await exported.text();
    assert.ok(yaml.includes("DUCA{changed}"));
    assert.ok(!yaml.includes("DUCA{second}"));
    const imported = await json("/api/admin/competitions/import", { method: "POST", body: { yaml, name: `${marker}-import` } });
    assert.equal(imported.status, 201, JSON.stringify(imported.body));
    const importedEvent = await db.competition.findFirst({ where: { name: `${marker}-import` }, include: { challenges: { include: { hints: true, prerequisites: true } } } });
    assert.equal(importedEvent.hidden, true);
    assert.equal(importedEvent.challenges.length, 2);
    const importedChild = importedEvent.challenges.find((challenge) => challenge.title === child.title);
    assert.ok(importedChild.description.includes("/uploads/writeups/"));
    assert.ok(!importedChild.description.includes(imageUrl));
    const localImage = importedChild.description.match(/\/uploads\/writeups\/[0-9a-f-]+\.png/)[0];
    assert.equal((await request(localImage, { user: null })).status, 200);
    const invalid = await json("/api/admin/competitions/import", { method: "POST", body: { yaml: "format: invalid\nversion: 999" } });
    assert.equal(invalid.status, 400);
  });

  await t.test("challenge bank snapshots deploy prerequisite closures and export/import YAML", async () => {
    const save = await json("/api/admin/challenge-bank", { method: "POST", body: { challengeId: child.id } });
    assert.equal(save.status, 201, JSON.stringify(save.body));
    const entry = await db.challengeBankEntry.findFirst({ where: { title: child.title } });
    assert.ok(entry);
    const deployed = await json("/api/admin/challenge-bank/deploy", { method: "POST", body: { entryIds: [entry.id], competitionId: destination.id } });
    assert.equal(deployed.status, 201, JSON.stringify(deployed.body));
    const challenges = await db.challenge.findMany({ where: { competitionId: destination.id }, include: { prerequisites: true } });
    assert.equal(challenges.length, 2);
    assert.ok(challenges.every((challenge) => challenge.hidden));
    assert.equal(challenges.reduce((sum, challenge) => sum + challenge.prerequisites.length, 0), 1);
    const exported = await request(`/api/admin/challenge-bank/${entry.id}/export`);
    assert.equal(exported.status, 200);
    const imported = await json("/api/admin/challenge-bank/import", { method: "POST", body: { yaml: await exported.text() } });
    assert.equal(imported.status, 201, JSON.stringify(imported.body));
    assert.equal((await json("/api/admin/challenge-bank", { user: player })).status, 403);
  });

  await t.test("explicit deletion handles prerequisite edges without silently unlocking challenges", async () => {
    const dependent = await json(`/api/admin/challenges/${parent.id}`, { method: "DELETE" });
    assert.equal(dependent.status, 409, JSON.stringify(dependent.body));
    assert.equal(await db.challengePrerequisite.count({ where: { challengeId: child.id } }), 1);
    const clone = await db.competition.findFirst({ where: { name: `${marker}-clone` } });
    const removed = await json(`/api/admin/competitions/${clone.id}`, { method: "DELETE" });
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.equal(await db.competition.count({ where: { id: clone.id } }), 0);
  });

  await t.test("a saved solve reaches the live SSE stream", { timeout: 15000 }, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let reader;
    try {
      const response = await request(`/api/solves/stream?competitionId=${competition.id}`, { user: null, signal: controller.signal });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /text\/event-stream/);
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = decoder.decode((await reader.read()).value);
      assert.ok(text.includes('"connected"'));
      const outcome = await json(`/api/challenges/${child.id}/submit`, { user: player, method: "POST", body: { flag: "DUCA{child}" } });
      assert.equal(outcome.status, 200);
      while (!text.includes('"type":"solve"')) {
        const chunk = await reader.read();
        assert.equal(chunk.done, false);
        text += decoder.decode(chunk.value, { stream: true });
      }
      assert.ok(text.includes(child.id));
      assert.ok(text.includes(player.id));
      assert.equal(await db.solve.count({ where: { userId: player.id, challengeId: child.id } }), 1);
    } finally {
      clearTimeout(timer);
      controller.abort();
      if (reader) await reader.cancel().catch(() => {});
    }
  });
});
