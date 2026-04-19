/**
 * POST /api/capacity-inquiry
 *
 * Canonical endpoint for capacity inquiries from any pricing tier.
 * Body: { name: string, email: string, tier: TierId, message: string }
 *
 * See handler.ts for validation + side effects. This file is only responsible
 * for parsing the request body and mapping `HandlerResult` to HTTP.
 */
import { NextRequest, NextResponse } from "next/server";
import { handleCapacityInquiry } from "./handler";

export async function POST(request: NextRequest): Promise<NextResponse> {
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
