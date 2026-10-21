import { hostingRequest, readHostingJson } from "@/lib/hosting/http";
import { issueInstanceTerminal } from "@/lib/hosting/service";

export async function POST(request, { params }) {
  return hostingRequest("admin", async (user) => issueInstanceTerminal(user, (await params).id, (await readHostingJson(request, 4096)).service));
}
