import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { computeProxy, authHeaders } from "@/lib/compute-proxy";

const SESSION_COOKIE = "mmpm_session";

/**
 * Auth proxy — forwards /api/auth/* requests to mmpm-compute.
 *
 * The session cookie is forwarded as Authorization: Bearer so mmpm-compute's
 * session middleware can validate it. This keeps API keys and session tokens
 * separate concerns.
 *
 * Routes handled:
 *   POST /api/auth/request-link  — public, no cookie needed
 *   POST /api/auth/logout        — requires session cookie
 *   GET  /api/auth/me            — requires session cookie
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
  const subPath = path.join("/");
  const sessionToken = await getSessionToken();

  const { response } = await computeProxy(`api/auth/${subPath}`, {
    method: "GET",
    headers: authHeaders(sessionToken),
    label: `auth/${subPath}`,
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
  const subPath = path.join("/");
  const sessionToken = await getSessionToken();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const result = await computeProxy(`api/auth/${subPath}`, {
    method: "POST",
    body,
    headers: authHeaders(sessionToken),
    label: `auth/${subPath}`,
    forwardHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
  });

  // If logging out, also clear the cookie on the website side
  if (subPath === "logout" && result.ok) {
    const isLocalhost =
      request.nextUrl.hostname === "localhost" || request.nextUrl.hostname === "127.0.0.1";
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: !isLocalhost,
      sameSite: "lax",
      path: "/",
      maxAge: 0, // Expire immediately
    });
  }

  return result.response;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const csrfError = verifyCsrfOrigin(request);
  if (csrfError) return csrfError;

  const { path } = await params;
  const subPath = path.join("/");
  const sessionToken = await getSessionToken();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { response } = await computeProxy(`api/auth/${subPath}`, {
    method: "DELETE",
    body,
    headers: authHeaders(sessionToken),
    label: `auth/${subPath}`,
  });

  return response;
}
