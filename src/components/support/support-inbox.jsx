"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SupportTicketSidebar } from "@/components/support/support-ticket-sidebar";
import { SupportChatView } from "@/components/support/support-chat-view";
import { NewTicketPanel } from "@/components/support/new-ticket-panel";
import { cn } from "@/lib/utils";
import { useSupportInboxStream } from "@/hooks/use-support-stream";

export function SupportInbox({
  currentUser,
  initialTickets = [],
  initialTicketId = null,
  isAdmin = false,
  basePath = "/support",
  ticketsApiBase = "/api/support/tickets",
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState(initialTickets);
  const [selectedId, setSelectedId] = useState(initialTicketId);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const ticketFromUrl = searchParams.get("ticket");
  const showNew = searchParams.get("new") === "1" && !isAdmin;

  useEffect(() => {
    if (isAdmin && ticketFromUrl) {
      setSelectedId(ticketFromUrl);
    }
  }, [isAdmin, ticketFromUrl]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadTickets = useCallback(async () => {
    const params = new URLSearchParams();
    if (isAdmin) {
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (debouncedSearchQuery.trim()) params.set("q", debouncedSearchQuery.trim());
    }

    const url = isAdmin
      ? `/api/admin/support/tickets${params.toString() ? `?${params}` : ""}`
      : ticketsApiBase;

    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setTickets(data.tickets);
    }
  }, [isAdmin, statusFilter, debouncedSearchQuery, ticketsApiBase]);

  const handleTicketUpdate = useCallback((updated) => {
    if (!updated?.id) return;
    setTickets((prev) => {
      const exists = prev.some((t) => t.id === updated.id);
      if (!exists) return [updated, ...prev];
      return prev
        .map((t) => (t.id === updated.id ? { ...t, ...updated } : t))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    });
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  useSupportInboxStream({
    onTicket: handleTicketUpdate,
    onReconnect: loadTickets,
  });

  useEffect(() => {
    setSelectedId(initialTicketId);
  }, [initialTicketId]);

  function handleSelect(id) {
    setSelectedId(id);
    if (isAdmin) {
      router.push(`/admin/chats?ticket=${id}`);
    } else {
      router.push(`${basePath}/${id}`);
    }
  }

  const filteredTickets = isAdmin
    ? tickets
    : tickets;

  return (
    <div className="flex h-full min-h-[480px] overflow-hidden rounded-xl border border-border bg-card/60">
      <div
        className={cn(
          "w-full shrink-0 md:w-80 lg:w-96",
          selectedId && !showNew && "hidden md:block"
        )}
      >
        {isAdmin && (
          <div className="flex gap-1 border-b border-border p-2">
            {["ALL", "OPEN", "CLOSED"].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  statusFilter === status
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {status === "ALL" ? "All" : status.charAt(0) + status.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        )}
        <SupportTicketSidebar
          tickets={filteredTickets}
          selectedId={selectedId}
          onSelect={handleSelect}
          showUser={isAdmin}
          searchQuery={searchInput}
          onSearchChange={isAdmin ? setSearchInput : undefined}
          basePath={basePath}
          onNewTicket={
            !isAdmin
              ? () => router.push(`${basePath}?new=1`)
              : undefined
          }
        />
      </div>

      <div
        className={cn(
          "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          !selectedId && !showNew && "hidden md:flex"
        )}
      >
        {!isAdmin && (selectedId || showNew) && (
          <div className="border-b border-border p-2 md:hidden">
            <Button variant="ghost" size="sm" asChild>
              <Link href={basePath}>
                <ArrowLeft className="h-4 w-4" />
                All tickets
              </Link>
            </Button>
          </div>
        )}
        {showNew ? (
          <NewTicketPanel
            basePath={basePath}
            onCancel={() => router.push(basePath)}
          />
        ) : (
          <SupportChatView
            ticketId={selectedId}
            currentUser={currentUser}
            isAdmin={isAdmin}
            ticketsApiBase={ticketsApiBase}
            onTicketUpdate={handleTicketUpdate}
          />
        )}
      </div>
    </div>
  );
}
