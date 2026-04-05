import { NextRequest, NextResponse } from "next/server";
import { verifyCsrfOrigin } from "@/lib/csrf";

const COMPUTE_URL = process.env.MMPM_COMPUTE_URL ?? "http://localhost:3100";

/**
 * POST /api/signup
 *
 * Proxies to compute POST /api/v1/signup.
 * Public endpoint — no session cookie required.
 *
 * Body:    { email: string, source?: string }
 * Returns: { customerId, slug, tier, mcpEndpoint, apiKey, mcpConfig, limits, status }
 *
 * The apiKey in the response is shown once and never stored in plaintext.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfError = verifyCsrfOrigin(request);
  if (csrfError) return csrfError;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const res = await fetch(`${COMPUTE_URL}/api/v1/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const responseBody = await res.text();
    return new NextResponse(responseBody, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[signup-proxy] POST /api/v1/signup failed:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
