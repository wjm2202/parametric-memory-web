/**
 * Tests for verifyCsrfOrigin.
 *
 * Pre-Sprint-11 there was no test file for this function. SPRINT-11.H2
 * removes the `x-mmpm-internal: 1` no-provenance bypass; this file
 * locks down the full contract so future drift is loud.
 *
 * Contract under test
 * ───────────────────
 *
 *   1. Safe methods (GET / HEAD / OPTIONS) → null (skip).
 *   2. Mutating method (POST / PUT / PATCH / DELETE) with same-origin
 *      Origin header → null (allow).
 *   3. Mutating method with cross-origin Origin → 403.
 *   4. Mutating method, no Origin, same-origin Referer → null.
 *   5. Mutating method, no Origin, cross-origin Referer → 403.
 *   6. Mutating method, no Origin, malformed Referer → 403.
 *   7. Mutating method, no Origin AND no Referer → 403.
 *
 *   8. SPRINT-11.H2 REGRESSION GUARD:
 *      Mutating method, no Origin, no Referer, BUT `x-mmpm-internal: 1`
 *      header set → 403. (Pre-H2 this would have returned null. The
 *      header has zero legitimate callers; deletion is forward-only.)
 *
 *   9. Behind reverse proxy: `X-Forwarded-Host` + `X-Forwarded-Proto`
 *      reconstruct the expected origin so a browser hitting the public
 *      domain isn't mismatched against the internal nginx target.
 */

import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "./csrf";

const PUBLIC_ORIGIN = "https://parametric-memory.dev";
const INTERNAL_URL = "http://127.0.0.1:3000/api/auth/logout";

/**
 * Build a NextRequest with the given method + headers. The `url` is the
 * internal-after-proxy URL (what Next.js actually sees post-nginx); the
 * `X-Forwarded-Host` + `X-Forwarded-Proto` headers tell the CSRF function
 * what the browser THINKS it requested.
 */
function buildRequest(opts: {
  method: string;
  headers?: Record<string, string>;
  url?: string;
}): NextRequest {
  return new NextRequest(opts.url ?? INTERNAL_URL, {
    method: opts.method,
    headers: opts.headers ?? {},
  });
}

describe("verifyCsrfOrigin — safe methods", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    it(`${method} returns null without checking Origin`, () => {
      const result = verifyCsrfOrigin(buildRequest({ method }));
      expect(result).toBeNull();
    });
  }
});

describe("verifyCsrfOrigin — Origin header", () => {
  it("same-origin POST returns null (allowed)", () => {
    const result = verifyCsrfOrigin(
      buildRequest({
        method: "POST",
        headers: {
          "x-forwarded-host": "parametric-memory.dev",
          "x-forwarded-proto": "https",
          origin: PUBLIC_ORIGIN,
        },
      }),
    );
    expect(result).toBeNull();
  });

  it("cross-origin POST returns 403", async () => {
    const result = verifyCsrfOrigin(
      buildRequest({
        method: "POST",
        headers: {
          "x-forwarded-host": "parametric-memory.dev",
          "x-forwarded-proto": "https",
          origin: "https://evil.example.com",
        },
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("scheme-mismatch POST returns 403 (https vs http)", async () => {
    // Defends against a downgraded forwarded-proto header. Even if the
    // host matches, the scheme component of the origin must too.
    const result = verifyCsrfOrigin(
      buildRequest({
        method: "POST",
        headers: {
          "x-forwarded-host": "parametric-memory.dev",
          "x-forwarded-proto": "https",
          origin: "http://parametric-memory.dev",
        },
      }),
    );
    expect(result?.status).toBe(403);
  });
});

describe("verifyCsrfOrigin — Referer fallback", () => {
  it("no Origin + same-origin Referer returns null", () => {
    const result = verifyCsrfOrigin(
      buildRequest({
        method: "POST",
        headers: {
          "x-forwarded-host": "parametric-memory.dev",
          "x-forwarded-proto": "https",
          referer: `${PUBLIC_ORIGIN}/admin/security`,
        },
      }),
    );
    expect(result).toBeNull();
  });

  it("no Origin + cross-origin Referer returns 403", () => {
    const result = verifyCsrfOrigin(
      buildRequest({
        method: "POST",
        headers: {
          "x-forwarded-host": "parametric-memory.dev",
          "x-forwarded-proto": "https",
          referer: "https://evil.example.com/page",
        },
      }),
    );
    expect(result?.status).toBe(403);
  });

  it("no Origin + malformed Referer returns 403", () => {
    const result = verifyCsrfOrigin(
      buildRequest({
        method: "POST",
        headers: {
          "x-forwarded-host": "parametric-memory.dev",
          "x-forwarded-proto": "https",
          referer: "not-a-url-at-all",
        },
      }),
    );
    expect(result?.status).toBe(403);
  });
});

describe("verifyCsrfOrigin — no provenance + SPRINT-11.H2 regression guard", () => {
  it("no Origin AND no Referer returns 403 (deny default)", () => {
    const result = verifyCsrfOrigin(
      buildRequest({
        method: "POST",
        headers: {
          "x-forwarded-host": "parametric-memory.dev",
          "x-forwarded-proto": "https",
        },
      }),
    );
    expect(result?.status).toBe(403);
  });

  // ─── REGRESSION GUARD (SPRINT-11.H2) ────────────────────────────────
  //
  // Pre-H2: a mutating request with no Origin AND no Referer BUT
  //         `x-mmpm-internal: 1` returned null (allowed).
  // Post-H2: the bypass is deleted. The same request must now be 403.
  //
  // If anyone reintroduces the bypass — by re-adding the header check
  // OR by adding a new bypass header with similar semantics — this test
  // fails. Do not delete it; do not weaken the assertion.
  it("REGRESSION: no Origin/Referer + x-mmpm-internal:1 still returns 403", () => {
    const result = verifyCsrfOrigin(
      buildRequest({
        method: "POST",
        headers: {
          "x-forwarded-host": "parametric-memory.dev",
          "x-forwarded-proto": "https",
          "x-mmpm-internal": "1",
        },
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("REGRESSION: x-mmpm-internal:1 ALSO does not bypass when Origin is foreign", () => {
    // Belt-and-braces: an attacker who DOES set Origin to a foreign value
    // and ALSO attaches x-mmpm-internal:1 must still be blocked. The
    // header has no legitimate semantic now and must never re-acquire one.
    const result = verifyCsrfOrigin(
      buildRequest({
        method: "POST",
        headers: {
          "x-forwarded-host": "parametric-memory.dev",
          "x-forwarded-proto": "https",
          origin: "https://evil.example.com",
          "x-mmpm-internal": "1",
        },
      }),
    );
    expect(result?.status).toBe(403);
  });
});

describe("verifyCsrfOrigin — reverse-proxy origin reconstruction", () => {
  it("X-Forwarded-Host / X-Forwarded-Proto rebuild expected origin", () => {
    // Without these headers, request.url is http://127.0.0.1:3000 and
    // every legitimate browser hit (Origin = https://parametric-memory.dev)
    // would 403. With them, the function reconstructs the public-facing
    // expected origin and matches correctly.
    const result = verifyCsrfOrigin(
      buildRequest({
        method: "POST",
        headers: {
          "x-forwarded-host": "parametric-memory.dev",
          "x-forwarded-proto": "https",
          origin: "https://parametric-memory.dev",
        },
      }),
    );
    expect(result).toBeNull();
  });

  it("first entry wins on comma-separated X-Forwarded-Host", () => {
    // Some proxies append; we take the leftmost (the originally-faced
    // host). Otherwise an attacker could inject a host into the chain.
    const result = verifyCsrfOrigin(
      buildRequest({
        method: "POST",
        headers: {
          "x-forwarded-host": "parametric-memory.dev, evil.example.com",
          "x-forwarded-proto": "https, http",
          origin: "https://parametric-memory.dev",
        },
      }),
    );
    expect(result).toBeNull();
  });
});
