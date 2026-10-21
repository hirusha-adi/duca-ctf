import { hostingRequest } from "@/lib/hosting/http";
import { hostingError } from "@/lib/hosting/control-plane.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  return hostingRequest("admin", async () => {
    const { id, service } = await params;
    const secret = process.env.HOSTED_RUNNER_SECRET;
    if (!secret) throw hostingError("The hosting runner is not configured", 503);
    const base = process.env.HOSTED_RUNNER_URL || "http://hosted-runner:3110";
    const url = new URL(`/logs/${encodeURIComponent(id)}/${encodeURIComponent(service)}`, base);
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    request.signal.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), 5000);
    let upstream;
    try {
      upstream = await fetch(url, { headers: { Authorization: `Bearer ${secret}` }, signal: controller.signal, cache: "no-store" });
    } catch {
      request.signal.removeEventListener("abort", onAbort);
      throw hostingError("The hosting runner is unavailable", 503);
    } finally {
      clearTimeout(timeout);
    }
    if (!upstream.ok) {
      request.signal.removeEventListener("abort", onAbort);
      await upstream.body?.cancel();
      throw hostingError(upstream.status === 404 ? "Instance or service not found" : "Could not read instance logs", upstream.status === 404 ? 404 : 502);
    }
    return new Response(upstream.body, { headers: {
      "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff", "X-Accel-Buffering": "no",
    } });
  });
}
