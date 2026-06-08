"use client";

import { useEffect, useState } from "react";

function getTimeLeft(targetDate) {
  const diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) return null;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds };
}

export function Countdown({ targetDate, label = "Starts in" }) {
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(targetDate));

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(getTimeLeft(targetDate));
    }, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  if (!timeLeft) {
    return (
      <div className="inline-flex items-center gap-2 rounded border border-border bg-card px-3 py-1.5 font-mono text-sm">
        <span className="text-muted-foreground">Available now</span>
      </div>
    );
  }

  const pad = (n) => String(n).padStart(2, "0");

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="inline-flex items-center gap-1 rounded border border-border bg-card px-3 py-2 font-mono text-sm">
        {timeLeft.days > 0 && (
          <>
            <span>{timeLeft.days}d</span>
            <span className="text-muted-foreground">:</span>
          </>
        )}
        <span>{pad(timeLeft.hours)}</span>
        <span className="text-muted-foreground">:</span>
        <span>{pad(timeLeft.minutes)}</span>
        <span className="text-muted-foreground">:</span>
        <span>{pad(timeLeft.seconds)}</span>
      </div>
    </div>
  );
}
