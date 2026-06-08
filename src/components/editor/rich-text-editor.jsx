"use client";

import dynamic from "next/dynamic";

export const RichTextEditor = dynamic(
  () => import("./writeup-editor").then((mod) => mod.WriteupEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[240px] animate-pulse rounded-lg border border-border bg-card" />
    ),
  }
);
