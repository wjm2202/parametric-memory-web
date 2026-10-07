/**
 * POST /api/capacity-inquiry
 *
 * Canonical endpoint for capacity inquiries from any pricing tier.
 * Body: { name: string, email: string, tier: TierId, message: string }
 *
 * See handler.ts for validation + side effects. This file is responsible for
 * the CSRF origin check, parsing the request body, and mapping
 * `HandlerResult` to HTTP.
 *
 * CSRF (added 2026-10-08): since the handler now emails support@, a
 * cross-site page must not be able to drive submissions. The pricing-page
 * form is a same-origin fetch, so browsers send a matching Origin header.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { handleCapacityInquiry } from "./handler";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfError = verifyCsrfOrigin(request);
  if (csrfError) return csrfError;

  let body: {
    name?: string;
    email?: string;
    tier?: string;
    message?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await handleCapacityInquiry(body);
  if (result.ok) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: result.error }, { status: result.status });
}
