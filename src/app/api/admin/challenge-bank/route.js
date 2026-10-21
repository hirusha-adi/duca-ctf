import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { snapshotChallengeForBank, saveChallengeBankDocument } from "@/lib/event-portability";
import { PortabilityError } from "@/lib/portability-schema.mjs";
import { portabilityAdmin, readPortabilityJson, logPortability } from "@/lib/portability-http";

export async function GET(request) {
  return portabilityAdmin(request, async () => {
    const entries = await prisma.challengeBankEntry.findMany({ orderBy: { updatedAt: "desc" }, select: { id: true, title: true, categoryName: true, createdAt: true, updatedAt: true } });
    return NextResponse.json({ entries }, { headers: { "Cache-Control": "private, no-store" } });
  });
}

export async function POST(request) {
  return portabilityAdmin(request, async (admin) => {
    const { challengeId } = await readPortabilityJson(request);
    if (typeof challengeId !== "string" || !challengeId || challengeId.length > 100) throw new PortabilityError("Select a challenge to save");
    const document = await snapshotChallengeForBank(challengeId);
    const entry = await saveChallengeBankDocument(document);
    await logPortability(request, admin, "save_challenge_bank_entry", { entryId: entry.id, challengeId });
    return NextResponse.json({ entry: { id: entry.id, title: entry.title, categoryName: entry.categoryName } }, { status: 201 });
  });
}
