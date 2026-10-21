import { hostingRequest, readHostingBody } from "@/lib/hosting/http";
import { updateHostedChallengeConfiguration } from "@/lib/hosting/service";
import { parseHostingBundle } from "@/lib/hosting/template.mjs";
import { hostingError } from "@/lib/hosting/control-plane.mjs";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  return hostingRequest("admin", async (user) => {
    let bytes = await readHostingBody(request, 12 * 1024 * 1024);
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      let form;
      try {
        form = await new Request(request.url, { method: "POST", headers: request.headers, body: bytes }).formData();
      } catch {
        throw hostingError("Provide a valid ZIP upload");
      }
      const file = form.get("file");
      if (!file || typeof file === "string" || file.size > 10 * 1024 * 1024) throw hostingError("Provide a ZIP file of at most 10 MiB");
      bytes = Buffer.from(await file.arrayBuffer());
    }
    if (bytes.length > 10 * 1024 * 1024) throw hostingError("ZIP files must be at most 10 MiB", 413);
    const template = await parseHostingBundle(bytes);
    return updateHostedChallengeConfiguration(user, (await params).id, { template, hosted: true });
  });
}
