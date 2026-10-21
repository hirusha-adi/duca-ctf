import { prisma } from "@/lib/db";
import { hostingRequest, readHostingJson } from "@/lib/hosting/http";
import { changeInstance } from "@/lib/hosting/service";
import { hostingError, serializeHostedInstance } from "@/lib/hosting/control-plane.mjs";

export async function GET(request, { params }) {
  return hostingRequest("admin", async () => {
    const instance = await prisma.hostedInstance.findUnique({ where: { id: (await params).id }, include: { user: { select: { id: true, name: true, email: true } }, challenge: { select: { id: true, title: true } } } });
    if (!instance) throw hostingError("Instance not found", 404);
    return { instance: serializeHostedInstance(instance, { admin: true }) };
  });
}

export async function POST(request, { params }) {
  return hostingRequest("admin", async (user) => {
    const { action } = await readHostingJson(request, 4096);
    return { instance: serializeHostedInstance(await changeInstance(user, { instanceId: (await params).id, action }), { admin: true }) };
  });
}
