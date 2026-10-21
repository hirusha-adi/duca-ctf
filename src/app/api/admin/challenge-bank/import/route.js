import { NextResponse } from "next/server";
import { saveChallengeBankDocument } from "@/lib/event-portability";
import { parsePortableYaml } from "@/lib/portability-schema.mjs";
import { portabilityAdmin, readPortabilityJson, logPortability } from "@/lib/portability-http";

export async function POST(request) {
  return portabilityAdmin(request, async (admin) => {
    const { yaml } = await readPortabilityJson(request);
    const entry = await saveChallengeBankDocument(parsePortableYaml(yaml, "challenge-bank"));
    await logPortability(request, admin, "import_challenge_bank_entry", { entryId: entry.id });
    return NextResponse.json({ entry: { id: entry.id, title: entry.title, categoryName: entry.categoryName } }, { status: 201 });
  });
}
