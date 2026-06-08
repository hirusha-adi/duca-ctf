import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Trophy, Puzzle, Activity } from "lucide-react";

export default async function AdminDashboard() {
  const [userCount, competitionCount, challengeCount, recentActivity] = await Promise.all([
    prisma.user.count(),
    prisma.competition.count(),
    prisma.challenge.count(),
    prisma.activityLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
  ]);

  const stats = [
    { label: "Users", value: userCount, icon: Users },
    { label: "Competitions", value: competitionCount, icon: Trophy },
    { label: "Challenges", value: challengeCount, icon: Puzzle },
    { label: "Activity (24h)", value: recentActivity, icon: Activity },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Admin Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
