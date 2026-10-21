import { NextResponse } from "next/server";
import { cloneCompetition } from "@/lib/event-portability";
import { portabilityAdmin, readPortabilityJson, importOptions, logPortability } from "@/lib/portability-http";

export async function POST(request, { params }) {
  return portabilityAdmin(request, async (admin) => {
    const { id } = await params;
    const competition = await cloneCompetition(id, importOptions(await readPortabilityJson(request)));
    await logPortability(request, admin, "clone_competition", { sourceCompetitionId: id, competitionId: competition.id });
    return NextResponse.json({ competition }, { status: 201 });
  });
}
