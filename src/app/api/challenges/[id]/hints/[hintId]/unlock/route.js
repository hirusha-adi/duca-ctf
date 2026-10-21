import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { unlockHint } from "@/lib/hints";
import { serializePlayerHint } from "@/lib/challenge-rules.mjs";

export async function POST(request, { params }) {
  try {
    const user = await requireAuth();
    const { id, hintId } = await params;
    const rawBody = await request.text();
    const body = rawBody ? JSON.parse(rawBody) : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Hint purchase must be an object." }, { status: 400 });
    if (body.expectedCost !== undefined && (!Number.isSafeInteger(body.expectedCost) || body.expectedCost < 0)) {
      return NextResponse.json({ error: "Expected hint cost must be a nonnegative whole number." }, { status: 400 });
    }
    const result = await unlockHint(user.id, id, hintId, body.expectedCost);
    return NextResponse.json({ hint: serializePlayerHint(result.hint, result.unlock), charged: result.charged, balance: result.balance });
  } catch (error) {
    if (error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in to unlock hints." }, { status: 401 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    if (error.status) return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status });
    console.error("Hint unlock failed:", error);
    return NextResponse.json({ error: "Could not unlock this hint." }, { status: 500 });
  }
}
