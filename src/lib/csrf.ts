/**
 * CSRF protection for Next.js App Router API routes.
 *
 * Uses Origin/Referer header validation — no token needed.
 * This is the correct approach for cookie-based auth + SameSite=lax:
 *
 *   - SameSite=lax prevents cross-site POSTs from other domains
 *   - Origin check provides defence-in-depth for state-mutating methods
 *     (POST, PUT, PATCH, DELETE)
 *
 * Implementation notes:
 *   - Only validates state-mutating methods. GET/HEAD/OPTIONS are safe.
 *   - Allows requests from the same origin (scheme + host match).
 *   - Allows requests with no Origin header only when Referer also matches
 *     (covers some older browser / server-side request scenarios).
 *   - Rejects everything else with 403.
 *
 * Usage in a route handler:
 *   ```ts
 *   import { verifyCsrfOrigin } from "@/lib/csrf";
 *
 *   export async function POST(request: NextRequest) {
 *     const csrfError = verifyCsrfOrigin(request);
 *     if (csrfError) return csrfError;
 *     // ... handler logic
 *   }
 *   ```
 *
 * SEC: This is not a substitute for server-side session validation —
 * it is a complement to it. Always validate the session token separately.
 */

import { NextRequest, NextResponse } from "next/server";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Verify that a state-mutating request originates from the same origin.
 *
 * Returns a 403 NextResponse if the CSRF check fails, or null if it passes.
 * Skips non-mutating methods (GET, HEAD, OPTIONS).
 */
export function verifyCsrfOrigin(request: NextRequest): NextResponse | null {
  if (!MUTATING_METHODS.has(request.method)) {
    return null; // Safe method — no CSRF risk
  }

  const requestUrl = new URL(request.url);
  const expectedOrigin = `${requestUrl.protocol}//${requestUrl.host}`;

  // Check Origin header first
  const originHeader = request.headers.get("origin");
  if (originHeader) {
    if (originHeader === expectedOrigin) {
      return null; // Same origin — allow
    }
    console.warn(
      `[csrf] Blocked: Origin="${originHeader}" expected="${expectedOrigin}" ` +
        `method=${request.method} path=${requestUrl.pathname}`,
    );
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // No Origin header — fall back to Referer
  const refererHeader = request.headers.get("referer");
  if (refererHeader) {
    try {
      const refererUrl = new URL(refererHeader);
      const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
      if (refererOrigin === expectedOrigin) {
        return null; // Same origin referer — allow
      }
    } catch {
      // Malformed Referer — deny
    }
    console.warn(
      `[csrf] Blocked: Referer="${refererHeader}" expected origin="${expectedOrigin}" ` +
        `method=${request.method} path=${requestUrl.pathname}`,
    );
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Neither Origin nor Referer present on a mutating request.
  // This can happen in legitimate server-side calls (e.g. our own proxies).
  // Check for an internal forwarding header set by our proxy routes.
  const internalHeader = request.headers.get("x-mmpm-internal");
  if (internalHeader === "1") {
    return null; // Internal server-side proxy — allow
  }

  // No provenance at all — deny as a safety default.
  console.warn(
    `[csrf] Blocked: No Origin or Referer on mutating request ` +
      `method=${request.method} path=${requestUrl.pathname}`,
  );
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
