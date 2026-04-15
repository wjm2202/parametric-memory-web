import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { computeProxy, authHeaders } from "@/lib/compute-proxy";

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  const sessionToken = await getSessionToken();
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
  const { path } = await params;
  const sessionToken = await getSessionToken();
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
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  const sessionToken = await getSessionToken();
  const subPath = path.join("/");

  const { response } = await computeProxy(`api/${subPath}`, {
    method: "DELETE",
    headers: authHeaders(sessionToken),
    label: `compute/${subPath}`,
  });

  return response;
}
