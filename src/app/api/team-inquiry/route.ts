/**
 * POST /api/team-inquiry — DEPRECATED (2026-04-19, sprint 2026-W17 Item B)
 *
 * The canonical endpoint is now POST /api/capacity-inquiry, which accepts a
 * `tier` field so every pricing tier can signal "my limits aren't enough —
 * quote me something custom".
 *
 * This shim is kept for 30 days to avoid breaking:
 *   - bookmarked URLs,
 *   - any rogue client still holding the old form open,
 *   - existing integration tests that exercise this path.
 *
 * On 2026-05-19 (or later) once stdout shows no more traffic, delete this
 * route. The shim translates the legacy `{ name, email, teamSize }` shape
 * into the new `{ name, email, tier: "team", message }` shape and forwards
 * to the shared handler.
 */
import { NextRequest, NextResponse } from "next/server";
import { handleCapacityInquiry } from "../capacity-inquiry/handler";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { name?: string; email?: string; teamSize?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { name, email, teamSize } = body;
  if (!name || !email || !teamSize) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  console.warn(
    `[team-inquiry] DEPRECATED endpoint — forwarding to /api/capacity-inquiry (tier=team, teamSize=${teamSize})`,
  );

  const result = await handleCapacityInquiry({
    name,
    email,
    tier: "team",
    message: `Team size: ${teamSize} people`,
  });

  if (result.ok) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: result.error }, { status: result.status });
}
