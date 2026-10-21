import { NextResponse } from "next/server";
import { importCompetitionDocument } from "@/lib/event-portability";
import { parsePortableYaml } from "@/lib/portability-schema.mjs";
import { portabilityAdmin, readPortabilityJson, importOptions, logPortability } from "@/lib/portability-http";

export async function POST(request) {
  return portabilityAdmin(request, async (admin) => {
    const body = await readPortabilityJson(request);
    const document = parsePortableYaml(body.yaml, "competition");
    const competition = await importCompetitionDocument(document, importOptions(body));
    await logPortability(request, admin, "import_competition", { competitionId: competition.id, challengeCount: document.challenges.length });
    return NextResponse.json({ competition }, { status: 201 });
  });
}
