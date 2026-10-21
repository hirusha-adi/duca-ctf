import { hostingRequest, readHostingJson } from "@/lib/hosting/http";
import { changeInstance, playerInstance } from "@/lib/hosting/service";
import { serializeHostedInstance } from "@/lib/hosting/control-plane.mjs";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  return hostingRequest("player", async (user) => playerInstance(user, (await params).id));
}

export async function POST(request, { params }) {
  return hostingRequest("player", async (user) => {
    const { action } = await readHostingJson(request, 4096);
    // Even admins use the player-facing controls here; destructive admin actions
    // are available only through the admin instance endpoint.
    if (!["start", "stop", "recreate"].includes(action)) {
      return Response.json({ error: "Invalid instance action" }, { status: 400 });
    }
    const instance = await changeInstance(user, { challengeId: (await params).id, action });
    return { instance: serializeHostedInstance(instance, { admin: user.role === "ADMIN" }) };
  });
}
