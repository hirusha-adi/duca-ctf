import test from "node:test";
import assert from "node:assert/strict";
import { rankCompetitionScores } from "../src/lib/leaderboard-ranking.mjs";

const award = (userId, points, solvedAt) => ({ userId, _sum: { pointsAwarded: points }, _max: { solvedAt } });
const hint = (userId, costPaid) => ({ userId, _sum: { costPaid } });
const users = ["alice", "bob", "carol"].map((id) => ({ id, name: id }));

test("paid hint snapshots reduce ranking scores without revaluing saved awards", () => {
  const ranked = rankCompetitionScores([
    award("alice", 200, "2026-01-01T00:01:00Z"),
    award("bob", 180, "2026-01-01T00:02:00Z"),
  ], [hint("alice", 40)], users);
  assert.deepEqual(ranked.map((row) => [row.user.id, row.score]), [["bob", 180], ["alice", 160]]);
});

test("equal net scores retain the last scoring solve tiebreaker", () => {
  const ranked = rankCompetitionScores([
    award("alice", 200, "2026-01-01T00:01:00Z"),
    award("bob", 180, "2026-01-01T00:02:00Z"),
  ], [hint("alice", 20)], users);
  assert.deepEqual(ranked.map((row) => row.user.id), ["alice", "bob"]);
});

test("paid hint history is preserved when an admin removes all of a user's solves", () => {
  const ranked = rankCompetitionScores([], [hint("carol", 30)], users);
  assert.deepEqual(ranked.map((row) => [row.user.id, row.score]), [["carol", -30]]);
});

test("fully equal scores have stable user ordering", () => {
  const time = "2026-01-01T00:01:00Z";
  const ranked = rankCompetitionScores([award("bob", 100, time), award("alice", 100, time)], [], [...users].reverse());
  assert.deepEqual(ranked.map((row) => row.user.id), ["alice", "bob"]);
});
