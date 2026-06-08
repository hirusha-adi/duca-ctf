import { prisma } from "@/lib/db";
import { AdminWriteupsManager } from "@/components/admin/writeups-manager";

export default async function AdminWriteupsPage() {
  const competitions = await prisma.competition.findMany({
    orderBy: { name: "asc" },
    include: {
      challenges: {
        orderBy: { title: "asc" },
        include: {
          category: { select: { name: true } },
          writeup: true,
        },
      },
    },
  });

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Writeups</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Select a competition, then a challenge. Writeups auto-save as you type. Paste or
        drop images directly into the editor.
      </p>
      <AdminWriteupsManager competitions={competitions} />
    </div>
  );
}
