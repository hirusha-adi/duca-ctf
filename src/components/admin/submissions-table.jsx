"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

async function unsolveChallenge(userId, challengeId) {
  const res = await fetch("/api/admin/solves/unsolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, challengeId }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to unsolve challenge");
  }
  return data;
}

export function AdminSubmissionsTable({
  submissions,
  categories,
  competitions,
  filters,
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(filters.category || "all");
  const [competitionId, setCompetitionId] = useState(filters.competition || "all");
  const [result, setResult] = useState(filters.result || "all");
  const [unsolvingId, setUnsolvingId] = useState(null);
  const [error, setError] = useState(null);

  function applyFilters() {
    const params = new URLSearchParams();
    if (categoryId && categoryId !== "all") params.set("category", categoryId);
    if (competitionId && competitionId !== "all") params.set("competition", competitionId);
    if (result && result !== "all") params.set("result", result);
    router.push(`/admin/submissions?${params.toString()}`);
  }

  function clearFilters() {
    setCategoryId("all");
    setCompetitionId("all");
    setResult("all");
    router.push("/admin/submissions");
  }

  async function handleUnsolve(sub) {
    if (
      !confirm(
        `Mark "${sub.challengeTitle}" as unsolved for ${sub.userName}? This removes all flag solves and points for that challenge.`
      )
    ) {
      return;
    }

    setUnsolvingId(sub.id);
    setError(null);

    try {
      await unsolveChallenge(sub.userId, sub.challengeId);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setUnsolvingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4">
        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Competition</Label>
          <Select value={competitionId} onValueChange={setCompetitionId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All competitions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All competitions</SelectItem>
              {competitions.map((comp) => (
                <SelectItem key={comp.id} value={comp.id}>
                  {comp.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Result</Label>
          <Select value={result} onValueChange={setResult}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All results" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All results</SelectItem>
              <SelectItem value="correct">Correct</SelectItem>
              <SelectItem value="incorrect">Incorrect</SelectItem>
              <SelectItem value="reverted">Reverted</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={applyFilters}>Filter</Button>
        <Button variant="outline" onClick={clearFilters}>
          Clear
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Actions</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Challenge</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Competition</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Points</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  No submissions found
                </TableCell>
              </TableRow>
            ) : (
              submissions.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell>
                    {sub.canUnsolve ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={unsolvingId === sub.id}
                        onClick={() => handleUnsolve(sub)}
                      >
                        {unsolvingId === sub.id ? "..." : "Unsolve"}
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {sub.submittedAtFormatted}
                  </TableCell>
                  <TableCell className="text-sm">{sub.userName}</TableCell>
                  <TableCell className="text-sm font-medium">{sub.challengeTitle}</TableCell>
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
                      <Badge variant="outline" className="border-destructive/40 text-destructive">
                        Incorrect
                      </Badge>
                    )}
                    {sub.status === "reverted" && (
                      <div className="space-y-1">
                        <Badge variant="warning">Reverted</Badge>
                        {sub.revertedBy && (
                          <p className="text-xs text-muted-foreground">by {sub.revertedBy}</p>
                        )}
                      </div>
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
                  <TableCell className="font-mono text-sm">{sub.ip}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
