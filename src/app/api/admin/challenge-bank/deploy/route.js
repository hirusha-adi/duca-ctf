import { NextResponse } from "next/server";
import { deployChallengeBankEntries } from "@/lib/event-portability";
import { portabilityAdmin, readPortabilityJson, logPortability } from "@/lib/portability-http";

export async function POST(request) {
  return portabilityAdmin(request, async (admin) => {
    const { entryIds, competitionId } = await readPortabilityJson(request);
    const challenges = await deployChallengeBankEntries(entryIds, competitionId);
    await logPortability(request, admin, "deploy_challenge_bank_entries", { competitionId, entryIds, challengeCount: challenges.length });
    return NextResponse.json({ challenges }, { status: 201 });
  });
}
