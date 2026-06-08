import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { sanitizeHtml } from "@/lib/sanitize";
import { logActivity, getClientIp, getUserAgent } from "@/lib/telemetry";
import { TELEMETRY_ACTIONS } from "@/lib/constants";
import { normalizePageSlug } from "@/lib/site-page-slug";
import { validateCustomPageSlug } from "@/lib/site-pages";
import { revalidateSitePages } from "@/lib/revalidate-site-pages";

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);

    const slug = normalizePageSlug(body.slug || "");
    const title = (body.title || "").trim();

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const slugError = await validateCustomPageSlug(slug);
    if (slugError) {
      return NextResponse.json({ error: slugError }, { status: 400 });
    }

    const content =
      body.contentFormat === "RICHTEXT"
        ? sanitizeHtml(body.content || "")
        : body.content || "";

    const page = await prisma.sitePage.create({
      data: {
        slug,
        title,
        content,
        contentFormat: body.contentFormat || "RICHTEXT",
        isSystem: false,
      },
    });

    await logActivity({
      userId: admin.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.ADMIN_ACTION,
      metadata: { action: "create_site_page", slug },
    });

    revalidateSitePages({ slug: page.slug });

    return NextResponse.json({ page }, { status: 201 });
  } catch (err) {
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: "A page with this slug already exists" },
        { status: 400 }
      );
    }
    if (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
