import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const competitionId = searchParams.get("competitionId");
  const limit = Math.min(Number(searchParams.get("limit") || 50), 100);

  const solves = await prisma.solve.findMany({
    where: {
      challenge: {
        hidden: false,
        competition: {
          hidden: false,
          ...(competitionId ? { id: competitionId } : {}),
        },
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      challenge: {
        select: {
          id: true,
          title: true,
          points: true,
          competition: { select: { id: true, name: true, slug: true } },
        },
      },
    },
    orderBy: { solvedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ solves });
}
