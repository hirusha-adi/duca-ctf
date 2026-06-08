import { prisma } from "@/lib/db";
import { AdminChallengesManager } from "@/components/admin/challenges-manager";
import { formatInAEST, toDatetimeLocalInAEST } from "@/lib/timezone";

export default async function AdminChallengesPage() {
  const [challenges, competitions, categories] = await Promise.all([
    prisma.challenge.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        competition: { select: { id: true, name: true, startAt: true, endAt: true } },
        category: { select: { id: true, name: true } },
        flags: {
          orderBy: { order: "asc" },
          select: { id: true, label: true, order: true, value: true },
        },
        _count: { select: { solves: true } },
      },
    }),
    prisma.competition.findMany({ orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  const serializedCompetitions = competitions.map((c) => ({
    ...c,
    startAtLocal: toDatetimeLocalInAEST(c.startAt),
    endAtLocal: toDatetimeLocalInAEST(c.endAt),
    startAtFormatted: formatInAEST(c.startAt),
    endAtFormatted: formatInAEST(c.endAt),
  }));

  const serialized = challenges.map((ch) => ({
    ...ch,
    startAtLocal: toDatetimeLocalInAEST(ch.startAt),
    startAtFormatted: formatInAEST(ch.startAt),
    flagCount: ch.flags.length,
    competitionStartAt: ch.competition.startAt,
  }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Challenges</h1>
      <AdminChallengesManager
        challenges={serialized}
        competitions={serializedCompetitions}
        categories={categories}
      />
    </div>
  );
}
