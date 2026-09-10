/**
 * Regression test — X-Forwarded-For must be OVERWRITTEN, never appended.
 *
 * THE BUG THIS PINS DOWN (found 2026-09-10):
 *
 *   nginx.conf   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
 *   rate-limit.ts  clientIp() → request.headers.get("x-forwarded-for").split(",")[0]
 *
 * `$proxy_add_x_forwarded_for` APPENDS $remote_addr to whatever the client
 * sent. So a request carrying `X-Forwarded-For: 1.2.3.4` reached Next.js as
 * "1.2.3.4, <real ip>", and clientIp() — which takes the LEFTMOST entry —
 * returned 1.2.3.4. Attacker controlled. Rotating that one header defeated
 * every per-IP limit in the app:
 *   - src/app/api/waitlist/route.ts
 *   - src/app/api/verify/fetch-snapshot/route.ts
 * and src/lib/compute-proxy.ts forwarded the same poisoned header upstream, so
 * any per-IP logic in compute inherited the spoofed value too.
 *
 * rate-limit.ts documents the hazard in its own header comment ("`clientIp`
 * reads the leftmost X-Forwarded-For, which is spoofable by a direct caller")
 * — the app side was written correctly and defensively; the edge simply never
 * held up its end. Fixing nginx is what makes those limiters real.
 *
 * THE CLOUDFLARE TRIPWIRE: $remote_addr is the true peer only while nginx is
 * the outermost hop. Put Cloudflare (or any CDN/LB) in front and $remote_addr
 * becomes the CDN's address — every visitor collapses into a single rate-limit
 * bucket, which is a self-inflicted denial of service. At that point this must
 * become $http_cf_connecting_ip. That is why the assertion below rejects
 * $proxy_add_x_forwarded_for specifically rather than just requiring
 * $remote_addr: a deliberate future switch to $http_cf_connecting_ip should
 * pass, an accidental revert to appending should not.
 *
 * Lives in src/ (not repo root) because vitest's include is src/** — a test
 * file at the repo root never runs.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");
const confRaw = readFileSync(path.join(repoRoot, "nginx.conf"), "utf8");

// Effective config only — the comment above deliberately quotes the old
// directive so future readers understand the history, and must not trip these
// assertions.
const conf = confRaw
  .split("\n")
  .map((line) => line.replace(/#.*$/, ""))
  .join("\n");

const XFF_LINES = conf
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => /proxy_set_header\s+X-Forwarded-For\b/i.test(l));

describe("nginx.conf — X-Forwarded-For cannot be spoofed", () => {
  it("sets X-Forwarded-For somewhere (the app needs a client IP at all)", () => {
    expect(XFF_LINES.length).toBeGreaterThan(0);
  });

  it("never uses $proxy_add_x_forwarded_for — that appends client input", () => {
    const appending = XFF_LINES.filter((l) => l.includes("$proxy_add_x_forwarded_for"));
    expect(
      appending,
      "X-Forwarded-For is being APPENDED to client-supplied input; clientIp() " +
        "reads the leftmost value, so the per-IP rate limiters become spoofable",
    ).toEqual([]);
  });

  it("uses a trusted source in every place it is set", () => {
    // $remote_addr while nginx is the edge; $http_cf_connecting_ip if a CDN is
    // ever fronted. Anything else is unreviewed.
    const TRUSTED = /\$(remote_addr|http_cf_connecting_ip)\s*;$/;
    for (const line of XFF_LINES) {
      expect(TRUSTED.test(line), `untrusted X-Forwarded-For source: ${line}`).toBe(true);
    }
  });

  it("uses the SAME source in every location — split trust is a bug", () => {
    // A mismatch means one route's limiter keys on a different value than
    // another's, which is the kind of inconsistency nobody notices until it is
    // abused.
    const sources = new Set(XFF_LINES.map((l) => l.replace(/.*(\$\w+)\s*;$/, "$1")));
    expect(sources.size, `divergent sources: ${JSON.stringify([...sources])}`).toBe(1);
  });

  it("keeps X-Real-IP on $remote_addr — clientIp()'s fallback must stay trustworthy", () => {
    // clientIp() falls back to x-real-ip when x-forwarded-for is absent. If
    // that fallback were ever client-influenced the fix above would be moot.
    const realIpLines = conf
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /proxy_set_header\s+X-Real-IP\b/i.test(l));
    expect(realIpLines.length).toBeGreaterThan(0);
    for (const line of realIpLines) {
      expect(line, `X-Real-IP not from $remote_addr: ${line}`).toMatch(/\$remote_addr\s*;$/);
    }
  });
});
