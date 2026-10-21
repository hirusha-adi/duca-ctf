import { exportCompetitionDocument } from "@/lib/event-portability";
import { stringifyPortableYaml } from "@/lib/portability-schema.mjs";
import { portabilityAdmin, logPortability, yamlDownload } from "@/lib/portability-http";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  return portabilityAdmin(request, async (admin) => {
    const { id } = await params;
    const document = await exportCompetitionDocument(id);
    await logPortability(request, admin, "export_competition", { competitionId: id });
    return yamlDownload(stringifyPortableYaml(document), `duca-event-${id}.yaml`);
  });
}
