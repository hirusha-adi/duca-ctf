"use client";

import { useEffect, useRef } from "react";

function parseSseEvent(event) {
  try {
    return JSON.parse(event.data);
  } catch {
    return null;
  }
}

export function useSolvesStream({ competitionId, onSolve, onRefresh, onReconnect }) {
  const handlersRef = useRef({ onSolve, onRefresh, onReconnect });
  handlersRef.current = { onSolve, onRefresh, onReconnect };

  const hadConnectionRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (competitionId) params.set("competitionId", competitionId);
    const query = params.toString();
    const source = new EventSource(`/api/solves/stream${query ? `?${query}` : ""}`);

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

      if (data.type === "solve") {
        handlersRef.current.onSolve?.(data.solve);
      }

      if (data.type === "refresh") {
        handlersRef.current.onRefresh?.();
      }
    };

    return () => {
      source.close();
    };
  }, [competitionId]);
}
