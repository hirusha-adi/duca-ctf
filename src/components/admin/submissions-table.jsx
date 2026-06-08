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
            </SelectContent>
          </Select>
        </div>
        <Button onClick={applyFilters}>Filter</Button>
        <Button variant="outline" onClick={clearFilters}>
          Clear
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
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
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No submissions found
                </TableCell>
              </TableRow>
            ) : (
              submissions.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {sub.submittedAtFormatted}
                  </TableCell>
                  <TableCell className="text-sm">
                    {sub.userName}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {sub.challengeTitle}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{sub.categoryName}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {sub.competitionName}
                  </TableCell>
                  <TableCell>
                    {sub.correct ? (
                      <Badge variant="success">Correct</Badge>
                    ) : (
                      <Badge variant="outline" className="border-destructive/40 text-destructive">
                        Incorrect
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {sub.correct && sub.pointsAwarded > 0 ? (
                      <span className="text-primary">+{sub.pointsAwarded}</span>
                    ) : sub.correct ? (
                      <span className="text-muted-foreground">0</span>
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
