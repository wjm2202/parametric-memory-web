import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const COMPUTE_URL = process.env.MMPM_COMPUTE_URL ?? "http://localhost:3100";
const SESSION_COOKIE = "mmpm_session";

/**
 * Compute proxy — forwards /api/compute/* → mmpm-compute /api/*.
 *
 * Strips the /compute prefix and forwards the session cookie as Bearer.
 * Handles GET, POST, and DELETE.
 *
 * Examples:
 *   GET /api/compute/instances        → GET  {COMPUTE_URL}/api/instances
 *   GET /api/compute/instances/uuid   → GET  {COMPUTE_URL}/api/instances/uuid
 */

async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}

function buildHeaders(sessionToken?: string): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionToken) headers["Authorization"] = `Bearer ${sessionToken}`;
  return headers;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  const sessionToken = await getSessionToken();

  try {
    const res = await fetch(`${COMPUTE_URL}/api/${path.join("/")}`, {
      method: "GET",
      headers: buildHeaders(sessionToken),
      cache: "no-store",
    });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[compute-proxy] GET /api/${path.join("/")} failed:`, err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  const sessionToken = await getSessionToken();

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* empty body */
  }

  try {
    const res = await fetch(`${COMPUTE_URL}/api/${path.join("/")}`, {
      method: "POST",
      headers: buildHeaders(sessionToken),
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const responseBody = await res.text();
    return new NextResponse(responseBody, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[compute-proxy] POST /api/${path.join("/")} failed:`, err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  const sessionToken = await getSessionToken();

  try {
    const res = await fetch(`${COMPUTE_URL}/api/${path.join("/")}`, {
      method: "DELETE",
      headers: buildHeaders(sessionToken),
      cache: "no-store",
    });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[compute-proxy] DELETE /api/${path.join("/")} failed:`, err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
