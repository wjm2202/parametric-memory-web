/**
 * SSE passthrough proxy — S16-3.
 *
 * Browser → GET /api/memory/events (this route)
 *        → GET https://mmpm.co.nz/events (upstream SSE)
 *
 * The route opens a fetch() to the upstream SSE endpoint and pipes
 * the response body directly to the client as a ReadableStream.
 * No buffering — events arrive as soon as the upstream emits them.
 *
 * Auth: Uses the server-side MMPM_VIZ_API_KEY (read-only) so the
 * browser never sees the bearer token.
 */
import { getMmpmSseUrl, getMmpmAuthHeader } from "@/lib/mmpm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const upstreamUrl = getMmpmSseUrl();
  const auth = getMmpmAuthHeader();

  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    "Cache-Control": "no-cache",
  };
  if (auth) {
    headers["Authorization"] = auth;
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      headers,
      // No AbortSignal — SSE connections are long-lived
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({
          error: "SSE upstream error",
          status: upstream.status,
        }),
        {
          status: upstream.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!upstream.body) {
      return new Response(JSON.stringify({ error: "No upstream body" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Pipe the upstream SSE stream directly to the client
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": process.env.CORS_ORIGIN ?? "*",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "SSE proxy failed";
    console.error("[sse-proxy] Failed to connect to upstream:", message);
    return new Response(JSON.stringify({ error: "SSE proxy connection failed", detail: message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
