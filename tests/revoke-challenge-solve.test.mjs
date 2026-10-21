import test from "node:test";
import assert from "node:assert/strict";
import { revokeChallengeSolve } from "../src/lib/revoke-challenge-solve.mjs";

function database({ solves = [{ id: "flag-one", pointsAwarded: 150 }, { id: "flag-two", pointsAwarded: 0 }], user = { id: "player", email: "player@example.test", name: "Player" }, challenge = { id: "task", title: "Task", competitionId: "event", categoryId: "crypto", category: { name: "Crypto" }, competition: { name: "Event" } } } = {}) {
  const calls = [];
  const tx = {
    $executeRaw: async (_sql, key) => { calls.push(["lock", key]); },
    user: { findUnique: async () => { calls.push(["user"]); return user; } },
    challenge: { findUnique: async () => { calls.push(["challenge"]); return challenge; } },
    solve: {
      findMany: async (query) => { calls.push(["solves", query.where]); return solves; },
      deleteMany: async (query) => { calls.push(["delete", query.where]); return { count: solves.length }; },
    },
  };
  return { calls, db: { $transaction: async (operation) => operation(tx) } };
}

test("revocation takes challenge then user locks before reading and deleting solves", async () => {
  const { db, calls } = database();
  const result = await revokeChallengeSolve(db, "player", "task");
  assert.deepEqual(calls.slice(0, 2), [["lock", "task"], ["lock", "user:player"]]);
  assert.deepEqual(calls.at(-1), ["delete", { userId: "player", challengeId: "task" }]);
  assert.equal(result.pointsRemoved, 150);
  assert.equal(result.result.count, 2);
  assert.equal(result.user.email, "player@example.test");
  assert.equal(result.challenge.competition.name, "Event");
});

test("a missing solve returns 404 without deleting or altering hint purchases", async () => {
  const { db, calls } = database({ solves: [] });
  await assert.rejects(revokeChallengeSolve(db, "player", "task"), { status: 404, message: "User has not solved this challenge" });
  assert.equal(calls.some(([operation]) => operation === "delete"), false);
});

test("missing users and challenges retain useful 404 outcomes", async () => {
  for (const input of [{ user: null }, { challenge: null }]) {
    const { db, calls } = database(input);
    await assert.rejects(revokeChallengeSolve(db, "player", "task"), { status: 404 });
    assert.equal(calls.some(([operation]) => operation === "delete"), false);
  }
});
