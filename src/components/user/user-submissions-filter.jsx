"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function UserSubmissionsFilter({ competitions, competitionId }) {
  const router = useRouter();
  const value = competitionId || "all";

  function onCompetitionChange(next) {
    const params = new URLSearchParams();
    if (next !== "all") params.set("competition", next);
    const qs = params.toString();
    router.push(qs ? `/user?${qs}` : "/user");
  }

  return (
    <div className="space-y-2">
      <Label>Competition</Label>
      <Select value={value} onValueChange={onCompetitionChange}>
        <SelectTrigger className="w-full sm:w-[280px]">
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
  );
}
