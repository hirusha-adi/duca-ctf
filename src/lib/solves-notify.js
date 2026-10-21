import { getSolveForFeed } from "@/lib/solve-feed";
import { publishSolveEvent } from "@/lib/solves-events";
import { scheduleNotification } from "./background-notifications";

export function notifySolveCreated(solveId) {
  scheduleNotification("Solve", async () => {
    const solve = await getSolveForFeed(solveId);
    if (!solve) return;
    await publishSolveEvent({ type: "solve", solve });
  });
}

export function notifySolvesRefresh() {
  scheduleNotification("Solve refresh", () => publishSolveEvent({ type: "refresh" }));
}
