import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { computeProxy, authHeaders } from "@/lib/compute-proxy";
import { verifyCsrfOrigin } from "@/lib/csrf";

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
 *
 * CSRF: POST and DELETE are state-mutating session-auth proxies. Origin-checked
 * via verifyCsrfOrigin (P0-5, sprint 2026-05-18). GET is safe and skipped.
 *
 * AUTH (2026-06-13): every method requires a session cookie and returns 401 if
 * absent — matching the /api/substrate(s) sibling proxies. Previously a missing
 * cookie forwarded to compute with NO Authorization header (defense-in-depth
 * gap: the BFF relied entirely on compute rejecting unauthenticated requests).
 * For POST/DELETE the CSRF origin check runs FIRST (a cross-origin attacker is
 * rejected with 403 before we ever look at the session), then the session guard.
 */

async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const subPath = path.join("/");

  const { response } = await computeProxy(`api/${subPath}`, {
    method: "GET",
    headers: authHeaders(sessionToken),
    label: `compute/${subPath}`,
  });

  return response;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const csrfError = verifyCsrfOrigin(request);
  if (csrfError) return csrfError;

  const { path } = await params;
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const subPath = path.join("/");

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* empty body */
  }

  const { response } = await computeProxy(`api/${subPath}`, {
    method: "POST",
    body,
    headers: authHeaders(sessionToken),
    label: `compute/${subPath}`,
  });

  return response;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const csrfError = verifyCsrfOrigin(request);
  if (csrfError) return csrfError;

  const { path } = await params;
  const sessionToken = await getSessionToken();
  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const subPath = path.join("/");

  const { response } = await computeProxy(`api/${subPath}`, {
    method: "DELETE",
    headers: authHeaders(sessionToken),
    label: `compute/${subPath}`,
  });

  return response;
}
