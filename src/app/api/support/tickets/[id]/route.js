import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  getTicketForAccess,
  serializeMessage,
  serializeTicketSummary,
  ticketInclude,
  ticketSummaryInclude,
} from "@/lib/support";

export async function GET(_request, { params }) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const access = await getTicketForAccess(id, user);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: ticketInclude,
    });

    return NextResponse.json({
      ticket: {
        ...serializeTicketSummary(ticket),
        messages: ticket.messages.map(serializeMessage),
      },
    });
  } catch (err) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Support ticket get error:", err);
    return NextResponse.json({ error: "Failed to load ticket" }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const body = await request.json();

    const access = await getTicketForAccess(id, user);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const status = body.status;
    if (status !== "OPEN" && status !== "CLOSED") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    if (user.role !== "ADMIN" && access.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ticket = await prisma.supportTicket.update({
      where: { id },
      data: { status },
      include: ticketSummaryInclude,
    });

    return NextResponse.json({ ticket: serializeTicketSummary(ticket) });
  } catch (err) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Support ticket update error:", err);
    return NextResponse.json({ error: "Failed to update ticket" }, { status: 500 });
  }
}
