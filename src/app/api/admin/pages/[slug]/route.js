import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { sanitizeHtml } from "@/lib/sanitize";
import { logActivity, getClientIp, getUserAgent } from "@/lib/telemetry";
import { TELEMETRY_ACTIONS } from "@/lib/constants";
import { SITE_PAGE_SLUGS } from "@/lib/site-pages";

export async function PUT(request, { params }) {
  try {
    const admin = await requireAdmin();
    const { slug } = await params;

    if (!SITE_PAGE_SLUGS.includes(slug)) {
      return NextResponse.json({ error: "Unknown page" }, { status: 404 });
    }

    const body = await request.json();
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);

    const content =
      body.contentFormat === "RICHTEXT"
        ? sanitizeHtml(body.content)
        : body.content || "";

    const page = await prisma.sitePage.update({
      where: { slug },
      data: {
        content,
        contentFormat: body.contentFormat || "RICHTEXT",
        ...(body.title ? { title: body.title } : {}),
      },
    });

    await logActivity({
      userId: admin.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.ADMIN_ACTION,
      metadata: { action: "save_site_page", slug },
    });

    return NextResponse.json({ page });
  } catch (err) {
    if (err.code === "P2025") {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
    if (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
