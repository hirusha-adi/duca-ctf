import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { sanitizeHtml } from "@/lib/sanitize";
import { logActivity, getClientIp, getUserAgent } from "@/lib/telemetry";
import { TELEMETRY_ACTIONS } from "@/lib/constants";

export async function PUT(request, { params }) {
  try {
    const admin = await requireAdmin();
    const { challengeId } = await params;
    const body = await request.json();
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);

    const content =
      body.contentFormat === "RICHTEXT"
        ? sanitizeHtml(body.content)
        : body.content || "";

    const writeup = await prisma.writeup.upsert({
      where: { challengeId },
      update: {
        content,
        contentFormat: body.contentFormat || "MARKDOWN",
        images: body.images || [],
      },
      create: {
        challengeId,
        content,
        contentFormat: body.contentFormat || "MARKDOWN",
        images: body.images || [],
      },
    });

    await logActivity({
      userId: admin.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.ADMIN_ACTION,
      metadata: { action: "save_writeup", challengeId },
    });

    return NextResponse.json({ writeup });
  } catch (err) {
    if (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
