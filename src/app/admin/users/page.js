import { prisma } from "@/lib/db";
import { AdminUsersTable } from "@/components/admin/users-table";
import { formatInAEST } from "@/lib/timezone";

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { solves: true, activityLogs: true } },
    },
  });

  const serialized = users.map((u) => ({
    ...u,
    createdAt: formatInAEST(u.createdAt),
  }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Users</h1>
      <AdminUsersTable users={serialized} />
    </div>
  );
}
