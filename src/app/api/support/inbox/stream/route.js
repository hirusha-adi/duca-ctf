import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  ADMIN_INBOX_KEY,
  inboxKeyForUser,
  subscribeToInbox,
} from "@/lib/support-events";
import { createSseResponse } from "@/lib/support-sse";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const user = await requireAuth();

    return createSseResponse(request, (send) => {
      const unsubscribers = [subscribeToInbox(inboxKeyForUser(user.id), send)];

      if (user.role === "ADMIN") {
        unsubscribers.push(subscribeToInbox(ADMIN_INBOX_KEY, send));
      }

      return () => {
        for (const unsubscribe of unsubscribers) unsubscribe();
      };
    });
  } catch (err) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Support inbox stream error:", err);
    return NextResponse.json({ error: "Stream failed" }, { status: 500 });
  }
}
