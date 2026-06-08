"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminUserPath } from "@/lib/admin-user-paths";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInAEST } from "@/lib/timezone";
import { Badge } from "@/components/ui/badge";

function LeaderboardPlayerName({ user, isAdmin }) {
  const label = user.name || user.email;
  if (!isAdmin || !user.email) {
    return label;
  }
  return (
    <Link
      href={adminUserPath(user.email)}
      className="hover:text-primary hover:underline"
    >
      {label}
    </Link>
  );
}

export function LeaderboardTabs({
  competitions,
  selectedCompetitionId,
  overall,
  challenges,
  challengeLeaderboards,
  isAdmin = false,
}) {
  const router = useRouter();

  if (competitions.length === 0) {
    return <p className="text-muted-foreground">No competitions available.</p>;
  }

  return (
    <div className="space-y-4">
      <Select
        value={selectedCompetitionId || ""}
        onValueChange={(value) => router.push(`/leaderboard?competition=${value}`)}
      >
        <SelectTrigger className="w-[280px]">
          <SelectValue placeholder="Select competition" />
        </SelectTrigger>
        <SelectContent>
          {competitions.map((comp) => (
            <SelectItem key={comp.id} value={comp.id}>
              {comp.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Tabs defaultValue="overall">
        <TabsList>
          <TabsTrigger value="overall">Overall</TabsTrigger>
          <TabsTrigger value="challenges">Per Challenge</TabsTrigger>
        </TabsList>

        <TabsContent value="overall">
          {overall.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No scores yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overall.map((entry, i) => (
                  <TableRow key={entry.user.id}>
                    <TableCell className="font-mono text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <LeaderboardPlayerName user={entry.user} isAdmin={isAdmin} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-primary">
                      {entry.score}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="challenges">
          {challenges.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No challenges.</p>
          ) : (
            <div className="space-y-8">
              {challenges.map((ch) => {
                const solves = challengeLeaderboards[ch.id] || [];
                return (
                  <div key={ch.id}>
                    <div className="mb-3 flex items-center gap-2">
                      <h3 className="font-semibold">{ch.title}</h3>
                      <Badge variant="secondary">{ch.category.name}</Badge>
                      <Badge variant="outline">{ch.points} pts</Badge>
                    </div>
                    {solves.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No solves yet.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">#</TableHead>
                            <TableHead>Player</TableHead>
                            <TableHead>Solved At</TableHead>
                            {challenges.find((c) => c.id === ch.id)?.flags?.length > 1 && (
                              <TableHead>Flag</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {solves.map((solve, i) => (
                            <TableRow key={solve.id}>
                              <TableCell className="font-mono text-muted-foreground">
                                {i + 1}
                              </TableCell>
                              <TableCell>
                                <LeaderboardPlayerName user={solve.user} isAdmin={isAdmin} />
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {formatInAEST(solve.solvedAt)}
                              </TableCell>
                              {solve.flag?.label && (
                                <TableCell>{solve.flag.label}</TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
