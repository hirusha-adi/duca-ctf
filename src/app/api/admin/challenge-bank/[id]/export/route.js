import { prisma } from "@/lib/db";
import { PortabilityError, stringifyPortableYaml } from "@/lib/portability-schema.mjs";
import { portabilityAdmin, logPortability, yamlDownload } from "@/lib/portability-http";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  return portabilityAdmin(request, async (admin) => {
    const { id } = await params;
    const entry = await prisma.challengeBankEntry.findUnique({ where: { id } });
    if (!entry) throw new PortabilityError("Challenge bank entry not found", 404);
    await logPortability(request, admin, "export_challenge_bank_entry", { entryId: id });
    return yamlDownload(stringifyPortableYaml(entry.definition), `duca-challenge-${id}.yaml`);
  });
}
