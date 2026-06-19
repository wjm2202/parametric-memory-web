/**
 * GET /api/substrates/:slug/events  (R12 — SSE streaming proxy)
 *
 * Streams compute's SSE endpoint
 *   GET /api/v1/substrates/:slug/events
 * straight through to the browser's EventSource. Deliberately does NOT use
 * computeProxy — that helper buffers + JSON-parses the whole response, which
 * would defeat streaming. Instead we forward `upstream.body` (a ReadableStream)
 * untouched and disable proxy buffering so each event flushes immediately.
 *
 * Auth: EventSource can't set headers, but it sends the same-origin
 * `mmpm_session` cookie automatically; we read it here and attach the compute
 * bearer. `request.signal` aborts the upstream fetch when the client closes the
 * stream, so we don't leak the dedicated LISTEN-fed connection on compute.
 *
 * Additive: a non-stream upstream (401/404/503/JSON error) passes straight
 * through, and the dashboard keeps its 3s poll as the correctness fallback.
 */

import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { authHeaders } from "@/lib/compute-proxy";

const COMPUTE_URL = process.env.MMPM_COMPUTE_URL ?? "http://localhost:3100";
const SESSION_COOKIE = "mmpm_session";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  if (!slug) return json({ error: "slug_required" }, 400);

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) return json({ error: "unauthorized" }, 401);

  let upstream: Response;
  try {
    upstream = await fetch(`${COMPUTE_URL}/api/v1/substrates/${encodeURIComponent(slug)}/events`, {
      method: "GET",
      headers: { ...authHeaders(sessionToken), Accept: "text/event-stream" },
      cache: "no-store",
      // Abort the upstream stream when the browser disconnects.
      signal: request.signal,
    });
  } catch {
    return json({ error: "compute_unreachable" }, 502);
  }

  // Non-stream responses (e.g. 404 not-found, 401, 503 sse_unavailable, JSON
  // error) pass straight through so the client can fall back to polling.
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(text || null, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
    });
  }

  // Stream the SSE body verbatim — no buffering, flush per event.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
