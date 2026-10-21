import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { AdminChallengeBankManager } from "@/components/admin/challenge-bank-manager";

export default async function AdminChallengeBankPage() {
  await requireAdmin();
  const [records, challenges, competitions] = await Promise.all([
    prisma.challengeBankEntry.findMany({ orderBy: { updatedAt: "desc" } }),
    prisma.challenge.findMany({ orderBy: [{ competition: { name: "asc" } }, { title: "asc" }], select: { id: true, title: true, competition: { select: { name: true } } } }),
    prisma.competition.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, status: true } }),
  ]);
  const entries = records.map(({ id, title, categoryName, definition }) => ({ id, title, categoryName, challengeCount: definition.challenges?.length || 1 }));
  return <div><h1 className="mb-6 text-2xl font-bold">Challenge Bank</h1><AdminChallengeBankManager entries={entries} challenges={challenges} competitions={competitions} /></div>;
}
