import { NextRequest, NextResponse } from "next/server";
import { proxyToMmpm } from "@/lib/mmpm";

/**
 * Rate limiting is handled by the MMPM server itself.
 * This proxy is same-origin only (browser → Next.js → MMPM),
 * so we don't add a second rate limiter that fights our own frontend.
 *
 * In production, nginx provides external rate limiting.
 */

/* ─── CORS helper ─── */
function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": process.env.CORS_ORIGIN ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };
}

/* ─── request logger ─── */
function logRequest(method: string, path: string[], status: number, durationMs: number) {
  const level = status >= 500 ? "ERROR" : status >= 400 ? "WARN" : "INFO";
  console.log(
    `[mmpm-proxy] ${level} ${method} /api/memory/${path.join("/")} → ${status} (${durationMs}ms)`,
  );
}

/* ─── OPTIONS (preflight) ─── */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/* ─── GET handler ─── */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  // Forward query params (e.g. ?includeWeights=true, ?type=fact, ?limit=10)
  const queryString = _request.nextUrl.search;
  const start = Date.now();
  const result = await proxyToMmpm(path, "GET", undefined, queryString);
  logRequest("GET", path, result.status, Date.now() - start);

  return new NextResponse(result.body, {
    status: result.status,
    headers: {
      "Content-Type": result.contentType,
      ...corsHeaders(),
    },
  });
}

/* ─── POST handler ─── */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;

  let body: unknown;
  try {
    body = await _request.json();
  } catch {
    body = undefined;
  }

  const start = Date.now();
  const result = await proxyToMmpm(path, "POST", body);
  logRequest("POST", path, result.status, Date.now() - start);

  return new NextResponse(result.body, {
    status: result.status,
    headers: {
      "Content-Type": result.contentType,
      ...corsHeaders(),
    },
  });
}
