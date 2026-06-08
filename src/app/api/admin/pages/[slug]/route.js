import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { sanitizeHtml } from "@/lib/sanitize";
import { logActivity, getClientIp, getUserAgent } from "@/lib/telemetry";
import { TELEMETRY_ACTIONS } from "@/lib/constants";
import { normalizePageSlug } from "@/lib/site-page-slug";
import { validateCustomPageSlug } from "@/lib/site-pages";

export async function PUT(request, { params }) {
  try {
    const admin = await requireAdmin();
    const { slug: currentSlug } = await params;
    const body = await request.json();
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);

    const existing = await prisma.sitePage.findUnique({
      where: { slug: currentSlug },
    });

    if (!existing) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    const content =
      body.contentFormat === "RICHTEXT"
        ? sanitizeHtml(body.content ?? existing.content)
        : body.content ?? existing.content;

    const data = {
      content,
      contentFormat: body.contentFormat || existing.contentFormat,
    };

    if (!existing.isSystem) {
      const title = body.title !== undefined ? body.title.trim() : existing.title;
      if (!title) {
        return NextResponse.json({ error: "Title is required" }, { status: 400 });
      }
      data.title = title;

      if (body.slug !== undefined) {
        const nextSlug = normalizePageSlug(body.slug);
        const slugError = await validateCustomPageSlug(nextSlug, {
          excludeSlug: currentSlug,
        });
        if (slugError) {
          return NextResponse.json({ error: slugError }, { status: 400 });
        }
        data.slug = nextSlug;
      }
    }

    const page = await prisma.sitePage.update({
      where: { slug: currentSlug },
      data,
    });

    await logActivity({
      userId: admin.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.ADMIN_ACTION,
      metadata: { action: "save_site_page", slug: page.slug },
    });

    return NextResponse.json({ page });
  } catch (err) {
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: "A page with this slug already exists" },
        { status: 400 }
      );
    }
    if (err.code === "P2025") {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
    if (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const admin = await requireAdmin();
    const { slug } = await params;
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);

    const existing = await prisma.sitePage.findUnique({ where: { slug } });

    if (!existing) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    if (existing.isSystem) {
      return NextResponse.json(
        { error: "Main legal pages cannot be deleted" },
        { status: 400 }
      );
    }

    await prisma.sitePage.delete({ where: { slug } });

    await logActivity({
      userId: admin.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.ADMIN_ACTION,
      metadata: { action: "delete_site_page", slug },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
