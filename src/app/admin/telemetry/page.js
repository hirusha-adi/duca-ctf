import { prisma } from "@/lib/db";
import { ACTIVITY_LOG_RETENTION_DAYS } from "@/lib/activity-retention";
import { AdminTelemetryTable } from "@/components/admin/telemetry-table";
import { formatInAEST } from "@/lib/timezone";

export default async function AdminTelemetryPage({ searchParams }) {
  const params = await searchParams;
  const action = params?.action || "";
  const ip = params?.ip || "";
  const userId = params?.user || "";

  const where = {};
  if (action) where.action = action;
  if (ip) where.ip = { contains: ip };
  if (userId) where.userId = userId;

  const [logs, users, actions] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.activityLog.findMany({
      select: { action: true },
      distinct: ["action"],
      orderBy: { action: "asc" },
    }),
  ]);

  const serialized = logs.map((log) => ({
    ...log,
    createdAtFormatted: formatInAEST(log.createdAt),
  }));

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Telemetry</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Activity older than {ACTIVITY_LOG_RETENTION_DAYS} days is automatically
        deleted.
      </p>
      <AdminTelemetryTable
        logs={serialized}
        users={users}
        actions={actions.map((a) => a.action)}
        filters={{ action, ip, userId }}
      />
    </div>
  );
}
