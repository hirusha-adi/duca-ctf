import { prisma } from "@/lib/db";
import { AdminCompetitionsManager } from "@/components/admin/competitions-manager";
import { formatInAEST, toDatetimeLocalInAEST } from "@/lib/timezone";

export default async function AdminCompetitionsPage() {
  const competitions = await prisma.competition.findMany({
    orderBy: { startAt: "desc" },
    include: { _count: { select: { challenges: true } } },
  });

  const serialized = competitions.map((c) => ({
    ...c,
    startAtLocal: toDatetimeLocalInAEST(c.startAt),
    endAtLocal: toDatetimeLocalInAEST(c.endAt),
    startAtFormatted: formatInAEST(c.startAt),
    endAtFormatted: formatInAEST(c.endAt),
  }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Competitions</h1>
      <AdminCompetitionsManager competitions={serialized} />
    </div>
  );
}
