import { prisma } from "@/lib/db";
import { hostingRequest, readHostingJson } from "@/lib/hosting/http";
import { hostingError, normalizeRegistryServer } from "@/lib/hosting/control-plane.mjs";
import { encryptRegistryPassword } from "@/lib/hosting/secrets.mjs";

export const dynamic = "force-dynamic";
const registrySelect = { id: true, server: true, username: true, createdAt: true, updatedAt: true };

export async function GET() {
  return hostingRequest("admin", async () => ({ registries: await prisma.registryCredential.findMany({ select: registrySelect, orderBy: { server: "asc" } }) }));
}

export async function POST(request) {
  return hostingRequest("admin", async (user) => {
    const body = await readHostingJson(request, 16384);
    const server = normalizeRegistryServer(body.server);
    if (typeof body.username !== "string" || !body.username.trim() || body.username.length > 255 || typeof body.password !== "string" || !body.password || body.password.length > 4096) throw hostingError("Provide a registry username and password or access token");
    const data = { username: body.username.trim(), passwordEncrypted: encryptRegistryPassword(body.password, process.env.SESSION_SECRET) };
    const registry = await prisma.$transaction(async (tx) => {
      const record = await tx.registryCredential.upsert({ where: { server }, create: { server, ...data }, update: data, select: registrySelect });
      await tx.instanceEvent.create({ data: { actorId: user.id, action: "REGISTRY_CREDENTIAL_SAVED", message: "Registry credential saved", metadata: { server } } });
      return record;
    });
    return { registry };
  });
}
