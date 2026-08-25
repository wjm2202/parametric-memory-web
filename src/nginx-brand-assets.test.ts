/**
 * Regression test — /brand assets must be served by the APP, never by a
 * host-filesystem nginx location.
 *
 * THE BUG THIS PINS DOWN (2026-08-24): nginx.conf carried a
 * `location /brand/ { root /var/www/parametric-memory/public; }` block
 * pointing at a path that does not exist on the droplet (the deploy checkout
 * is /home/deploy/parametric-memory-web and the app runs inside Docker,
 * published only on 127.0.0.1:3000). The block sat harmless in the repo for
 * months because nginx.conf was never applied to the live server — until the
 * deploy nginx-sync step (af9a16a, 2026-08-23) copied it live for the first
 * time. From that deploy on, every /brand/* asset 404'd: the navbar logo,
 * all favicons, the og.png behind every social share card, and the image
 * URLs inside the Organization/SoftwareApplication JSON-LD on every page.
 *
 * The fix: no /brand location at all — requests fall through to
 * `location /` and are proxied to the app, which serves them from public/
 * inside the container (the same, never-broken path as /llms.txt and
 * /site.webmanifest). Long-lived caching moved to next.config.ts headers().
 *
 * Lives in src/ (not repo root) because vitest's include is src/** — same
 * placement rationale as src/nginx-csp.test.ts and src/deploy-workflow.test.ts.
 *
 * If you need nginx to serve /brand directly for performance, the root must
 * be a path that provably exists on the droplet AND is populated by the
 * deploy — and you must update this test deliberately in the same PR.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import nextConfig from "../next.config";

const repoRoot = path.resolve(__dirname, "..");
const confRaw = readFileSync(path.join(repoRoot, "nginx.conf"), "utf8");

// Assert against the EFFECTIVE config only: nginx treats `#` to end-of-line
// as a comment, and the file's documentation deliberately names the removed
// block and its bad path so future readers understand the history. Comments
// must not be able to trip (or shadow) these assertions.
const conf = confRaw
  .split("\n")
  .map((line) => line.replace(/#.*$/, ""))
  .join("\n");

describe("nginx.conf — /brand assets are proxied to the app, not host-served", () => {
  it("has no `location /brand` block (outside comments)", () => {
    expect(conf).not.toMatch(/location\s+\/brand/);
  });

  it("references no /var/www/parametric-memory path (does not exist on the droplet)", () => {
    // Deliberately narrow: /var/www/certbot IS real — certbot maintains it as
    // the ACME challenge webroot and cert renewals depend on that location.
    // Only the app-content path is forbidden: the deploy checkout lives at
    // /home/deploy/parametric-memory-web and the app itself runs in Docker,
    // so nothing ever populates /var/www/parametric-memory.
    expect(conf).not.toContain("/var/www/parametric-memory");
  });

  it("still proxies `location /` to the app so /brand falls through", () => {
    expect(conf).toMatch(/location \/ \{[^}]*proxy_pass http:\/\/127\.0\.0\.1:3000/);
  });
});

describe("next.config.ts — /brand carries the 30-day cache the nginx block used to add", () => {
  it("headers() includes a /brand/:path* rule with a public max-age", async () => {
    const headers = await nextConfig.headers!();
    const brand = headers.find((h) => h.source === "/brand/:path*");
    expect(brand, "missing /brand/:path* headers rule in next.config.ts").toBeDefined();
    const cc = brand!.headers.find((h) => h.key === "Cache-Control");
    expect(cc?.value).toMatch(/public, max-age=\d{6,}/);
  });
});
