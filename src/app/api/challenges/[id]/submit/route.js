import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { verifyFlag, normalizeFlag } from "@/lib/flags";
import { isChallengeAvailable } from "@/lib/competitions";
import { logActivity, getClientIp, getUserAgent } from "@/lib/telemetry";
import { TELEMETRY_ACTIONS } from "@/lib/constants";
import { getUserChallengeSubmissionCount } from "@/lib/submissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { notifySolveCreated } from "@/lib/solves-notify";

export async function POST(request, { params }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const { flag } = await request.json();
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);

    if (!flag) {
      return NextResponse.json({ error: "Flag required" }, { status: 400 });
    }

    if (!(await checkRateLimit(`submit:${user.id}`, 10, 60 * 1000))) {
      return NextResponse.json({ error: "Too many submissions. Slow down." }, { status: 429 });
    }

    const challenge = await prisma.challenge.findUnique({
      where: { id },
      include: {
        competition: true,
        category: { select: { id: true, name: true } },
        flags: { select: { id: true, flagHash: true } },
      },
    });

    if (!challenge || challenge.hidden || challenge.competition.hidden) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    if (!isChallengeAvailable(challenge, challenge.competition)) {
      return NextResponse.json({ error: "Challenge not available" }, { status: 403 });
    }

    if (challenge.submitLimit != null) {
      const submissionCount = await getUserChallengeSubmissionCount(user.id, id);
      if (submissionCount >= challenge.submitLimit) {
        return NextResponse.json(
          { error: "You have reached the submission limit for this challenge." },
          { status: 429 }
        );
      }
    }

    const normalized = normalizeFlag(flag);
    let matchedFlag = null;

    for (const f of challenge.flags) {
      const valid = await verifyFlag(normalized, f.flagHash);
      if (valid) {
        matchedFlag = f;
        break;
      }
    }

    if (!matchedFlag) {
      await logActivity({
        userId: user.id,
        ip,
        userAgent,
        action: TELEMETRY_ACTIONS.FLAG_SUBMIT_INCORRECT,
        metadata: {
          challengeId: id,
          categoryId: challenge.categoryId,
          competitionId: challenge.competitionId,
        },
      });
      return NextResponse.json({ error: "Incorrect flag" }, { status: 400 });
    }

    const existingSolve = await prisma.solve.findUnique({
      where: {
        userId_flagId: { userId: user.id, flagId: matchedFlag.id },
      },
    });

    if (existingSolve) {
      return NextResponse.json({ message: "You already solved this flag." });
    }

    const existingChallengeSolve = await prisma.solve.findFirst({
      where: {
        userId: user.id,
        challengeId: id,
        pointsAwarded: { gt: 0 },
      },
    });

    const pointsAwarded = existingChallengeSolve ? 0 : challenge.points;

    const solve = await prisma.solve.create({
      data: {
        userId: user.id,
        challengeId: id,
        flagId: matchedFlag.id,
        ip,
        pointsAwarded,
      },
    });

    await notifySolveCreated(solve.id);

    await logActivity({
      userId: user.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.FLAG_SUBMIT_CORRECT,
      metadata: {
        challengeId: id,
        flagId: matchedFlag.id,
        pointsAwarded,
        categoryId: challenge.categoryId,
        competitionId: challenge.competitionId,
      },
    });

    const message =
      pointsAwarded > 0
        ? `Correct! +${pointsAwarded} points`
        : "Correct! (no additional points for this flag)";

    return NextResponse.json({ success: true, message, pointsAwarded });
  } catch (err) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Please log in to submit flags" }, { status: 401 });
    }
    console.error("Flag submit error:", err);
    return NextResponse.json({ error: "Submission failed" }, { status: 500 });
  }
}
