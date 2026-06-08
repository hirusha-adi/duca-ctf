import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function GET(request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const solves = await prisma.solve.findMany({
      where: { userId },
      include: {
        challenge: {
          include: {
            competition: { select: { name: true } },
            category: { select: { name: true } },
          },
        },
      },
      orderBy: { solvedAt: "desc" },
    });

    const byChallenge = new Map();
    for (const solve of solves) {
      const existing = byChallenge.get(solve.challengeId);
      if (existing) {
        existing.flagCount += 1;
        existing.totalPoints += solve.pointsAwarded;
      } else {
        byChallenge.set(solve.challengeId, {
          challengeId: solve.challengeId,
          title: solve.challenge.title,
          competitionName: solve.challenge.competition.name,
          categoryName: solve.challenge.category.name,
          flagCount: 1,
          totalPoints: solve.pointsAwarded,
          lastSolvedAt: solve.solvedAt,
        });
      }
    }

    return NextResponse.json({
      solvedChallenges: Array.from(byChallenge.values()),
    });
  } catch (err) {
    if (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Failed to load solves" }, { status: 500 });
  }
}
