/**
 * Substrate API proxy.
 *
 * Forwards authenticated requests to mmpm-compute's substrate endpoints.
 * Same pattern as the compute proxy — session cookie → Bearer token.
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

  // Forward Content-Type for POST/PUT/PATCH
  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  let body: string | undefined;

  // Forward body for non-GET requests
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.text();
  }

  const { response } = await computeProxy(`api/v1/substrate/${subPath}`, {
    method: request.method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    headers,
    body,
    label: `substrate/${subPath}`,
  });

  return response;
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
