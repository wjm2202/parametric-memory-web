/**
 * Regression test — security-header ownership between nginx and the app.
 *
 * THREE BUGS THIS PINS DOWN, all found 2026-09-10 by measuring the live site
 * rather than reading the config (the config alone cannot tell you what a
 * response carries — the response is the sum of every layer).
 *
 * ── 1. DUPLICATED HEADERS ────────────────────────────────────────────────
 * nginx.conf and next.config.ts both set X-Content-Type-Options,
 * X-Frame-Options, Referrer-Policy and Permissions-Policy, so every response
 * carried each one twice. Measured on the homepage before the fix:
 *     x-frame-options:        "DENY, DENY"
 *     x-content-type-options: "nosniff, nosniff"
 *     referrer-policy:        "strict-origin-when-cross-origin, strict-origin-…"
 *     permissions-policy:     "camera=(), … , camera=(), …"
 * This is not cosmetic. "nosniff" must be the entire value of
 * X-Content-Type-Options, and browsers may discard a multi-valued
 * X-Frame-Options outright — so the duplication risked DISABLING the
 * protections it appeared to be doubling.
 *
 * The app is the deliberate owner: src/app/__tests__/seo-headers.test.ts:61
 * pins those four to next.config.ts's "/(.*)" rule ("preserves the existing
 * security headers — no regression"). Nothing pinned nginx's copies. So the
 * nginx copies were removed and the app remains sole owner.
 *
 * ── 2. add_header INHERITANCE IN /_next/static/ ──────────────────────────
 * Per the nginx docs, add_header directives "are inherited from the previous
 * configuration level if and only if there are no add_header directives
 * defined on the current level". `location /_next/static/` declares its own
 * (Cache-Control), so it inherited NOTHING from the server block. Measured on
 * a real 200 asset before the fix: Content-Security-Policy,
 * Strict-Transport-Security and X-XSS-Protection all absent. It looked
 * survivable only because the app backfilled the other four.
 *
 * ── 3. HSTS MISSING ON THE www REDIRECT ─────────────────────────────────
 * `curl -sI https://www.parametric-memory.dev/` returned `HTTP/2 301` with no
 * strict-transport-security. hstspreload.org requires redirects to serve the
 * HSTS header, and this site is ON the preload list with, per the ops notes,
 * "no margin". The www server block was a bare `return 301` with no
 * add_header.
 *
 * Lives in src/ (not repo root) because vitest's include is src/** — a test
 * file at the repo root never runs. Same rationale as
 * src/nginx-brand-assets.test.ts and src/nginx-csp.test.ts.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import nextConfig from "../next.config";

const repoRoot = path.resolve(__dirname, "..");
const confRaw = readFileSync(path.join(repoRoot, "nginx.conf"), "utf8");

// Assert against the EFFECTIVE config only. nginx treats `#` to end-of-line as
// a comment, and the blocks above deliberately quote the removed directives
// and the old duplicated values in prose so future readers understand the
// history. Comments must not be able to trip (or shadow) these assertions.
const conf = confRaw
  .split("\n")
  .map((line) => line.replace(/#.*$/, ""))
  .join("\n");

/** The four the APP owns — nginx must not set any of them. */
const APP_OWNED = [
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Permissions-Policy",
] as const;

/** Extract the body of a `location <match> { … }` block from the config. */
function locationBody(match: string): string {
  const re = new RegExp(
    `location\\s+${match.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`,
  );
  const m = conf.match(re);
  if (!m) throw new Error(`location ${match} not found in nginx.conf`);
  return m[1];
}

describe("nginx.conf — no duplicated security headers", () => {
  it.each(APP_OWNED)("does not set %s (the app owns it)", (header) => {
    // A match here means nginx has started duplicating an app-owned header
    // again, producing e.g. "DENY, DENY" on every response.
    expect(
      new RegExp(`add_header\\s+${header}\\b`, "i").test(conf),
      `nginx sets ${header}, which next.config.ts also sets on "/(.*)" — ` +
        `that yields a doubled header value on every response`,
    ).toBe(false);
  });

  it("next.config.ts still owns all four — they must not vanish entirely", async () => {
    // The other half of the contract. Removing them from nginx is only safe
    // while the app keeps setting them; if a future edit strips the app rule,
    // these headers disappear site-wide with no error anywhere.
    const rules = (await nextConfig.headers!()) as Array<{
      source: string;
      headers: Array<{ key: string; value: string }>;
    }>;
    const wildcard = rules.find((r) => r.source === "/(.*)");
    expect(wildcard, 'no "/(.*)" rule in next.config.ts headers()').toBeDefined();
    const keys = wildcard!.headers.map((h) => h.key);
    for (const header of APP_OWNED) expect(keys).toContain(header);
  });
});

describe("nginx.conf — the headers nginx does own", () => {
  it("sets HSTS and X-XSS-Protection at server level", () => {
    expect(conf).toMatch(
      /add_header\s+Strict-Transport-Security\s+"max-age=63072000; includeSubDomains; preload"\s+always;/,
    );
    expect(conf).toMatch(/add_header\s+X-XSS-Protection\s+"0"\s+always;/);
  });

  it("sets a Content-Security-Policy with frame-ancestors 'none'", () => {
    expect(conf).toMatch(/add_header\s+Content-Security-Policy/);
    expect(conf).toMatch(/frame-ancestors 'none'/);
  });
});

describe("nginx.conf — /_next/static/ repeats what it cannot inherit", () => {
  const body = () => locationBody("/_next/static/");

  it("still declares its own Cache-Control (the reason inheritance breaks)", () => {
    // If this ever stops being true the location inherits normally and the
    // repeated headers below become redundant rather than load-bearing —
    // which is a deliberate decision, not something to discover by accident.
    expect(body()).toMatch(/add_header\s+Cache-Control/);
  });

  it("repeats HSTS, because inheritance does not reach this block", () => {
    expect(body()).toMatch(
      /add_header\s+Strict-Transport-Security\s+"max-age=63072000; includeSubDomains; preload"\s+always;/,
    );
  });

  it("repeats X-XSS-Protection", () => {
    expect(body()).toMatch(/add_header\s+X-XSS-Protection\s+"0"\s+always;/);
  });

  it("does NOT repeat the app-owned four (that would re-create the duplicate)", () => {
    for (const header of APP_OWNED) {
      expect(
        new RegExp(`add_header\\s+${header}\\b`, "i").test(body()),
        `/_next/static/ sets ${header}, which the app also sets`,
      ).toBe(false);
    }
  });

  it("proxies to the app rather than serving from a filesystem root", () => {
    // The /brand/* lesson (af9a16a): a `root` pointing at a host path that
    // does not exist inside the deploy 404s everything under it.
    expect(body()).toMatch(/proxy_pass\s+http:\/\/127\.0\.0\.1:3000\s*;/);
    expect(body()).not.toMatch(/\broot\s+/);
  });
});

describe("nginx.conf — the www redirect carries HSTS", () => {
  it("adds HSTS in the www server block", () => {
    // Scope to the www block specifically: a match anywhere in the file would
    // be satisfied by the apex block and prove nothing.
    const wwwBlock = conf.match(
      /server\s*\{[^{}]*server_name\s+www\.parametric-memory\.dev;[\s\S]*?\n\}/,
    );
    expect(wwwBlock, "www server block not found").not.toBeNull();
    expect(
      wwwBlock![0],
      "www→apex 301 has no HSTS — hstspreload.org requires redirects to carry it",
    ).toMatch(
      /add_header\s+Strict-Transport-Security\s+"max-age=63072000; includeSubDomains; preload"\s+always;/,
    );
  });

  it("uses the identical HSTS value as the apex — a weaker one would poison preload", () => {
    const all = [...conf.matchAll(/add_header\s+Strict-Transport-Security\s+"([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(all.length).toBeGreaterThanOrEqual(3); // www + apex server + /_next/static/
    expect(new Set(all).size, `divergent HSTS values: ${JSON.stringify(all)}`).toBe(1);
    expect(all[0]).toMatch(/max-age=(\d+)/);
    expect(Number(all[0].match(/max-age=(\d+)/)![1])).toBeGreaterThanOrEqual(31536000);
    expect(all[0]).toContain("includeSubDomains");
    expect(all[0]).toContain("preload");
  });
});

describe("nginx.conf — dead OCSP stapling config stays removed", () => {
  // Let's Encrypt dropped OCSP URLs from certificates on 2025-05-07 and shut
  // its responders down on 2025-08-06, replacing OCSP with CRLs. Our certs
  // carry no OCSP URL, so stapling cannot occur and these directives were
  // no-ops. Restoring them is not harmful, but it is cargo cult — if a future
  // CA change makes stapling real again, update this test in the same commit.
  it("does not enable ssl_stapling", () => {
    expect(conf).not.toMatch(/^\s*ssl_stapling(_verify)?\s+on\s*;/m);
  });

  it("does not carry a resolver that only stapling needed", () => {
    // Every proxy_pass in this file targets the literal 127.0.0.1, so no DNS
    // resolution happens at request time. If a hostname upstream is ever
    // introduced, a resolver must come back — deliberately, with this test.
    expect(conf).not.toMatch(/^\s*resolver\s+/m);
    expect(conf).toMatch(/proxy_pass\s+http:\/\/127\.0\.0\.1:3000/);
  });
});
