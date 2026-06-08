import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import { parseDatetimeLocalToUTC } from "@/lib/timezone";
import { logActivity, getClientIp, getUserAgent } from "@/lib/telemetry";
import { TELEMETRY_ACTIONS } from "@/lib/constants";

export async function PATCH(request, { params }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);

    const data = {};
    if (body.name) data.name = body.name;
    if (body.slug) data.slug = body.slug;
    if (body.name && !body.slug) data.slug = slugify(body.name);
    if (body.startAt) data.startAt = parseDatetimeLocalToUTC(body.startAt);
    if (body.endAt) data.endAt = parseDatetimeLocalToUTC(body.endAt);
    if (typeof body.hidden === "boolean") data.hidden = body.hidden;
    if (body.status) data.status = body.status;

    const competition = await prisma.competition.update({
      where: { id },
      data,
    });

    await logActivity({
      userId: admin.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.ADMIN_ACTION,
      metadata: { action: "update_competition", competitionId: id, changes: data },
    });

    return NextResponse.json({ competition });
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

    await prisma.competition.delete({ where: { id } });

    await logActivity({
      userId: admin.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.ADMIN_ACTION,
      metadata: { action: "delete_competition", competitionId: id },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
