/** Combine database aggregates; stored awards and hint purchases are historical. */
export function rankCompetitionScores(solveTotals, hintTotals, users) {
  const scores = new Map();
  for (const row of solveTotals) {
    scores.set(row.userId, {
      score: row._sum.pointsAwarded ?? 0,
      lastSolve: row._max.solvedAt,
    });
  }
  for (const row of hintTotals) {
    const entry = scores.get(row.userId) ?? { score: 0, lastSolve: null };
    entry.score -= row._sum.costPaid ?? 0;
    scores.set(row.userId, entry);
  }

  const time = (value) => value == null ? Infinity : new Date(value).getTime();
  return users
    .filter((user) => scores.has(user.id))
    .map((user) => ({ user, ...scores.get(user.id) }))
    .sort((a, b) =>
      b.score - a.score ||
      time(a.lastSolve) - time(b.lastSolve) ||
      a.user.id.localeCompare(b.user.id)
    );
}
