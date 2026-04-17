/**
 * Multi-substrate API proxy.
 *
 * Forwards authenticated requests to mmpm-compute's slug-scoped
 * `/api/v1/substrates/*` endpoints. Supports:
 *   GET  /api/substrates           → list all substrates
 *   GET  /api/substrates/:slug     → substrate details
 *   POST /api/substrates/:slug/*   → cancel, reactivate, rotate-key, claim-key, deprovision
 *   GET  /api/substrates/:slug/*   → key-rotation/status, usage
 *
 * @see docs/api-contracts-multi-substrate.md §4
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { computeProxy } from "@/lib/compute-proxy";

const SESSION_COOKIE = "mmpm_session";

async function proxyRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { path } = await params;
  const subPath = path.join("/");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${sessionToken}`,
  };

  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  let body: unknown;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      body = await request.json();
    } catch {
      /* empty body is fine for action endpoints */
    }
  }

  const { response } = await computeProxy(`api/v1/substrates/${subPath}`, {
    method: request.method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    headers,
    body,
    label: `substrates/${subPath}`,
  });

  return response;
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
