import { prisma } from "@/lib/db";
import { AdminChallengesManager } from "@/components/admin/challenges-manager";
import { formatInAEST, toDatetimeLocalInAEST } from "@/lib/timezone";

export default async function AdminChallengesPage() {
  const [challenges, competitions, categories] = await Promise.all([
    prisma.challenge.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        competition: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        flags: { orderBy: { order: "asc" } },
        _count: { select: { solves: true } },
      },
    }),
    prisma.competition.findMany({ orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  const serialized = challenges.map((ch) => ({
    ...ch,
    startAtLocal: toDatetimeLocalInAEST(ch.startAt),
    startAtFormatted: formatInAEST(ch.startAt),
    flagCount: ch.flags.length,
  }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Challenges</h1>
      <AdminChallengesManager
        challenges={serialized}
        competitions={competitions}
        categories={categories}
      />
    </div>
  );
}
