import { NextRequest, NextResponse } from "next/server";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { computeProxy } from "@/lib/compute-proxy";

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

  const { response } = await computeProxy("api/v1/signup", {
    method: "POST",
    body,
    label: "signup",
  });

  return response;
}
