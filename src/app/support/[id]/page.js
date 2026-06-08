import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTicketForAccess, serializeTicketSummary, ticketSummaryInclude } from "@/lib/support";
import { SupportInbox } from "@/components/support/support-inbox";

export default async function SupportTicketPage({ params }) {
  const user = await requirePageAuth("/support");
  const { id } = await params;

  const access = await getTicketForAccess(id, user);
  if (!access) notFound();

  const tickets = await prisma.supportTicket.findMany({
    where: { userId: user.id },
    include: ticketSummaryInclude,
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem)] max-w-7xl flex-col px-4 py-6">
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold">Challenge Support</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chat with admins about competitions, challenges, and technical issues.
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <Suspense>
          <SupportInbox
            currentUser={user}
            initialTickets={tickets.map(serializeTicketSummary)}
            initialTicketId={id}
          />
        </Suspense>
      </div>
    </div>
  );
}
