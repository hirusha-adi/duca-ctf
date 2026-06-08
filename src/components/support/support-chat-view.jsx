"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, MessageSquareOff, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SupportMessage } from "@/components/support/support-message";
import { MessageComposer } from "@/components/support/message-composer";
import { timeAgoInAEST } from "@/lib/timezone";
import { adminUserPath } from "@/lib/admin-user-paths";
import { SUPPORT_CHAT_POLL_MS } from "@/lib/support-constants";

export function SupportChatView({
  ticketId,
  currentUser,
  isAdmin = false,
  ticketsApiBase = "/api/support/tickets",
  onTicketUpdate,
}) {
  const messagesRef = useRef(null);
  const lastMessageCountRef = useRef(0);
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const loadTicket = useCallback(async () => {
    if (!ticketId) return;

    try {
      const res = await fetch(`${ticketsApiBase}/${ticketId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load chat");
      setTicket(data.ticket);
      setError(null);
      onTicketUpdate?.(data.ticket);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [ticketId, ticketsApiBase, onTicketUpdate]);

  useEffect(() => {
    setLoading(true);
    loadTicket();
  }, [loadTicket]);

  useEffect(() => {
    if (!ticketId) return;
    const interval = setInterval(loadTicket, SUPPORT_CHAT_POLL_MS);
    return () => clearInterval(interval);
  }, [ticketId, loadTicket]);

  useEffect(() => {
    const messageCount = ticket?.messages?.length ?? 0;
    if (messageCount <= lastMessageCountRef.current) return;

    const container = messagesRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: lastMessageCountRef.current === 0 ? "auto" : "smooth",
    });
    lastMessageCountRef.current = messageCount;
  }, [ticket?.messages?.length]);

  useEffect(() => {
    lastMessageCountRef.current = 0;
  }, [ticketId]);

  async function sendMessage(payload) {
    const res = await fetch(`${ticketsApiBase}/${ticketId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 429 && data.retryAfterMs) {
        throw new Error(data.error || "Please wait before sending another message");
      }
      throw new Error(data.error || "Failed to send message");
    }

    setTicket((prev) =>
      prev
        ? {
            ...prev,
            messages: [...(prev.messages || []), data.message],
            updatedAt: data.message.createdAt,
          }
        : prev
    );
    onTicketUpdate?.({
      ...ticket,
      lastMessage: {
        body: data.message.body,
        createdAt: data.message.createdAt,
        authorDisplayName: data.message.author.displayName,
        authorRole: data.message.author.role,
      },
      updatedAt: data.message.createdAt,
    });
  }

  async function toggleStatus() {
    if (!ticket) return;
    setStatusUpdating(true);
    try {
      const nextStatus = ticket.status === "OPEN" ? "CLOSED" : "OPEN";
      const res = await fetch(`${ticketsApiBase}/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update ticket");
      setTicket((prev) => ({ ...prev, status: data.ticket.status }));
      onTicketUpdate?.(data.ticket);
    } catch (err) {
      setError(err.message);
    } finally {
      setStatusUpdating(false);
    }
  }

  if (!ticketId) {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
        <MessageSquareOff className="h-10 w-10 opacity-40" />
        <p>Select a conversation or start a new ticket.</p>
      </div>
    );
  }

  if (loading && !ticket) {
    return (
      <div className="flex h-full min-h-[420px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !ticket) {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={loadTicket}>
          <RotateCcw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (!ticket) return null;

  const isClosed = ticket.status === "CLOSED";
  const challengeMentioned =
    Boolean(ticket.challenge) ||
    ticket.messages?.some((message) => message.challenge);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="z-10 flex shrink-0 items-start justify-between gap-4 border-b border-border bg-card px-4 py-4 sm:px-6">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{ticket.subject}</h2>
            <Badge variant={isClosed ? "secondary" : "success"}>
              {isClosed ? "Closed" : "Open"}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {isAdmin && ticket.user && (
              <span>
                User:{" "}
                <Link href={adminUserPath(ticket.user.email)} className="hover:text-primary">
                  {ticket.user.displayName}
                </Link>
              </span>
            )}
            {ticket.competition && (
              <Link href={`/competitions/${ticket.competition.slug}`} className="hover:text-primary">
                {ticket.competition.name}
              </Link>
            )}
            {ticket.challenge && (
              <Link href={`/challenges/${ticket.challenge.id}`} className="hover:text-primary">
                {ticket.challenge.title}
              </Link>
            )}
            <span>Updated {timeAgoInAEST(ticket.updatedAt)}</span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleStatus}
          disabled={statusUpdating}
        >
          {statusUpdating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isClosed ? (
            "Reopen"
          ) : (
            "Close ticket"
          )}
        </Button>
      </div>

      <div
        ref={messagesRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 sm:px-6"
      >
        <div className="space-y-4">
          {ticket.messages?.map((message) => (
            <SupportMessage
              key={message.id}
              message={message}
              currentUserId={currentUser.id}
              isAdminView={isAdmin}
            />
          ))}
        </div>
      </div>

      <div className="shrink-0">
      <MessageComposer
        onSend={sendMessage}
        disabled={isClosed}
        referencesCollapsible={challengeMentioned}
        disabledMessage={
          isClosed
            ? "This ticket is closed. Reopen it to send more messages."
            : undefined
        }
      />
      </div>
    </div>
  );
}
