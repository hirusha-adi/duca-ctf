import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { generateChallengeSlug } from "@/lib/slugs";
import { syncChallengeFlags, flagSyncErrorMessage } from "@/lib/flags";
import { sanitizeHtml } from "@/lib/sanitize";
import { resolveChallengeStartAt, challengeStartErrorMessage } from "@/lib/challenges";
import { logActivity, getClientIp, getUserAgent } from "@/lib/telemetry";
import { TELEMETRY_ACTIONS } from "@/lib/constants";
import { parseSubmitLimit } from "@/lib/submissions";

export async function PATCH(request, { params }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);

    const existing = await prisma.challenge.findUnique({
      where: { id },
      select: { competitionId: true, title: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    const data = {};
    if (body.title) data.title = body.title;
    if (body.competitionId) data.competitionId = body.competitionId;

    const competitionId = body.competitionId || existing.competitionId;
    const title = body.title || existing.title;
    const titleChanged = body.title && body.title !== existing.title;
    const competitionChanged =
      body.competitionId && body.competitionId !== existing.competitionId;

    if (titleChanged || competitionChanged) {
      data.slug = await generateChallengeSlug(title, competitionId, id);
    }
    if (body.categoryId) data.categoryId = body.categoryId;
    if (body.points !== undefined) data.points = Number(body.points);
    if (body.description !== undefined) {
      data.description =
        body.descriptionFormat === "RICHTEXT"
          ? sanitizeHtml(body.description)
          : body.description;
    }
    if (body.descriptionFormat) data.descriptionFormat = body.descriptionFormat;
    if (typeof body.hidden === "boolean") data.hidden = body.hidden;
    if (body.submitLimit !== undefined) {
      data.submitLimit = parseSubmitLimit(body.submitLimit);
    }

    if (
      body.competitionId !== undefined ||
      body.startAt !== undefined ||
      body.useCustomStart !== undefined
    ) {
      try {
        ({ startAt: data.startAt } = await resolveChallengeStartAt(competitionId, {
          useCustomStart: !!body.useCustomStart,
          startAt: body.startAt,
        }));
      } catch (err) {
        return NextResponse.json(
          { error: challengeStartErrorMessage(err.message) },
          { status: 400 }
        );
      }
    }

    const challenge = await prisma.challenge.update({
      where: { id },
      data,
    });

    if (body.flags) {
      try {
        await syncChallengeFlags(id, body.flags);
      } catch (err) {
        return NextResponse.json(
          { error: flagSyncErrorMessage(err.message) },
          { status: 400 }
        );
      }
    }

    await logActivity({
      userId: admin.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.ADMIN_ACTION,
      metadata: { action: "update_challenge", challengeId: id },
    });

    return NextResponse.json({ challenge });
  } catch (err) {
    if (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);

    await prisma.challenge.delete({ where: { id } });

    await logActivity({
      userId: admin.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.ADMIN_ACTION,
      metadata: { action: "delete_challenge", challengeId: id },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
