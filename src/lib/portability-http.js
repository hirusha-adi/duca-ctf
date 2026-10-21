import { NextResponse } from "next/server";
import { requireAdmin } from "./auth";
import { logActivity, getClientIp, getUserAgent } from "./telemetry";
import { TELEMETRY_ACTIONS } from "./constants";
import { parseDatetimeLocalToUTC } from "./timezone";
import { MAX_PORTABILITY_BYTES, PortabilityError, isoDate } from "./portability-schema.mjs";

export async function portabilityAdmin(request, action) {
  try {
    const admin = await requireAdmin();
    return await action(admin);
  } catch (error) {
    if (["UNAUTHORIZED", "FORBIDDEN"].includes(error.message)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (error instanceof PortabilityError || error.status === 400) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error.code === "P2025") return NextResponse.json({ error: "Record not found" }, { status: 404 });
    if (["P2002", "P2034"].includes(error.code)) return NextResponse.json({ error: "Another administrator changed this content. Please try again" }, { status: 409 });
    console.error("Portability request failed:", error);
    return NextResponse.json({ error: "Could not complete this request" }, { status: 500 });
  }
}

export async function readPortabilityJson(request) {
  const limit = MAX_PORTABILITY_BYTES + 2 * 1024 * 1024;
  if (Number(request.headers.get("content-length")) > limit) throw new PortabilityError("Request exceeds the 34 MB limit", 413);
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); throw new PortabilityError("Request exceeds the 34 MB limit", 413); }
    chunks.push(Buffer.from(value));
  }
  const source = Buffer.concat(chunks).toString("utf8");
  let body;
  try { body = source.trim() ? JSON.parse(source) : {}; }
  catch { throw new PortabilityError("Request must contain valid JSON"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new PortabilityError("Request must be an object");
  return body;
}

export function importOptions(body) {
  const options = {};
  if (body.name !== undefined && body.name !== "") options.name = body.name;
  if (body.startAt !== undefined && body.startAt !== "") {
    if (typeof body.startAt !== "string") throw new PortabilityError("Start time must be a date");
    if (/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(body.startAt)) {
      const parsed = parseDatetimeLocalToUTC(body.startAt);
      if (!parsed || !Number.isFinite(parsed.getTime())) throw new PortabilityError("Invalid start time");
      options.startAt = parsed.toISOString();
    } else options.startAt = isoDate(body.startAt, "Start time");
  }
  return options;
}

export async function logPortability(request, admin, action, metadata = {}) {
  await logActivity({ userId: admin.id, ip: getClientIp(request), userAgent: getUserAgent(request), action: TELEMETRY_ACTIONS.ADMIN_ACTION, metadata: { action, ...metadata } });
}

export function yamlDownload(source, filename) {
  return new NextResponse(source, { headers: {
    "Content-Type": "application/yaml; charset=utf-8", "Content-Disposition": `attachment; filename="${filename.replace(/[^a-zA-Z0-9_.-]/g, "-")}"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}
