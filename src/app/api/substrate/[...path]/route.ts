/**
 * Substrate API proxy.
 *
 * Forwards authenticated requests to mmpm-compute's substrate endpoints.
 * Same pattern as the compute proxy — session cookie → Bearer token.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const COMPUTE_URL = process.env.MMPM_COMPUTE_URL ?? "http://localhost:3100";
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
  const url = `${COMPUTE_URL}/api/v1/substrate/${subPath}`;

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${sessionToken}`,
    };

    // Forward Content-Type for POST/PUT/PATCH
    const contentType = request.headers.get("content-type");
    if (contentType) headers["Content-Type"] = contentType;

    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
    };

    // Forward body for non-GET requests
    if (request.method !== "GET" && request.method !== "HEAD") {
      fetchOptions.body = await request.text();
    }

    const res = await fetch(url, fetchOptions);
    const data = await res.text();

    return new NextResponse(data, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json(
      { error: "upstream_error", message: "Failed to reach compute service" },
      { status: 502 },
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
