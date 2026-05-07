// =============================================================================
// POST /api/verify/fetch-snapshot
// =============================================================================
// Server-only route: takes the request, calls the configured substrate's
// /admin/export-snapshot using server-side MMPM_API_KEY, returns the signed
// snapshot JSON to the browser. No auth required from the visitor -- this
// route is intentionally public so anyone can hit "Verify a fresh snapshot"
// on the marketing page.
//
// SECURITY NOTES
// --------------
// The substrate's API key is held server-side and never exposed to the
// browser. Each request to this route triggers one POST to the substrate,
// which in turn triggers one Vault sign call. To prevent abuse on a
// production deploy:
//   - Default to redactValues: true so atom plaintext is never exposed.
//   - Add rate limiting at the edge (Vercel / Cloudflare / nginx).
//   - Consider gating to a fixed substrate URL configured per-env.
// For local dev (MMPM_API_URL=localhost:3000) this is wide open by design.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";

const SUBSTRATE_URL = process.env.MMPM_API_URL ?? "https://mmpm.co.nz";
const SUBSTRATE_KEY = process.env.MMPM_API_KEY ?? "";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!SUBSTRATE_KEY) {
    return NextResponse.json(
      {
        error: "substrate_unconfigured",
        message: "MMPM_API_KEY is not set on the server. Cannot fetch a fresh snapshot.",
      },
      { status: 503 },
    );
  }

  // Default to redacted: a public-facing demo should not leak atom plaintext.
  // The verifier still proves integrity from leafHash alone.
  const body = (await request.json().catch(() => ({}))) as {
    redactValues?: boolean;
    includeAudit?: boolean;
  };
  const exportOpts = {
    redactValues: body.redactValues ?? true,
    includeAudit: body.includeAudit ?? true,
  };

  let upstream: Response;
  try {
    upstream = await fetch(`${SUBSTRATE_URL}/admin/export-snapshot`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUBSTRATE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(exportOpts),
      // Substrate -> Vault round-trip can take ~200-500ms; allow a generous timeout.
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: "substrate_unreachable",
        message: `Could not reach ${SUBSTRATE_URL}: ${msg}`,
      },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    return NextResponse.json(
      {
        error: "substrate_error",
        status: upstream.status,
        message: text.slice(0, 500),
      },
      { status: upstream.status },
    );
  }

  const snapshot = await upstream.json();
  return NextResponse.json(snapshot);
}
