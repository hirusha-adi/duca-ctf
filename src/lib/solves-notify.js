import { getSolveForFeed } from "@/lib/solve-feed";
import { publishSolveEvent } from "@/lib/solves-events";

export async function notifySolveCreated(solveId) {
  const solve = await getSolveForFeed(solveId);
  if (!solve) return;

  await publishSolveEvent({ type: "solve", solve });
}

export async function notifySolvesRefresh() {
  await publishSolveEvent({ type: "refresh" });
}
