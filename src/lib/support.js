import { prisma } from "./db";

const authorSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
};

const competitionSelect = {
  id: true,
  name: true,
  slug: true,
};

const challengeSelect = {
  id: true,
  title: true,
  competition: { select: { slug: true } },
};

export function authorDisplayName(author) {
  if (author.role === "ADMIN") {
    return author.name || "DUCA Support";
  }
  return author.name || author.email;
}

export function serializeAttachment(attachment) {
  if (!attachment || typeof attachment !== "object") return null;
  const { url, name, mimeType, size } = attachment;
  if (!url || typeof url !== "string") return null;
  return {
    url,
    name: typeof name === "string" ? name : "attachment",
    mimeType: typeof mimeType === "string" ? mimeType : "application/octet-stream",
    size: typeof size === "number" ? size : 0,
  };
}

export function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map(serializeAttachment).filter(Boolean).slice(0, 10);
}

export function serializeMessage(message) {
  return {
    id: message.id,
    body: message.body,
    attachments: normalizeAttachments(message.attachments),
    createdAt: message.createdAt,
    author: {
      id: message.author.id,
      name: message.author.name,
      email: message.author.email,
      role: message.author.role,
      displayName: authorDisplayName(message.author),
    },
    competition: message.competition
      ? {
          id: message.competition.id,
          name: message.competition.name,
          slug: message.competition.slug,
        }
      : null,
    challenge: message.challenge
      ? {
          id: message.challenge.id,
          title: message.challenge.title,
          competitionSlug: message.challenge.competition?.slug ?? null,
        }
      : null,
  };
}

export function serializeTicketSummary(ticket) {
  const lastMessage = ticket.messages?.length
    ? [...ticket.messages].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
    : null;

  return {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    user: ticket.user
      ? {
          id: ticket.user.id,
          name: ticket.user.name,
          email: ticket.user.email,
          displayName: ticket.user.name || ticket.user.email,
        }
      : null,
    competition: ticket.competition
      ? {
          id: ticket.competition.id,
          name: ticket.competition.name,
          slug: ticket.competition.slug,
        }
      : null,
    challenge: ticket.challenge
      ? {
          id: ticket.challenge.id,
          title: ticket.challenge.title,
        }
      : null,
    lastMessage: lastMessage
      ? {
          body: lastMessage.body,
          createdAt: lastMessage.createdAt,
          authorDisplayName: authorDisplayName(lastMessage.author),
          authorRole: lastMessage.author.role,
        }
      : null,
    messageCount: ticket._count?.messages ?? ticket.messages?.length ?? 0,
  };
}

export async function getTicketForAccess(ticketId, user) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, userId: true, status: true },
  });

  if (!ticket) return null;
  if (user.role === "ADMIN" || ticket.userId === user.id) return ticket;
  return null;
}

export const ticketInclude = {
  user: { select: authorSelect },
  competition: { select: competitionSelect },
  challenge: { select: { id: true, title: true } },
  messages: {
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: authorSelect },
      competition: { select: competitionSelect },
      challenge: { select: challengeSelect },
    },
  },
};

export const ticketSummaryInclude = {
  user: { select: authorSelect },
  competition: { select: competitionSelect },
  challenge: { select: { id: true, title: true } },
  messages: {
    orderBy: { createdAt: "desc" },
    take: 1,
    include: {
      author: { select: authorSelect },
    },
  },
  _count: { select: { messages: true } },
};

export async function fetchReferenceData() {
  const competitions = await prisma.competition.findMany({
    where: { hidden: false },
    select: {
      id: true,
      name: true,
      slug: true,
      challenges: {
        where: { hidden: false },
        select: { id: true, title: true },
        orderBy: { title: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return { competitions };
}
