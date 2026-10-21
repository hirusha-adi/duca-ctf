import { hostingRequest, readHostingJson } from "@/lib/hosting/http";
import { currentHostingUsage, getHostingSettings, updateHostingSettings } from "@/lib/hosting/service";

export const dynamic = "force-dynamic";

export async function GET() {
  return hostingRequest("admin", async () => ({ settings: await getHostingSettings(), usage: await currentHostingUsage() }));
}

export async function PATCH(request) {
  return hostingRequest("admin", async (user) => ({ settings: await updateHostingSettings(user, await readHostingJson(request, 16384)), usage: await currentHostingUsage() }));
}
