import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import { parseDatetimeLocalToUTC } from "@/lib/timezone";
import { logActivity, getClientIp, getUserAgent } from "@/lib/telemetry";
import { TELEMETRY_ACTIONS } from "@/lib/constants";

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);

    const { name, slug, startAt, endAt, hidden, status } = body;

    if (!name || !startAt || !endAt) {
      return NextResponse.json({ error: "Name, start and end required" }, { status: 400 });
    }

    const competition = await prisma.competition.create({
      data: {
        name,
        slug: slug || slugify(name),
        startAt: parseDatetimeLocalToUTC(startAt),
        endAt: parseDatetimeLocalToUTC(endAt),
        hidden: hidden ?? false,
        status: status || "DRAFT",
      },
    });

    await logActivity({
      userId: admin.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.ADMIN_ACTION,
      metadata: { action: "create_competition", competitionId: competition.id },
    });

    return NextResponse.json({ competition });
  } catch (err) {
    if (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (err.code === "P2002") {
      return NextResponse.json({ error: "Slug already exists" }, { status: 400 });
    }
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
