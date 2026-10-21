import { prisma } from "@/lib/db";
import { hostingRequest } from "@/lib/hosting/http";
import { hostingError } from "@/lib/hosting/control-plane.mjs";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  return hostingRequest("admin", async () => {
    const instanceId = (await params).id;
    if (!(await prisma.hostedInstance.findUnique({ where: { id: instanceId }, select: { id: true } }))) throw hostingError("Instance not found", 404);
    const events = await prisma.instanceEvent.findMany({ where: { instanceId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 });
    return { events };
  });
}
