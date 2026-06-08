import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getTicketForAccess } from "@/lib/support";
import { subscribeToTicket } from "@/lib/support-events";
import { createSseResponse } from "@/lib/support-sse";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const access = await getTicketForAccess(id, user);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return createSseResponse(request, async (send) => subscribeToTicket(id, send));
  } catch (err) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Support ticket stream error:", err);
    return NextResponse.json({ error: "Stream failed" }, { status: 500 });
  }
}
