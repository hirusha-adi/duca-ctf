"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SolvesFilter({ competitions, selectedId }) {
  const router = useRouter();

  return (
    <Select
      value={selectedId || "all"}
      onValueChange={(value) => {
        if (value === "all") {
          router.push("/solves");
        } else {
          router.push(`/solves?competition=${value}`);
        }
      }}
    >
      <SelectTrigger className="w-[200px]">
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
  );
}
