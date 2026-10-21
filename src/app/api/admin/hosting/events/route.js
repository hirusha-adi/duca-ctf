import { prisma } from "@/lib/db";
import { hostingRequest } from "@/lib/hosting/http";

export const dynamic = "force-dynamic";

export async function GET(request) {
  return hostingRequest("admin", async () => {
    const limit = Math.max(1, Math.min(200, Math.floor(Number(new URL(request.url).searchParams.get("limit"))) || 100));
    const records = await prisma.instanceEvent.findMany({
      take: limit, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        actor: { select: { id: true, name: true, email: true } },
        instance: { select: { id: true, user: { select: { id: true, name: true, email: true } }, challenge: { select: { id: true, title: true } } } },
      },
    });
    return { events: records.map(({ instance, ...event }) => ({ ...event, type: event.action, user: instance?.user ?? event.actor, challenge: instance?.challenge ?? null })) };
  });
}
