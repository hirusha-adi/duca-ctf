"use client";

import Link from "next/link";
import { MessageSquarePlus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { timeAgoInAEST } from "@/lib/timezone";

export function SupportTicketSidebar({
  tickets,
  selectedId,
  onSelect,
  onNewTicket,
  showUser = false,
  searchQuery = "",
  onSearchChange,
  basePath = "/support",
}) {
  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border bg-card/40">
      <div className="space-y-3 border-b border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Support</h2>
          {onNewTicket ? (
            <Button size="sm" onClick={onNewTicket}>
              <MessageSquarePlus className="h-4 w-4" />
              New
            </Button>
          ) : (
            <Button size="sm" asChild>
              <Link href={`${basePath}?new=1`}>
                <MessageSquarePlus className="h-4 w-4" />
                New
              </Link>
            </Button>
          )}
        </div>
        {onSearchChange && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search tickets…"
              className="h-9 bg-background/60 pl-9"
            />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tickets.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No tickets yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {tickets.map((ticket) => {
              const selected = ticket.id === selectedId;
              const preview = ticket.lastMessage?.body || "No messages yet";
              const ItemWrapper = onSelect ? "button" : Link;
              const itemProps = onSelect
                ? {
                    type: "button",
                    onClick: () => onSelect(ticket.id),
                  }
                : {
                    href: `${basePath}/${ticket.id}`,
                  };

              return (
                <li key={ticket.id}>
                  <ItemWrapper
                    {...itemProps}
                    className={cn(
                      "block w-full px-4 py-3 text-left transition-colors hover:bg-muted/40",
                      selected && "bg-muted/60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 font-medium">
                        {showUser && ticket.user && (
                          <>
                            <span className="text-muted-foreground">{ticket.user.displayName}</span>
                            <span className="text-muted-foreground"> · </span>
                          </>
                        )}
                        {ticket.subject}
                      </p>
                      <Badge
                        variant={ticket.status === "OPEN" ? "outline" : "secondary"}
                        className="shrink-0 text-[10px]"
                      >
                        {ticket.status === "OPEN" ? "Open" : "Closed"}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{preview}</p>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      {timeAgoInAEST(ticket.updatedAt)}
                      {ticket.lastMessage?.authorDisplayName && (
                        <> · {ticket.lastMessage.authorDisplayName}</>
                      )}
                    </p>
                  </ItemWrapper>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
