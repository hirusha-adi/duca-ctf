import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ACTIVITY_LOG_RETENTION_DAYS } from "@/lib/activity-retention";
import { decodeAdminUserEmail } from "@/lib/admin-user-paths";
import { formatInAEST } from "@/lib/timezone";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 20;

export default async function AdminUserDetailPage({ params, searchParams }) {
  const { email: encodedEmail } = await params;
  const query = await searchParams;
  const email = decodeAdminUserEmail(encodedEmail);

  const solvesPage = Math.max(1, Number(query?.solvesPage) || 1);
  const activityPage = Math.max(1, Number(query?.activityPage) || 1);

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      _count: { select: { solves: true, activityLogs: true, loginCodes: true } },
    },
  });

  if (!user) {
    notFound();
  }

  const [solves, solvesCount, activityLogs, activityCount] = await Promise.all([
    prisma.solve.findMany({
      where: { userId: user.id },
      include: {
        challenge: {
          select: {
            id: true,
            title: true,
            competition: { select: { name: true, slug: true } },
          },
        },
        flag: { select: { label: true } },
      },
      orderBy: { solvedAt: "desc" },
      skip: (solvesPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.solve.count({ where: { userId: user.id } }),
    prisma.activityLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip: (activityPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.activityLog.count({ where: { userId: user.id } }),
  ]);

  const solvesTotalPages = Math.max(1, Math.ceil(solvesCount / PAGE_SIZE));
  const activityTotalPages = Math.max(1, Math.ceil(activityCount / PAGE_SIZE));
  const basePath = `/admin/user/${encodeURIComponent(email)}`;

  return (
    <div className="space-y-10">
      <div>
        <Link
          href="/admin/users"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Users
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{user.name || user.email}</h1>
        <p className="font-mono text-sm text-muted-foreground">{user.email}</p>
      </div>

      <section className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Role</p>
          <Badge variant={user.role === "ADMIN" ? "default" : "secondary"} className="mt-1">
            {user.role}
          </Badge>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Student ID</p>
          <p className="mt-1 text-sm">{user.studentId || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <p className="mt-1 text-sm">{user.disabled ? "Disabled" : "Active"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Profile</p>
          <p className="mt-1 text-sm">{user.profileComplete ? "Complete" : "Incomplete"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Joined</p>
          <p className="mt-1 text-sm">{formatInAEST(user.createdAt)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Solves</p>
          <p className="mt-1 text-sm">{user._count.solves}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Activity events</p>
          <p className="mt-1 text-sm">{user._count.activityLogs}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Login codes issued</p>
          <p className="mt-1 text-sm">{user._count.loginCodes}</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Solves</h2>
        {solves.length === 0 ? (
          <p className="text-sm text-muted-foreground">No solves recorded.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Challenge</TableHead>
                  <TableHead>Competition</TableHead>
                  <TableHead>Flag</TableHead>
                  <TableHead>Points</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Solved</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {solves.map((solve) => (
                  <TableRow key={solve.id}>
                    <TableCell>
                      <Link
                        href={`/challenges/${solve.challenge.id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {solve.challenge.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/competitions/${solve.challenge.competition.slug}`}
                        className="hover:text-primary hover:underline"
                      >
                        {solve.challenge.competition.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {solve.flag.label || "—"}
                    </TableCell>
                    <TableCell>{solve.pointsAwarded}</TableCell>
                    <TableCell className="font-mono text-xs">{solve.ip}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatInAEST(solve.solvedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <AdminPagination
          page={solvesPage}
          totalPages={solvesTotalPages}
          basePath={basePath}
          pageParam="solvesPage"
          searchParams={{
            ...(activityPage > 1 ? { activityPage: String(activityPage) } : {}),
          }}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Activity log</h2>
        <p className="text-sm text-muted-foreground">
          Entries older than {ACTIVITY_LOG_RETENTION_DAYS} days are automatically
          deleted.
        </p>
        {activityLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity recorded.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activityLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">{log.action}</TableCell>
                    <TableCell className="font-mono text-xs">{log.ip}</TableCell>
                    <TableCell className="max-w-md truncate text-xs text-muted-foreground">
                      {JSON.stringify(log.metadata)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatInAEST(log.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <AdminPagination
          page={activityPage}
          totalPages={activityTotalPages}
          basePath={basePath}
          pageParam="activityPage"
          searchParams={{
            ...(solvesPage > 1 ? { solvesPage: String(solvesPage) } : {}),
          }}
        />
      </section>
    </div>
  );
}
