/**
 * V1.3 — JWKS publication CORS headers.
 *
 * The verify page (and any third-party verifier) does a cross-origin
 * `fetch(snap.signature.keyUri)` from the browser to confirm the embedded
 * public key matches the one published independently. The endpoint is a
 * static file at /public/.well-known/jwks.json, but Next.js's default static
 * response has NO Access-Control-Allow-Origin header — so without the
 * header rule added in next.config.ts, the browser blocks the fetch and the
 * verifier silently falls back to the embedded key.
 *
 * This file exercises the next.config headers() callback the same way
 * seo-headers.test.ts does, asserting the JWKS path rule exists with the
 * expected ACAO / ACAM / cache directives.
 */

import { describe, it, expect } from "vitest";
import nextConfig from "../../../next.config";

interface HeaderRule {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

describe("JWKS CORS — next.config.ts headers", () => {
  it("defines a header rule for /.well-known/jwks.json", async () => {
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    const jwks = rules.find((r) => r.source === "/.well-known/jwks.json");
    expect(
      jwks,
      "Missing header rule for /.well-known/jwks.json — V1.3 reverted or regressed",
    ).toBeDefined();
  });

  it("emits Access-Control-Allow-Origin: * on the JWKS path", async () => {
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    const jwks = rules.find((r) => r.source === "/.well-known/jwks.json")!;
    const acao = jwks.headers.find((h) => h.key === "Access-Control-Allow-Origin");
    expect(acao, "JWKS path missing Access-Control-Allow-Origin header").toBeDefined();
    // Public-key publication is, by definition, public. The verify page may
    // be served from parametric-memory.dev, localhost:3001, or any
    // third-party verifier — `*` is the correct ACAO. If this ever tightens
    // to a specific origin, V1.3's marketing claim ("anyone can verify
    // independently") narrows accordingly.
    expect(acao!.value).toBe("*");
  });

  it("allows GET and OPTIONS preflight on the JWKS path", async () => {
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    const jwks = rules.find((r) => r.source === "/.well-known/jwks.json")!;
    const acam = jwks.headers.find((h) => h.key === "Access-Control-Allow-Methods");
    expect(acam, "JWKS path missing Access-Control-Allow-Methods header").toBeDefined();
    expect(acam!.value).toMatch(/\bGET\b/);
    expect(acam!.value).toMatch(/\bOPTIONS\b/);
  });

  it("emits a finite Cache-Control max-age so key rotations propagate", async () => {
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    const jwks = rules.find((r) => r.source === "/.well-known/jwks.json")!;
    const cache = jwks.headers.find((h) => h.key === "Cache-Control");
    expect(cache, "JWKS path missing Cache-Control header").toBeDefined();
    // We need SOME caching (don't hammer the origin) but not so much that a
    // key rotation takes hours to propagate. The current value is
    // `public, max-age=300, must-revalidate` (5 min). Assert the shape, not
    // the exact number, so a future tuning isn't a test rewrite.
    expect(cache!.value).toMatch(/public/);
    expect(cache!.value).toMatch(/max-age=\d+/);
    // Extract and check the max-age is in a reasonable range — between
    // 1 minute (paranoid rotation) and 1 day (stale-tolerable).
    const match = cache!.value.match(/max-age=(\d+)/);
    expect(match).not.toBeNull();
    const maxAge = parseInt(match![1], 10);
    expect(maxAge).toBeGreaterThanOrEqual(60);
    expect(maxAge).toBeLessThanOrEqual(86_400);
  });

  it("declares application/json content type", async () => {
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    const jwks = rules.find((r) => r.source === "/.well-known/jwks.json")!;
    const ct = jwks.headers.find((h) => h.key === "Content-Type");
    expect(ct).toBeDefined();
    expect(ct!.value).toMatch(/application\/json/);
  });

  it("does NOT regress the existing security or robots header rules", async () => {
    // V1.3 added one new rule; the existing four must still be present.
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    const sources = rules.map((r) => r.source);
    expect(sources).toContain("/(.*)"); // wildcard security headers
    expect(sources).toContain("/api/:path*"); // noindex
    expect(sources).toContain("/admin/:path*");
    expect(sources).toContain("/dashboard/:path*");
    expect(sources).toContain("/.well-known/jwks.json"); // V1.3 addition
  });
});
