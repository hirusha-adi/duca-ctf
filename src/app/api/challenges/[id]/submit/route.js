import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { verifyFlag, normalizeFlag } from "@/lib/flags";
import { isChallengeAvailable } from "@/lib/competitions";
import { getClientIp, getUserAgent } from "@/lib/telemetry";
import { TELEMETRY_ACTIONS } from "@/lib/constants";
import { checkRateLimit } from "@/lib/rate-limit";
import { notifySolveCreated } from "@/lib/solves-notify";
import { getChallengePrerequisiteStatus } from "@/lib/challenge-access";

export async function POST(request, { params }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const { flag } = await request.json();
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);
    if (typeof flag !== "string" || !flag.trim() || flag.length > 4096) {
      return NextResponse.json({ error: "A valid flag is required" }, { status: 400 });
    }
    if (!(await checkRateLimit(`submit:${user.id}`, 10, 60 * 1000))) {
      return NextResponse.json({ error: "Too many submissions. Slow down." }, { status: 429 });
    }

    const outcome = await prisma.$transaction(async (tx) => {
      // Challenge edits use the same lock. User locks also serialize hint purchases.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`user:${user.id}`}))`;
      const challenge = await tx.challenge.findUnique({
        where: { id },
        include: { competition: true, flags: { where: { retired: false }, select: { id: true, flagHash: true } } },
      });
      if (!challenge || challenge.hidden || challenge.competition.hidden) {
        return { status: 404, body: { error: "Challenge not found" } };
      }
      if (!isChallengeAvailable(challenge, challenge.competition)) {
        return { status: 403, body: { error: "Challenge not available" } };
      }
      const access = await getChallengePrerequisiteStatus(user.id, id, tx);
      if (!access.unlocked) {
        return { status: 403, body: { error: "Solve the prerequisite challenges first." } };
      }
      if (challenge.submitLimit != null) {
        const attempts = await tx.activityLog.count({
          where: {
            userId: user.id,
            action: { in: [TELEMETRY_ACTIONS.FLAG_SUBMIT_CORRECT, TELEMETRY_ACTIONS.FLAG_SUBMIT_INCORRECT] },
            metadata: { path: ["challengeId"], equals: id },
          },
        });
        if (attempts >= challenge.submitLimit) {
          return { status: 429, body: { error: "You have reached the submission limit for this challenge." } };
        }
      }

      const normalized = normalizeFlag(flag);
      let matchedFlag = null;
      for (const candidate of challenge.flags) {
        if (await verifyFlag(normalized, candidate.flagHash)) {
          matchedFlag = candidate;
          break;
        }
      }
      const metadata = { challengeId: id, categoryId: challenge.categoryId, competitionId: challenge.competitionId };
      if (!matchedFlag) {
        await tx.activityLog.create({ data: { userId: user.id, ip, userAgent, action: TELEMETRY_ACTIONS.FLAG_SUBMIT_INCORRECT, metadata } });
        return { status: 400, body: { error: "Incorrect flag" } };
      }
      const duplicate = await tx.solve.findUnique({ where: { userId_flagId: { userId: user.id, flagId: matchedFlag.id } } });
      if (duplicate) return { status: 200, body: { message: "You already solved this flag." } };

      const completed = await tx.solve.findFirst({ where: { userId: user.id, challengeId: id } });
      const pointsAwarded = completed ? 0 : challenge.points;
      const solve = await tx.solve.create({ data: { userId: user.id, challengeId: id, flagId: matchedFlag.id, ip, pointsAwarded } });
      await tx.activityLog.create({
        data: { userId: user.id, ip, userAgent, action: TELEMETRY_ACTIONS.FLAG_SUBMIT_CORRECT, metadata: { ...metadata, flagId: matchedFlag.id, pointsAwarded } },
      });
      return {
        solveId: solve.id, status: 200,
        body: { success: true, pointsAwarded, message: pointsAwarded > 0 ? `Correct! +${pointsAwarded} points` : "Correct! (no additional points for this flag)" },
      };
    }, { timeout: 20000 });

    if (outcome.solveId) notifySolveCreated(outcome.solveId);
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (err) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Please log in to submit flags" }, { status: 401 });
    }
    console.error("Flag submit error:", err);
    return NextResponse.json({ error: "Submission failed" }, { status: 500 });
  }
}
