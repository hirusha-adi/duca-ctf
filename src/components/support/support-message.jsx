"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatInAEST } from "@/lib/timezone";
import { FileText, ImageIcon, Paperclip, Trophy, Puzzle } from "lucide-react";

function AttachmentPreview({ attachment }) {
  const isImage = attachment.mimeType?.startsWith("image/");

  if (isImage) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-md border border-border/60"
      >
        <img
          src={attachment.url}
          alt={attachment.name}
          className="max-h-48 max-w-full object-cover"
        />
      </a>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-sm hover:text-primary"
    >
      {attachment.mimeType === "application/pdf" ? (
        <FileText className="h-4 w-4 shrink-0" />
      ) : (
        <Paperclip className="h-4 w-4 shrink-0" />
      )}
      <span className="truncate">{attachment.name}</span>
    </a>
  );
}

export function SupportMessage({ message, currentUserId, isAdminView = false }) {
  const isOwn = message.author.id === currentUserId;
  const isAdminMessage = message.author.role === "ADMIN";
  const alignRight = isOwn && !isAdminView ? true : isAdminView ? isAdminMessage : isOwn;

  return (
    <div className={cn("flex", alignRight ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[min(100%,36rem)] space-y-2 rounded-xl px-4 py-3",
          alignRight
            ? "rounded-br-sm bg-primary/15 border border-primary/20"
            : "rounded-bl-sm bg-secondary/60 border border-border"
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{message.author.displayName}</span>
          {isAdminMessage && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] uppercase tracking-wide">
              Admin
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {formatInAEST(message.createdAt, "HH:mm · dd MMM")}
          </span>
        </div>

        {(message.competition || message.challenge) && (
          <div className="flex flex-wrap gap-2">
            {message.competition && (
              <Link
                href={`/competitions/${message.competition.slug}`}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 py-1 text-xs hover:text-primary"
              >
                <Trophy className="h-3 w-3" />
                {message.competition.name}
              </Link>
            )}
            {message.challenge && (
              <Link
                href={`/challenges/${message.challenge.id}`}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 py-1 text-xs hover:text-primary"
              >
                <Puzzle className="h-3 w-3" />
                {message.challenge.title}
              </Link>
            )}
          </div>
        )}

        {message.body && (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</p>
        )}

        {message.attachments?.length > 0 && (
          <div className="space-y-2">
            {message.attachments.map((attachment, index) => (
              <AttachmentPreview key={`${attachment.url}-${index}`} attachment={attachment} />
            ))}
            {message.attachments.some((a) => a.mimeType?.startsWith("image/")) && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <ImageIcon className="h-3 w-3" />
                {message.attachments.length} attachment{message.attachments.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
