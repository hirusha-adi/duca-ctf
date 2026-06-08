import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { isCompetitionEnded } from "@/lib/competitions";
import { getCurrentUser } from "@/lib/auth";
import { ContentRenderer } from "@/components/challenge/content-renderer";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";
import { formatInAEST } from "@/lib/timezone";
import { logActivity, getClientIp, getUserAgent } from "@/lib/telemetry";
import { TELEMETRY_ACTIONS } from "@/lib/constants";
import { headers } from "next/headers";

export default async function WriteupPage({ params }) {
  const { challengeId } = await params;
  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";

  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    include: {
      category: true,
      competition: true,
      writeup: true,
    },
  });

  if (!challenge || challenge.hidden || challenge.competition.hidden) {
    notFound();
  }

  const ended = isCompetitionEnded(challenge.competition);
  const unlocked = ended || isAdmin;

  if (!unlocked) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <Lock className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Writeup Locked</h1>
        <p className="mt-2 text-muted-foreground">
          Available after {formatInAEST(challenge.competition.endAt)}
        </p>
        <Link href="/writeups" className="mt-4 inline-block text-primary hover:underline">
          Back to writeups
        </Link>
      </div>
    );
  }

  if (!challenge.writeup) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">No Writeup Yet</h1>
        <p className="mt-2 text-muted-foreground">
          A writeup for {challenge.title} has not been published.
        </p>
        <Link href="/writeups" className="mt-4 inline-block text-primary hover:underline">
          Back to writeups
        </Link>
      </div>
    );
  }

  if (user) {
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const userAgent = headersList.get("user-agent") || "";
    await logActivity({
      userId: user.id,
      ip,
      userAgent,
      action: TELEMETRY_ACTIONS.WRITEUP_VIEW,
      metadata: { challengeId },
    });
  }

  const images = Array.isArray(challenge.writeup.images) ? challenge.writeup.images : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/writeups" className="text-sm text-muted-foreground hover:text-primary">
        ← Back to writeups
      </Link>

      <div className="mb-6 mt-4">
        <h1 className="text-2xl font-bold">{challenge.title} — Writeup</h1>
        <div className="mt-2 flex gap-2">
          <Badge variant="secondary">{challenge.category.name}</Badge>
          <Badge variant="outline">{challenge.competition.name}</Badge>
        </div>
      </div>

      <ContentRenderer
        content={challenge.writeup.content}
        format={challenge.writeup.contentFormat}
      />

      {images.length > 0 && (
        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold">Images</h2>
          {images.map((img, i) => (
            <img
              key={i}
              src={img.url || img}
              alt={img.alt || `Writeup image ${i + 1}`}
              className="rounded-md border border-border"
            />
          ))}
        </div>
      )}
    </div>
  );
}
