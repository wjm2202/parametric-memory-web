import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { verifyCsrfOrigin } from "@/lib/csrf";

const COMPUTE_URL = process.env.MMPM_COMPUTE_URL ?? "http://localhost:3100";

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

function buildHeaders(sessionToken?: string): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (sessionToken) {
    headers["Authorization"] = `Bearer ${sessionToken}`;
  }
  return headers;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  const subPath = path.join("/");
  const sessionToken = await getSessionToken();

  try {
    const res = await fetch(`${COMPUTE_URL}/api/auth/${subPath}`, {
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
    console.error(`[auth-proxy] GET /api/auth/${subPath} failed:`, err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
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

  try {
    const res = await fetch(`${COMPUTE_URL}/api/auth/${subPath}`, {
      method: "POST",
      headers: buildHeaders(sessionToken),
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const responseBody = await res.text();

    // If logging out, also clear the cookie on the website side
    if (subPath === "logout" && res.ok) {
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

    // Forward rate-limit headers so the client can show contextual error messages
    const responseHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    for (const h of ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"]) {
      const v = res.headers.get(h);
      if (v) responseHeaders[h] = v;
    }

    return new NextResponse(responseBody, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error(`[auth-proxy] POST /api/auth/${subPath} failed:`, err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
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

  try {
    const res = await fetch(`${COMPUTE_URL}/api/auth/${subPath}`, {
      method: "DELETE",
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
    console.error(`[auth-proxy] DELETE /api/auth/${subPath} failed:`, err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
