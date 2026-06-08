import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { serializeTicketSummary, ticketSummaryInclude } from "@/lib/support";

export async function GET(request) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const q = searchParams.get("q")?.trim();

    const where = {};

    if (status === "OPEN" || status === "CLOSED") {
      where.status = status;
    }

    if (q) {
      where.OR = [
        { subject: { contains: q, mode: "insensitive" } },
        { user: { email: { contains: q, mode: "insensitive" } } },
        { user: { name: { contains: q, mode: "insensitive" } } },
      ];
    }

    const tickets = await prisma.supportTicket.findMany({
      where,
      include: ticketSummaryInclude,
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({
      tickets: tickets.map(serializeTicketSummary),
    });
  } catch (err) {
    if (err.message === "UNAUTHORIZED" || err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("Admin support tickets error:", err);
    return NextResponse.json({ error: "Failed to load tickets" }, { status: 500 });
  }
}
