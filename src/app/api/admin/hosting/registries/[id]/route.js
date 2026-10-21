import { prisma } from "@/lib/db";
import { hostingRequest, readHostingJson } from "@/lib/hosting/http";
import { hostingError, normalizeRegistryServer } from "@/lib/hosting/control-plane.mjs";
import { encryptRegistryPassword } from "@/lib/hosting/secrets.mjs";

const registrySelect = { id: true, server: true, username: true, createdAt: true, updatedAt: true };

export async function PATCH(request, { params }) {
  return hostingRequest("admin", async (user) => {
    const { id } = await params;
    const body = await readHostingJson(request, 16384);
    const data = {};
    if (body.server !== undefined) data.server = normalizeRegistryServer(body.server);
    if (body.username !== undefined) {
      if (typeof body.username !== "string" || !body.username.trim() || body.username.length > 255) throw hostingError("Provide a valid registry username");
      data.username = body.username.trim();
    }
    if (body.password !== undefined && body.password !== "") {
      if (typeof body.password !== "string" || body.password.length > 4096) throw hostingError("Provide a valid registry password or access token");
      data.passwordEncrypted = encryptRegistryPassword(body.password, process.env.SESSION_SECRET);
    }
    const registry = await prisma.$transaction(async (tx) => {
      const record = await tx.registryCredential.update({ where: { id }, data, select: registrySelect });
      await tx.instanceEvent.create({ data: { actorId: user.id, action: "REGISTRY_CREDENTIAL_UPDATED", message: "Registry credential updated", metadata: { server: record.server } } });
      return record;
    });
    return { registry };
  });
}

export async function DELETE(request, { params }) {
  return hostingRequest("admin", async (user) => {
    await prisma.$transaction(async (tx) => {
      const registry = await tx.registryCredential.delete({ where: { id: (await params).id }, select: { server: true } });
      await tx.instanceEvent.create({ data: { actorId: user.id, action: "REGISTRY_CREDENTIAL_REMOVED", message: "Registry credential removed", metadata: registry } });
    });
    return { success: true };
  });
}
