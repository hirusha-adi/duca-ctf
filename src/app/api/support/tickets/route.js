import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  normalizeAttachments,
  serializeTicketSummary,
  ticketSummaryInclude,
} from "@/lib/support";
import { getSupportMessageCooldownRemaining } from "@/lib/support-rate-limit";

export async function GET() {
  try {
    const user = await requireAuth();

    const tickets = await prisma.supportTicket.findMany({
      where: { userId: user.id },
      include: ticketSummaryInclude,
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({
      tickets: tickets.map(serializeTicketSummary),
    });
  } catch (err) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Support tickets list error:", err);
    return NextResponse.json({ error: "Failed to load tickets" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const message = typeof body.body === "string" ? body.body.trim() : "";
    const competitionId = body.competitionId || null;
    const challengeId = body.challengeId || null;
    const attachments = normalizeAttachments(body.attachments);

    if (!subject || subject.length > 200) {
      return NextResponse.json({ error: "Subject is required (max 200 chars)" }, { status: 400 });
    }

    if (!message && attachments.length === 0) {
      return NextResponse.json({ error: "Message or attachment is required" }, { status: 400 });
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

    const ticket = await prisma.supportTicket.create({
      data: {
        userId: user.id,
        subject,
        competitionId: competitionId || undefined,
        challengeId: challengeId || undefined,
        messages: {
          create: {
            authorId: user.id,
            body: message,
            competitionId: competitionId || undefined,
            challengeId: challengeId || undefined,
            attachments,
          },
        },
      },
      include: ticketSummaryInclude,
    });

    return NextResponse.json({ ticket: serializeTicketSummary(ticket) }, { status: 201 });
  } catch (err) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Support ticket create error:", err);
    return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
  }
}
