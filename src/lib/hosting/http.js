import { NextResponse } from "next/server";
import { requireAdmin, requireAuth } from "../auth";
import { hostingError } from "./control-plane.mjs";

export async function hostingRequest(role, action) {
  try {
    const user = await (role === "admin" ? requireAdmin() : requireAuth());
    const result = await action(user);
    return result instanceof Response ? result : NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Please log in" }, { status: 401 });
    if (error.message === "FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (error.status && error.status >= 400 && error.status < 600) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    if (error.code === "P2025") return NextResponse.json({ error: "Record not found" }, { status: 404 });
    if (["P2002", "P2034"].includes(error.code)) return NextResponse.json({ error: "Another request changed this resource. Please retry." }, { status: 409 });
    console.error("Hosting request failed:", error);
    return NextResponse.json({ error: "Could not complete the hosting request" }, { status: 500 });
  }
}

export async function readHostingBody(request, limit = 16 * 1024 * 1024) {
  if (Number(request.headers.get("content-length")) > limit) throw hostingError("Request is too large", 413);
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); throw hostingError("Request is too large", 413); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export async function readHostingJson(request, limit) {
  const bytes = await readHostingBody(request, limit);
  const body = bytes.length ? JSON.parse(bytes.toString("utf8")) : {};
  if (!body || typeof body !== "object" || Array.isArray(body)) throw hostingError("Request must be an object");
  return body;
}
