import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logActivity, getClientIp, getUserAgent } from "@/lib/telemetry";
import { TELEMETRY_ACTIONS } from "@/lib/constants";
import { notifySolvesRefresh } from "@/lib/solves-notify";

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);

    const { userId, challengeId } = body;

    if (!userId || !challengeId) {
      return NextResponse.json({ error: "userId and challengeId required" }, { status: 400 });
    }

    const [user, challenge, existingSolves] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true },
      }),
      prisma.challenge.findUnique({
        where: { id: challengeId },
        select: {
          id: true,
          title: true,
          categoryId: true,
          competitionId: true,
          category: { select: { name: true } },
          competition: { select: { name: true } },
        },
      }),
      prisma.solve.findMany({
        where: { userId, challengeId },
        select: { id: true, pointsAwarded: true },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!challenge) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }
    if (existingSolves.length === 0) {
      return NextResponse.json({ error: "User has not solved this challenge" }, { status: 404 });
    }

    const pointsRemoved = existingSolves.reduce((sum, s) => sum + s.pointsAwarded, 0);

    const result = await prisma.solve.deleteMany({
      where: { userId, challengeId },
    });

    const revertMetadata = {
      challengeId,
      challengeTitle: challenge.title,
      categoryId: challenge.categoryId,
      competitionId: challenge.competitionId,
      categoryName: challenge.category.name,
      competitionName: challenge.competition.name,
      deletedCount: result.count,
      pointsRemoved,
      revertedByAdminId: admin.id,
      revertedByAdminEmail: admin.email,
      revertedByAdminName: admin.name || admin.email,
      targetUserId: userId,
      targetUserEmail: user.email,
      targetUserName: user.name || user.email,
    };

    await logActivity({
      userId,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.FLAG_SUBMIT_REVERTED,
      metadata: revertMetadata,
    });

    await logActivity({
      userId: admin.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.ADMIN_ACTION,
      metadata: {
        action: "unsolve_challenge",
        ...revertMetadata,
      },
    });

    await notifySolvesRefresh();

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
      pointsRemoved,
    });
  } catch (err) {
    if (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Unsolve failed" }, { status: 500 });
  }
}
