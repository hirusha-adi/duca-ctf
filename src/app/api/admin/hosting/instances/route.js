import { prisma } from "@/lib/db";
import { hostingRequest } from "@/lib/hosting/http";
import { currentHostingUsage, getHostingSettings } from "@/lib/hosting/service";
import { serializeHostedInstance, TERMINAL_STATES } from "@/lib/hosting/control-plane.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  return hostingRequest("admin", async () => {
    const query = new URL(request.url).searchParams;
    const limit = Math.max(1, Math.min(100, Math.floor(Number(query.get("limit"))) || 50));
    const where = query.get("includeEnded") === "true" ? {} : { state: { notIn: TERMINAL_STATES } };
    if (query.get("challengeId")) where.challengeId = query.get("challengeId").slice(0, 100);
    if (query.get("userId")) where.userId = query.get("userId").slice(0, 100);
    const cursor = query.get("cursor")?.slice(0, 100);
    const [rows, settings, usage] = await Promise.all([
      prisma.hostedInstance.findMany({ where, take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), orderBy: [{ updatedAt: "desc" }, { id: "desc" }], include: { user: { select: { id: true, name: true, email: true } }, challenge: { select: { id: true, title: true } } } }),
      getHostingSettings(), currentHostingUsage(),
    ]);
    return { instances: rows.slice(0, limit).map((instance) => serializeHostedInstance(instance, { admin: true })), settings, usage, nextCursor: rows.length > limit ? rows[limit - 1].id : null };
  });
}
