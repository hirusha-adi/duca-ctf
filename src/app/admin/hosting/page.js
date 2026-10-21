import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { HostingManager } from "@/components/admin/hosting-manager";

export default async function AdminHostingPage() {
  await requireAdmin();
  const challenges = await prisma.challenge.findMany({ orderBy: [{ competition: { name: "asc" } }, { title: "asc" }], select: { id: true, title: true, competition: { select: { name: true } } } });
  return <div><h1 className="mb-6 text-2xl font-bold">Challenge Hosting</h1><HostingManager challenges={challenges} /></div>;
}
