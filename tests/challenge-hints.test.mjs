import test from "node:test";
import assert from "node:assert/strict";
import { getPrerequisiteProgress, normalizeHints, normalizePrerequisiteIds, serializePlayerHint, serializePlayerHints, wouldCreatePrerequisiteCycle } from "../src/lib/challenge-rules.mjs";
import { purchaseHintWithClient } from "../src/lib/hint-purchase.mjs";

test("prerequisites reject self and indirect cycles without treating replaced edges as active", () => {
  const edges = [
    { challengeId: "a", requiredChallengeId: "b" },
    { challengeId: "b", requiredChallengeId: "c" },
  ];
  assert.equal(wouldCreatePrerequisiteCycle("a", ["a"], edges), true);
  assert.equal(wouldCreatePrerequisiteCycle("c", ["a"], edges), true);
  assert.equal(wouldCreatePrerequisiteCycle("b", [], edges), false);
  assert.equal(wouldCreatePrerequisiteCycle("a", ["c"], edges), false);
});

test("prerequisite IDs are validated, normalized, and deduplicated", () => {
  assert.deepEqual(normalizePrerequisiteIds([" a ", "a", "b"]), ["a", "b"]);
  assert.throws(() => normalizePrerequisiteIds("a"), /valid prerequisite/);
  assert.throws(() => normalizePrerequisiteIds([""]), /valid prerequisite/);
});

test("hint configuration rejects negative, fractional, duplicate, and missing values", () => {
  const valid = { content: "Try a dictionary", cost: 10 };
  assert.equal(normalizeHints([valid])[0].title, "Hint 1");
  for (const cost of [-1, 0.5, Number.NaN, 1000001]) assert.throws(() => normalizeHints([{ ...valid, cost }]), /Hint costs/);
  assert.throws(() => normalizeHints([{ ...valid, id: "same" }, { ...valid, id: "same" }]), /unique/);
  assert.throws(() => normalizeHints([{ cost: 0 }]), /needs content/);
});

test("locked hint serialization omits its body and content format", () => {
  const hint = { id: "hint", title: "Start here", cost: 25, content: "secret answer", contentFormat: "MARKDOWN" };
  const locked = serializePlayerHint(hint);
  assert.equal(Object.hasOwn(locked, "content"), false);
  assert.equal(Object.hasOwn(locked, "contentFormat"), false);
  assert.equal(JSON.stringify(locked).includes("secret answer"), false);
  const unlocked = serializePlayerHint(hint, { costPaid: 10 });
  assert.equal(unlocked.content, "secret answer");
  assert.equal(unlocked.costPaid, 10);
});

test("retired hints remain readable to their purchaser and stay absent for other players and admin authoring previews", () => {
  const retired = { id: "old", title: "Old hint", cost: 80, content: "Previously purchased help", contentFormat: "MARKDOWN", retired: true, unlocks: [{ costPaid: 10 }] };
  const [purchased] = serializePlayerHints([retired]);
  assert.equal(purchased.content, "Previously purchased help");
  assert.equal(purchased.costPaid, 10);
  assert.deepEqual(serializePlayerHints([{ ...retired, unlocks: [] }]), []);
  assert.deepEqual(serializePlayerHints([retired], { preview: true }), []);
});

test("progression requires every prerequisite and accepts zero-point and retired-flag historical solves", () => {
  const historicalSolves = [{ challengeId: "a", pointsAwarded: 0, flag: { retired: true } }];
  const solvedIds = new Set(historicalSolves.map((solve) => solve.challengeId));
  assert.deepEqual(getPrerequisiteProgress(["a"], solvedIds), { total: 1, solved: 1, unlocked: true });
  assert.deepEqual(getPrerequisiteProgress(["a", "b"], solvedIds), { total: 2, solved: 1, unlocked: false });
  assert.equal(getPrerequisiteProgress([], new Set()).unlocked, true);
});

function purchaseFixture({ cost = 40, earned = 100, spent = 0, unlocked = null, available = true, prerequisites = true, retired = false } = {}) {
  const events = [];
  const hint = { id: "hint", challengeId: "challenge", title: "Help", content: "secret", contentFormat: "MARKDOWN", cost, retired, challenge: { id: "challenge", competitionId: "event", hidden: false, competition: { id: "event", hidden: false } } };
  let existing = unlocked;
  const tx = {
    $executeRaw: async (strings, ...values) => { events.push({ lock: values[0] }); },
    hint: { findFirst: async () => hint },
    hintUnlock: {
      findUnique: async () => existing,
      aggregate: async (query) => { events.push({ spentQuery: query }); return { _sum: { costPaid: spent } }; },
      create: async ({ data }) => { events.push({ created: data }); existing = data; return data; },
    },
    solve: { aggregate: async (query) => { events.push({ earnedQuery: query }); return { _sum: { pointsAwarded: earned } }; } },
  };
  const db = { $transaction: async (callback) => callback(tx) };
  const purchase = (expectedCost) => purchaseHintWithClient(db, { userId: "player", challengeId: "challenge", hintId: "hint", expectedCost }, {
    isChallengeAvailable: () => available,
    getChallengePrerequisiteStatus: async () => ({ unlocked: prerequisites }),
  });
  return { purchase, events, hint };
}

test("a paid hint locks challenge then user and charges its current cost exactly once", async () => {
  const fixture = purchaseFixture({ spent: 20 });
  const first = await fixture.purchase();
  fixture.hint.cost = 80;
  const second = await fixture.purchase();
  assert.deepEqual(fixture.events.slice(0, 2), [{ lock: "challenge" }, { lock: "user:player" }]);
  assert.equal(first.balance, 40);
  assert.equal(first.unlock.costPaid, 40);
  assert.equal(second.unlock.costPaid, 40);
  assert.equal(second.charged, false);
  assert.equal(fixture.events.filter((event) => event.created).length, 1);
  const earned = fixture.events.find((event) => event.earnedQuery).earnedQuery;
  const spent = fixture.events.find((event) => event.spentQuery).spentQuery;
  assert.deepEqual(earned.where, { userId: "player", challenge: { competitionId: "event" } });
  assert.deepEqual(spent.where, { userId: "player", hint: { challenge: { competitionId: "event" } } });
});

test("a hint purchase cannot overspend or use points from another competition", async () => {
  const fixture = purchaseFixture({ earned: 50, spent: 20, cost: 40 });
  await assert.rejects(fixture.purchase(), (error) => error.status === 409);
  assert.equal(fixture.events.some((event) => event.created), false);
});

test("free hints unlock for a player with no points", async () => {
  const fixture = purchaseFixture({ earned: 0, cost: 0 });
  const result = await fixture.purchase();
  assert.equal(result.unlock.costPaid, 0);
  assert.equal(result.charged, false);
});

test("locked challenges and retired hints cannot be purchased", async () => {
  for (const options of [{ available: false }, { prerequisites: false }, { retired: true }]) {
    const fixture = purchaseFixture(options);
    await assert.rejects(fixture.purchase(), (error) => [403, 404].includes(error.status));
    assert.equal(fixture.events.some((event) => event.created), false);
  }
});

test("an existing retired hint purchase keeps its historical cost without charging again", async () => {
  const fixture = purchaseFixture({ retired: true, cost: 80, earned: 0, unlocked: { userId: "player", hintId: "hint", costPaid: 10 } });
  const result = await fixture.purchase();
  assert.equal(result.unlock.costPaid, 10);
  assert.equal(result.charged, false);
  assert.equal(fixture.events.some((event) => event.created), false);
});

test("a changed displayed hint price is rejected before charging, including a free hint becoming paid", async () => {
  for (const expectedCost of [0, 20, 80]) {
    const fixture = purchaseFixture({ cost: 40 });
    await assert.rejects(fixture.purchase(expectedCost), (error) => error.status === 409 && error.code === "HINT_PRICE_CHANGED");
    assert.equal(fixture.events.some((event) => event.created), false);
  }
  const fixture = purchaseFixture({ cost: 40 });
  const result = await fixture.purchase(40);
  assert.equal(result.unlock.costPaid, 40);
});

test("an existing hint purchase ignores a stale displayed price and keeps the original charge", async () => {
  const fixture = purchaseFixture({ cost: 80, unlocked: { userId: "player", hintId: "hint", costPaid: 10 } });
  const result = await fixture.purchase(40);
  assert.equal(result.unlock.costPaid, 10);
  assert.equal(result.charged, false);
  assert.equal(fixture.events.some((event) => event.created), false);
});
