import { prisma } from "./db";
import {
  publishInboxUpdates,
  publishTicketEvent,
} from "./support-events";
import {
  serializeMessage,
  serializeTicketSummary,
  ticketSummaryInclude,
} from "./support";

export async function notifySupportMessage(ticketId, messageId) {
  const message = await prisma.supportMessage.findUnique({
    where: { id: messageId },
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
      ticket: { select: { userId: true } },
    },
  });

  if (!message) return;

  const serialized = serializeMessage(message);
  await publishTicketEvent(ticketId, { type: "message", message: serialized });

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: ticketSummaryInclude,
  });

  if (ticket) {
    const summary = serializeTicketSummary(ticket);
    await publishTicketEvent(ticketId, { type: "ticket", ticket: summary });
    await publishInboxUpdates(summary, ticket.userId);
  }
}

export async function notifySupportTicketUpdate(ticketId) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: ticketSummaryInclude,
  });

  if (!ticket) return;

  const summary = serializeTicketSummary(ticket);
  await publishTicketEvent(ticketId, { type: "ticket", ticket: summary });
  await publishInboxUpdates(summary, ticket.userId);
}
