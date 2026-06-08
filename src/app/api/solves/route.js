import { NextResponse } from "next/server";
import { listSolveFeed } from "@/lib/solve-feed";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const competitionId = searchParams.get("competitionId");
  const limit = Number(searchParams.get("limit") || 50);

  const solves = await listSolveFeed({ competitionId, limit });
  return NextResponse.json({ solves });
}
