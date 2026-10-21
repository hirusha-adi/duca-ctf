import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logActivity, getClientIp, getUserAgent } from "@/lib/telemetry";
import { TELEMETRY_ACTIONS } from "@/lib/constants";
import { notifySolvesRefresh } from "@/lib/solves-notify";
import { revokeChallengeSolve } from "@/lib/revoke-challenge-solve.mjs";

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);

    const { userId, challengeId } = body;

    if (typeof userId !== "string" || !userId || typeof challengeId !== "string" || !challengeId) {
      return NextResponse.json({ error: "userId and challengeId required" }, { status: 400 });
    }

    const { user, challenge, pointsRemoved, result } = await revokeChallengeSolve(prisma, userId, challengeId);

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
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Unsolve failed" }, { status: 500 });
  }
}
