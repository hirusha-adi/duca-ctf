"use client";

import { useEffect, useRef } from "react";

function parseSseEvent(event) {
  try {
    return JSON.parse(event.data);
  } catch {
    return null;
  }
}

export function useSupportTicketStream(ticketId, { onMessage, onTicket, onReconnect }) {
  const handlersRef = useRef({ onMessage, onTicket, onReconnect });
  handlersRef.current = { onMessage, onTicket, onReconnect };

  const hadConnectionRef = useRef(false);

  useEffect(() => {
    if (!ticketId) return undefined;

    const source = new EventSource(`/api/support/tickets/${ticketId}/stream`);

    source.onmessage = (event) => {
      const data = parseSseEvent(event);
      if (!data) return;

      if (data.type === "connected") {
        if (hadConnectionRef.current) {
          handlersRef.current.onReconnect?.();
        }
        hadConnectionRef.current = true;
        return;
      }

      if (data.type === "message") {
        handlersRef.current.onMessage?.(data.message);
      }

      if (data.type === "ticket") {
        handlersRef.current.onTicket?.(data.ticket);
      }
    };

    return () => {
      source.close();
    };
  }, [ticketId]);
}

export function useSupportInboxStream({ onTicket, onReconnect }) {
  const handlersRef = useRef({ onTicket, onReconnect });
  handlersRef.current = { onTicket, onReconnect };

  const hadConnectionRef = useRef(false);

  useEffect(() => {
    const source = new EventSource("/api/support/inbox/stream");

    source.onmessage = (event) => {
      const data = parseSseEvent(event);
      if (!data) return;

      if (data.type === "connected") {
        if (hadConnectionRef.current) {
          handlersRef.current.onReconnect?.();
        }
        hadConnectionRef.current = true;
        return;
      }

      if (data.type === "ticket") {
        handlersRef.current.onTicket?.(data.ticket);
      }
    };

    return () => {
      source.close();
    };
  }, []);
}
