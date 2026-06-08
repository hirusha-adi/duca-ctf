import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { serializeTicketSummary, ticketSummaryInclude } from "@/lib/support";
import { AdminChatsInbox } from "@/components/support/admin-chats-inbox";

export default async function AdminChatsPage({ searchParams }) {
  const user = await getCurrentUser();
  const { ticket: ticketId } = await searchParams;

  const tickets = await prisma.supportTicket.findMany({
    include: ticketSummaryInclude,
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="flex h-[calc(100dvh-11rem)] flex-col">
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold">Support Chats</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage user support tickets. All admins can view and reply to any conversation.
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <Suspense>
          <AdminChatsInbox
            currentUser={user}
            initialTickets={tickets.map(serializeTicketSummary)}
            initialTicketId={typeof ticketId === "string" ? ticketId : null}
          />
        </Suspense>
      </div>
    </div>
  );
}
