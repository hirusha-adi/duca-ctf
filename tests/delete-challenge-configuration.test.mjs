import test from "node:test";
import assert from "node:assert/strict";
import { deleteChallengeConfiguration, deleteCompetitionConfiguration } from "../src/lib/delete-challenge-configuration.mjs";

function database({ dependent = null, competition = { id: "event" } } = {}) {
  const calls = [];
  const tx = {
    $executeRaw: async (sql, key) => { calls.push(["lock", key ?? (sql.join("").includes("challenge-prerequisites") ? "challenge-prerequisites" : "unknown")]); },
    challengePrerequisite: {
      findFirst: async (query) => { calls.push(["dependency", query.where]); return dependent; },
      deleteMany: async (query) => { calls.push(["remove-edges", query.where]); return { count: 1 }; },
    },
    challenge: { delete: async (query) => { calls.push(["delete-challenge", query.where]); return query.where; } },
    competition: {
      findUnique: async () => competition,
      delete: async (query) => { calls.push(["delete-event", query.where]); return query.where; },
    },
  };
  return { calls, db: { $transaction: async (operation) => operation(tx) } };
}

test("a prerequisite target cannot be deleted and silently unlock its dependents", async () => {
  const { db, calls } = database({ dependent: { challengeId: "child" } });
  await assert.rejects(deleteChallengeConfiguration(db, "parent"), { status: 409 });
  assert.deepEqual(calls.slice(0, 2), [["lock", "parent"], ["lock", "challenge-prerequisites"]]);
  assert.equal(calls.some(([operation]) => operation.startsWith("delete") || operation === "remove-edges"), false);
});

test("a challenge without dependents retains explicit deletion behavior", async () => {
  const { db, calls } = database();
  await deleteChallengeConfiguration(db, "task");
  assert.deepEqual(calls.at(-1), ["delete-challenge", { id: "task" }]);
});

test("deleting an event first removes only its own source graph edges", async () => {
  const { db, calls } = database();
  await deleteCompetitionConfiguration(db, "event");
  assert.deepEqual(calls[0], ["lock", "challenge-prerequisites"]);
  assert.deepEqual(calls.slice(-2), [
    ["remove-edges", { challenge: { competitionId: "event" } }],
    ["delete-event", { id: "event" }],
  ]);
});

test("an external dependent blocks an event deletion instead of losing its prerequisite", async () => {
  const { db, calls } = database({ dependent: { challengeId: "outside" } });
  await assert.rejects(deleteCompetitionConfiguration(db, "event"), { status: 409 });
  assert.equal(calls.some(([operation]) => operation === "remove-edges" || operation === "delete-event"), false);
});

test("missing events have a clear 404 without deleting any graph rows", async () => {
  const { db, calls } = database({ competition: null });
  await assert.rejects(deleteCompetitionConfiguration(db, "event"), { status: 404 });
  assert.equal(calls.length, 1);
});
