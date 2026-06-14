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
// This route is a deliberate "confused deputy": it is PUBLIC (no caller auth)
// but forwards to the substrate's master-key-protected /admin/export-snapshot
// using a server-held key. That is only safe if the response can NEVER contain
// atom plaintext. Therefore:
//   - redactValues / includeAudit are HARD-CODED server-side and the request
//     body is IGNORED. A caller cannot ask for plaintext or the audit log.
//     (Previously the body could set redactValues:false -> full memory dump.
//      Fixed 2026-06-13; the substrate also now redacts by default in depth.)
//   - A per-IP rate limit caps abuse / Vault-sign amplification. Add an edge
//     limit (Cloudflare / nginx) too for multi-instance deploys.
//   - MMPM_API_URL SHOULD point at a dedicated demo substrate with a
//     read/export-scoped key, never master or a customer (config, ops-owned).
// The verifier proves integrity from leafHash + roots + signature alone; it
// never needs plaintext.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";

const SUBSTRATE_URL = process.env.MMPM_API_URL ?? "https://mmpm.co.nz";
const SUBSTRATE_KEY = process.env.MMPM_API_KEY ?? "";

// Atom plaintext and the audit log are NEVER exposed on this public route.
// These are constants, not derived from the request — do not make them
// configurable by the caller.
const PUBLIC_EXPORT_OPTS = Object.freeze({
  redactValues: true,
  includeAudit: false,
});

// --- Per-IP fixed-window rate limit (in-process) ----------------------------
// Defense against using this unauthenticated route as a Vault-sign / cost
// amplifier. In-process only (per server instance) — pair with an edge limit
// in production. Window + ceiling are deliberately tight; this endpoint is a
// human-clicks-"Verify" action, not a hot path.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now >= entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    // Opportunistic cleanup so the map can't grow unbounded.
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
    }
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

function clientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

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

  if (rateLimited(clientIp(request))) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many snapshot requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  // The request body is intentionally NOT read for export options. Redaction
  // and audit-exclusion are enforced server-side and cannot be overridden.
  const exportOpts = PUBLIC_EXPORT_OPTS;

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
