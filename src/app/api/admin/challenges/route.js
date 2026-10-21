import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { generateChallengeSlug } from "@/lib/slugs";
import { hashFlag, prepareFlagChanges, flagSyncErrorMessage } from "@/lib/flags";
import { sanitizeHtml } from "@/lib/sanitize";
import { resolveChallengeStartAt, challengeStartErrorMessage } from "@/lib/challenges";
import { logActivity, getClientIp, getUserAgent } from "@/lib/telemetry";
import { TELEMETRY_ACTIONS } from "@/lib/constants";
import { parseSubmitLimit } from "@/lib/submissions";
import { validateChallengePrerequisites, syncChallengePrerequisites } from "@/lib/challenge-access";
import { validateChallengeHints, syncChallengeHints } from "@/lib/hints";

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);

    const {
      title,
      competitionId,
      categoryId,
      points,
      description,
      descriptionFormat,
      startAt,
      useCustomStart,
      hidden,
      flags,
      submitLimit,
      hints,
      prerequisiteIds,
    } = body;

    if (!title || !competitionId || !categoryId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let resolvedStartAt;
    try {
      ({ startAt: resolvedStartAt } = await resolveChallengeStartAt(competitionId, {
        useCustomStart: !!useCustomStart,
        startAt,
      }));
    } catch (err) {
      return NextResponse.json(
        { error: challengeStartErrorMessage(err.message) },
        { status: 400 }
      );
    }

    let validFlags;
    try {
      validFlags = prepareFlagChanges(flags).flags;
    } catch (error) {
      return NextResponse.json({ error: flagSyncErrorMessage(error.message) }, { status: 400 });
    }

    const content =
      descriptionFormat === "RICHTEXT" ? sanitizeHtml(description) : description;

    const slug = await generateChallengeSlug(title, competitionId);

    const parsedPoints = Number(points ?? 100);
    if (!Number.isSafeInteger(parsedPoints) || parsedPoints < 0 || parsedPoints > 1000000000) {
      return NextResponse.json({ error: "Points must be a whole number from 0 to 1,000,000,000." }, { status: 400 });
    }
    const preparedFlags = await Promise.all(validFlags.map(async (flag, order) => {
      const normalized = flag.value.trim();
      return { value: normalized, flagHash: await hashFlag(normalized), label: flag.label || "", order };
    }));

    const challenge = await prisma.$transaction(async (tx) => {
      const validatedPrerequisites = await validateChallengePrerequisites(tx, { competitionId, prerequisiteIds: prerequisiteIds ?? [] });
      const validatedHints = await validateChallengeHints(tx, null, hints ?? []);
      const created = await tx.challenge.create({ data: {
        title,
        slug,
        competitionId,
        categoryId,
        points: parsedPoints,
        description: content || "",
        descriptionFormat: descriptionFormat || "MARKDOWN",
        startAt: resolvedStartAt,
        submitLimit: parseSubmitLimit(submitLimit),
        hidden: hidden ?? false,
        flags: { create: preparedFlags },
      } });
      await syncChallengeHints(tx, created.id, validatedHints);
      await syncChallengePrerequisites(tx, created.id, validatedPrerequisites);
      return created;
    });

    await logActivity({
      userId: admin.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.ADMIN_ACTION,
      metadata: { action: "create_challenge", challengeId: challenge.id },
    });

    return NextResponse.json({ challenge });
  } catch (err) {
    if (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err.code === "P2002") {
      return NextResponse.json({ error: "Slug already exists in competition" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
