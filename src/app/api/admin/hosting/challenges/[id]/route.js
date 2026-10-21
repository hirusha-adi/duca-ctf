import { hostingRequest, readHostingJson } from "@/lib/hosting/http";
import { getHostedChallengeConfiguration, updateHostedChallengeConfiguration } from "@/lib/hosting/service";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  return hostingRequest("admin", async () => getHostedChallengeConfiguration((await params).id));
}

export async function PATCH(request, { params }) {
  return hostingRequest("admin", async (user) => updateHostedChallengeConfiguration(user, (await params).id, await readHostingJson(request)));
}
