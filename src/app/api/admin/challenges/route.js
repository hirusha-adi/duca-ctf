import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import { hashFlag } from "@/lib/flags";
import { sanitizeHtml } from "@/lib/sanitize";
import { parseDatetimeLocalToUTC } from "@/lib/timezone";
import { logActivity, getClientIp, getUserAgent } from "@/lib/telemetry";
import { TELEMETRY_ACTIONS } from "@/lib/constants";

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);

    const {
      title,
      slug,
      competitionId,
      categoryId,
      points,
      description,
      descriptionFormat,
      startAt,
      hidden,
      flags,
    } = body;

    if (!title || !competitionId || !categoryId || !startAt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const validFlags = (flags || []).filter((f) => f.value?.trim());
    if (validFlags.length === 0) {
      return NextResponse.json({ error: "At least one flag required" }, { status: 400 });
    }

    const content =
      descriptionFormat === "RICHTEXT" ? sanitizeHtml(description) : description;

    const challenge = await prisma.challenge.create({
      data: {
        title,
        slug: slug || slugify(title),
        competitionId,
        categoryId,
        points: Number(points) || 100,
        description: content || "",
        descriptionFormat: descriptionFormat || "MARKDOWN",
        startAt: parseDatetimeLocalToUTC(startAt),
        hidden: hidden ?? false,
        flags: {
          create: await Promise.all(
            validFlags.map(async (f, i) => ({
              flagHash: await hashFlag(f.value),
              label: f.label || "",
              order: i,
            }))
          ),
        },
      },
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
    if (err.code === "P2002") {
      return NextResponse.json({ error: "Slug already exists in competition" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
