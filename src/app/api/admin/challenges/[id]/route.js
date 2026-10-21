import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { generateChallengeSlug } from "@/lib/slugs";
import { prepareFlagChanges, syncChallengeFlags, flagSyncErrorMessage } from "@/lib/flags";
import { sanitizeHtml } from "@/lib/sanitize";
import { resolveChallengeStartAt, challengeStartErrorMessage } from "@/lib/challenges";
import { logActivity, getClientIp, getUserAgent } from "@/lib/telemetry";
import { TELEMETRY_ACTIONS } from "@/lib/constants";
import { parseSubmitLimit } from "@/lib/submissions";
import { validateChallengeHints, syncChallengeHints } from "@/lib/hints";
import { validateChallengePrerequisites, syncChallengePrerequisites } from "@/lib/challenge-access";
import { notifySolvesRefresh } from "@/lib/solves-notify";
import { deleteChallengeConfiguration } from "@/lib/delete-challenge-configuration.mjs";

function requestError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function validatePatch(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw requestError("A challenge update must be an object");
  }
  for (const field of ["title", "competitionId", "categoryId"]) {
    if (body[field] !== undefined && (typeof body[field] !== "string" || !body[field].trim())) {
      throw requestError(`${field} must be nonempty text`);
    }
  }
  if (body.points !== undefined && (!Number.isInteger(Number(body.points)) || Number(body.points) < 0 || Number(body.points) > 2147483647)) {
    throw requestError("Points must be a nonnegative whole number");
  }
  if (body.description !== undefined && typeof body.description !== "string") {
    throw requestError("Description must be text");
  }
  if (body.descriptionFormat !== undefined && !["MARKDOWN", "RICHTEXT"].includes(body.descriptionFormat)) {
    throw requestError("Invalid description format");
  }
  for (const field of ["hidden", "useCustomStart"]) {
    if (body[field] !== undefined && typeof body[field] !== "boolean") {
      throw requestError(`${field} must be true or false`);
    }
  }
  if (body.startAt !== undefined && typeof body.startAt !== "string") {
    throw requestError("Start time must be text");
  }
  if (body.submitLimit != null && body.submitLimit !== "" && (!Number.isInteger(Number(body.submitLimit)) || Number(body.submitLimit) < 1)) {
    throw requestError("Submission limit must be a positive whole number");
  }
}

export async function PATCH(request, { params }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    validatePatch(body);
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);

    const challenge = await prisma.$transaction(async (tx) => {
      // The submission and hint purchase paths take the same challenge lock.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      const existing = await tx.challenge.findUnique({
        where: { id },
        select: { competitionId: true, title: true, descriptionFormat: true },
      });
      if (!existing) throw requestError("Challenge not found", 404);

      const competitionId = body.competitionId || existing.competitionId;
      const title = body.title?.trim() || existing.title;
      const competitionChanged = competitionId !== existing.competitionId;
      if (competitionChanged) {
        const [solveCount, unlockCount] = await Promise.all([
          tx.solve.count({ where: { challengeId: id } }),
          tx.hintUnlock.count({ where: { hint: { challengeId: id } } }),
        ]);
        if (solveCount || unlockCount) {
          throw requestError("A challenge with solves or unlocked hints cannot be moved to another competition", 409);
        }
      }

      const data = {};
      if (body.title !== undefined) data.title = title;
      if (body.competitionId !== undefined) data.competitionId = competitionId;
      if (title !== existing.title || competitionChanged) {
        data.slug = await generateChallengeSlug(title, competitionId, id);
      }
      if (body.categoryId !== undefined) data.categoryId = body.categoryId;
      if (body.points !== undefined) data.points = Number(body.points);
      if (body.description !== undefined) {
        data.description = (body.descriptionFormat || existing.descriptionFormat) === "RICHTEXT"
          ? sanitizeHtml(body.description)
          : body.description;
      }
      if (body.descriptionFormat !== undefined) data.descriptionFormat = body.descriptionFormat;
      if (body.hidden !== undefined) data.hidden = body.hidden;
      if (body.submitLimit !== undefined) data.submitLimit = parseSubmitLimit(body.submitLimit);

      if (body.competitionId !== undefined || body.startAt !== undefined || body.useCustomStart !== undefined) {
        try {
          ({ startAt: data.startAt } = await resolveChallengeStartAt(competitionId, {
            useCustomStart: !!body.useCustomStart,
            startAt: body.startAt,
          }));
        } catch (error) {
          throw requestError(challengeStartErrorMessage(error.message));
        }
      }

      // Validate all associations before changing the challenge or any child row.
      if (body.flags !== undefined) {
        const flags = await tx.flag.findMany({ where: { challengeId: id }, select: { id: true, retired: true } });
        try {
          prepareFlagChanges(body.flags, flags);
        } catch (error) {
          throw requestError(flagSyncErrorMessage(error.message));
        }
      }
      const hints = await validateChallengeHints(tx, id, body.hints);
      const prerequisites = await validateChallengePrerequisites(tx, {
        challengeId: id,
        competitionId,
        prerequisiteIds: body.prerequisiteIds,
      });

      const updated = await tx.challenge.update({ where: { id }, data });
      if (body.flags !== undefined) await syncChallengeFlags(id, body.flags, tx);
      await syncChallengeHints(tx, id, hints);
      await syncChallengePrerequisites(tx, id, prerequisites);
      return updated;
    }, { timeout: 15000 });

    await logActivity({
      userId: admin.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.ADMIN_ACTION,
      metadata: { action: "update_challenge", challengeId: id },
    });
    notifySolvesRefresh();

    return NextResponse.json({ challenge });
  } catch (err) {
    if (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (err.code === "P2002") {
      return NextResponse.json({ error: "Slug already exists in competition" }, { status: 409 });
    }
    console.error("Challenge update error:", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);

    await deleteChallengeConfiguration(prisma, id);

    await logActivity({
      userId: admin.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.ADMIN_ACTION,
      metadata: { action: "delete_challenge", challengeId: id },
    });
    notifySolvesRefresh();

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err.code === "P2025") return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
