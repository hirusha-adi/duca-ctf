import { NextResponse } from "next/server";
import { subscribeToSolves } from "@/lib/solves-events";
import { createSseResponse } from "@/lib/support-sse";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const competitionId = searchParams.get("competitionId");

    return createSseResponse(request, async (send) =>
      subscribeToSolves((event) => {
        if (event.type === "solve") {
          if (
            competitionId &&
            event.solve.challenge.competition.id !== competitionId
          ) {
            return;
          }
        }

        send(event);
      })
    );
  } catch (err) {
    console.error("Solves stream error:", err);
    return NextResponse.json({ error: "Stream failed" }, { status: 500 });
  }
}
