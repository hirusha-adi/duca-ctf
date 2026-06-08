import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  getTicketForAccess,
  normalizeAttachments,
  serializeMessage,
} from "@/lib/support";
import { getSupportMessageCooldownRemaining } from "@/lib/support-rate-limit";
import { notifySupportMessage } from "@/lib/support-notify";

export async function POST(request, { params }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const body = await request.json();

    const access = await getTicketForAccess(id, user);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (access.status === "CLOSED") {
      return NextResponse.json({ error: "Ticket is closed" }, { status: 400 });
    }

    const cooldownRemaining = await getSupportMessageCooldownRemaining(prisma, user.id);
    if (cooldownRemaining > 0) {
      return NextResponse.json(
        {
          error: `Please wait ${Math.ceil(cooldownRemaining / 1000)}s before sending another message`,
          retryAfterMs: cooldownRemaining,
        },
        { status: 429 }
      );
    }

    const message = typeof body.body === "string" ? body.body.trim() : "";
    const competitionId = body.competitionId || null;
    const challengeId = body.challengeId || null;
    const attachments = normalizeAttachments(body.attachments);

    if (!message && attachments.length === 0) {
      return NextResponse.json({ error: "Message or attachment is required" }, { status: 400 });
    }

    if (message.length > 10000) {
      return NextResponse.json({ error: "Message is too long" }, { status: 400 });
    }

    if (challengeId) {
      const challenge = await prisma.challenge.findUnique({
        where: { id: challengeId },
        select: { id: true, competitionId: true, hidden: true },
      });
      if (!challenge || challenge.hidden) {
        return NextResponse.json({ error: "Invalid challenge" }, { status: 400 });
      }
      if (competitionId && challenge.competitionId !== competitionId) {
        return NextResponse.json({ error: "Challenge does not belong to competition" }, { status: 400 });
      }
    } else if (competitionId) {
      const competition = await prisma.competition.findUnique({
        where: { id: competitionId },
        select: { id: true, hidden: true },
      });
      if (!competition || competition.hidden) {
        return NextResponse.json({ error: "Invalid competition" }, { status: 400 });
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const msg = await tx.supportMessage.create({
        data: {
          ticketId: id,
          authorId: user.id,
          body: message,
          competitionId: competitionId || undefined,
          challengeId: challengeId || undefined,
          attachments,
        },
      });

      await tx.supportTicket.update({
        where: { id },
        data: { updatedAt: new Date() },
      });

      return msg;
    });

    const fullMessage = await prisma.supportMessage.findUnique({
      where: { id: created.id },
      include: {
        author: { select: { id: true, name: true, email: true, role: true } },
        competition: { select: { id: true, name: true, slug: true } },
        challenge: {
          select: {
            id: true,
            title: true,
            competition: { select: { slug: true } },
          },
        },
      },
    });

    if (!fullMessage) {
      return NextResponse.json({ error: "Failed to load message" }, { status: 500 });
    }

    await notifySupportMessage(id, created.id, fullMessage);

    return NextResponse.json({ message: serializeMessage(fullMessage) }, { status: 201 });
  } catch (err) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Support message create error:", err);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
