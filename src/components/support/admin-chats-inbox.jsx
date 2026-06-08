"use client";

import { SupportInbox } from "@/components/support/support-inbox";

export function AdminChatsInbox({ currentUser, initialTickets, initialTicketId }) {
  return (
    <SupportInbox
      currentUser={currentUser}
      initialTickets={initialTickets}
      initialTicketId={initialTicketId}
      isAdmin
      basePath="/admin/chats"
      ticketsApiBase="/api/support/tickets"
    />
  );
}
