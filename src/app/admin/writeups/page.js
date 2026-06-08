import { prisma } from "@/lib/db";
import { AdminWriteupsManager } from "@/components/admin/writeups-manager";

export default async function AdminWriteupsPage() {
  const challenges = await prisma.challenge.findMany({
    orderBy: [{ competition: { name: "asc" } }, { title: "asc" }],
    include: {
      competition: { select: { name: true } },
      category: { select: { name: true } },
      writeup: true,
    },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Writeups</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Edit writeups at any time, even before competitions end.
      </p>
      <AdminWriteupsManager challenges={challenges} />
    </div>
  );
}
