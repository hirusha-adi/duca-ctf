import Link from "next/link";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUserSubmissions } from "@/lib/user-submissions";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { UserSubmissionsFilter } from "@/components/user/user-submissions-filter";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 20;

export default async function UserPage({ searchParams }) {
  const user = await requirePageAuth("/user");
  const params = await searchParams;
  const competitionId = params?.competition || "";
  const page = Math.max(1, Number(params?.page) || 1);

  const [competitions, { submissions, totalCount }] = await Promise.all([
    prisma.competition.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    }),
    getUserSubmissions(user.id, {
      competitionId: competitionId || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const paginationParams = competitionId ? { competition: competitionId } : {};

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">Your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Profile details and your flag submission history.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            To change your display name, contact DUCA staff — open a{" "}
            <Link href="/support" className="text-primary hover:underline">
              support ticket
            </Link>{" "}
            or reach out through official DUCA channels at{" "}
            <a
              href="https://duca.au"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              duca.au
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Display name</Label>
            <Input
              id="profile-name"
              value={user.name || ""}
              disabled
              placeholder="Not set"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={user.email} disabled />
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Submission history</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your flag attempts, newest first. Includes correct and incorrect submissions.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <UserSubmissionsFilter
            competitions={competitions}
            competitionId={competitionId}
          />
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Challenge</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Competition</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Points</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No submissions found
                  </TableCell>
                </TableRow>
              ) : (
                submissions.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {sub.submittedAtFormatted}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {sub.challengeId ? (
                        <Link
                          href={`/challenges/${sub.challengeId}`}
                          className="hover:text-primary hover:underline"
                        >
                          {sub.challengeTitle}
                        </Link>
                      ) : (
                        sub.challengeTitle
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{sub.categoryName}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {sub.competitionName}
                    </TableCell>
                    <TableCell>
                      {sub.status === "correct" && (
                        <Badge variant="success">Correct</Badge>
                      )}
                      {sub.status === "incorrect" && (
                        <Badge
                          variant="outline"
                          className="border-destructive/40 text-destructive"
                        >
                          Incorrect
                        </Badge>
                      )}
                      {sub.status === "reverted" && (
                        <Badge variant="warning">Reverted</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {sub.status === "correct" && sub.pointsAwarded > 0 ? (
                        <span className="text-primary">+{sub.pointsAwarded}</span>
                      ) : sub.status === "correct" ? (
                        <span className="text-muted-foreground">0</span>
                      ) : sub.status === "reverted" && sub.pointsAwarded > 0 ? (
                        <span className="text-amber-400">−{sub.pointsAwarded}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <AdminPagination
          page={page}
          totalPages={totalPages}
          basePath="/user"
          pageParam="page"
          searchParams={paginationParams}
        />
      </section>
    </div>
  );
}
