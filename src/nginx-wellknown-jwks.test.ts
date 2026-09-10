/**
 * Regression test — /.well-known/* must reach the APP, not the dotfile deny.
 *
 * THE BUG THIS PINS DOWN (found 2026-09-10): nginx.conf blocks dotfiles with
 * `location ~ /\. { deny all; return 404; }`. `.well-known` is a
 * dot-directory, so that regex matched /.well-known/jwks.json and killed it.
 * Like the /brand/* bug, the block was inert for months because nginx.conf
 * was never applied live — until the deploy nginx-sync step (af9a16a,
 * 2026-08-23) copied it to the droplet for the first time.
 *
 * Why /brand/* was caught in a day and this took two and a half weeks: a
 * missing logo is visible. An unreachable JWKS does not fail verification —
 * it silently degrades keySource from "jwks" to
 * "embedded-fallback-jwks-unreachable", and the verifier still prints
 * "VERIFIED — CRYPTOGRAPHICALLY INTACT". Proven by same-file A/B: the
 * snapshot at mmpm-cli/snapshots/silver-flat-6czf-export-snapshot-
 * 2026-07-17T03-20-38Z.json verified with keySource=jwks on 2026-07-17 and
 * reported the fallback on 2026-09-10 — same machine, same verifier build,
 * byte-identical input. Only the endpoint changed.
 *
 * Blast radius while broken: the compute provisioner passes
 * MMPM_JWKS_URI=https://parametric-memory.dev/.well-known/jwks.json into
 * EVERY provisioned customer substrate (compute/src/workers/
 * substrate-provisioner.ts). So this is not one endpoint — it is every
 * customer's verifier falling back at once, with three SPEC-SNAPSHOT.md §6.4
 * case-(b) guarantees inactive: JWKS revocation markers, the embedded-vs-
 * published key byte-comparison ("the most likely indicator of a forged or
 * rotated-and-replayed snapshot"), and case-(c) kid-absent rejection.
 *
 * src/app/__tests__/jwks-public.test.ts already pins the FILE's structure on
 * disk. It could never have caught this: the file was always valid. The gap
 * was that nothing asserted the file is reachable through nginx. That is
 * what this test closes.
 *
 * Lives in src/ (not repo root) because vitest's include is src/** — same
 * placement rationale as src/nginx-brand-assets.test.ts and
 * src/nginx-csp.test.ts. A test file at the repo root never runs.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import nextConfig from "../next.config";

const repoRoot = path.resolve(__dirname, "..");
const confRaw = readFileSync(path.join(repoRoot, "nginx.conf"), "utf8");

// Assert against the EFFECTIVE config only: nginx treats `#` to end-of-line
// as a comment, and the block above deliberately names `location ~ /\.` and
// the broken URL in prose so future readers understand the history. Comments
// must not be able to trip (or shadow) these assertions.
const conf = confRaw
  .split("\n")
  .map((line) => line.replace(/#.*$/, ""))
  .join("\n");

describe("nginx.conf — /.well-known/ must not be eaten by the dotfile deny", () => {
  it("still blocks dotfiles — this fix must not loosen that", () => {
    // The deny block is a real security control (.git, .env, .htpasswd…).
    // Removing it would 'fix' the JWKS and open a hole; that is not the fix.
    expect(conf).toMatch(/location\s+~\s+\/\\\.\s*\{/);
  });

  it("carries an explicit /.well-known/ location", () => {
    expect(conf).toMatch(/location\s+\^~\s+\/\.well-known\/\s*\{/);
  });

  it("uses the ^~ modifier, which is what actually beats the regex deny", () => {
    // Load-bearing and easy to get wrong: nginx gives regex locations
    // precedence over PREFIX locations, so a plain `location /.well-known/`
    // would still lose to `location ~ /\.`. Only `^~` suppresses regex
    // matching for the winning prefix. A future edit that drops the modifier
    // reintroduces the outage silently.
    const plainPrefix = /location\s+\/\.well-known\/\s*\{/.test(conf);
    expect(
      plainPrefix,
      "found `location /.well-known/` without `^~` — regex locations would still win",
    ).toBe(false);
  });

  it("proxies to the app rather than serving from a filesystem root", () => {
    // The /brand/* lesson (af9a16a): a `root` pointing at a host path that
    // does not exist inside the deploy 404s everything under it. The app
    // serves public/.well-known/ from inside the container.
    const block = conf.match(/location\s+\^~\s+\/\.well-known\/\s*\{([\s\S]*?)\n\s*\}/);
    expect(block, "no ^~ /.well-known/ block to inspect").not.toBeNull();
    const body = block![1];
    expect(body).toMatch(/proxy_pass\s+http:\/\/127\.0\.0\.1:3000\s*;/);
    expect(body).not.toMatch(/\broot\s+/);
  });

  it("orders the well-known location before the dotfile deny", () => {
    // Not strictly required by nginx (^~ wins regardless of position), but
    // source order is how a human reads intent — and if someone later drops
    // the ^~, order becomes the only thing standing between us and the
    // outage. Keep them adjacent and in this order.
    const wellKnownAt = conf.search(/location\s+\^~\s+\/\.well-known\//);
    const denyAt = conf.search(/location\s+~\s+\/\\\./);
    expect(wellKnownAt).toBeGreaterThan(-1);
    expect(denyAt).toBeGreaterThan(-1);
    expect(wellKnownAt).toBeLessThan(denyAt);
  });

  it("keeps the ACME challenge location intact on the HTTP server", () => {
    // Certbot renewal writes to /var/www/certbot and is served from the
    // port-80 block. Unrelated to the fix, but it lives under the same
    // dot-directory, so a careless edit here breaks TLS renewal.
    expect(conf).toMatch(/location\s+\/\.well-known\/acme-challenge\/\s*\{/);
  });
});

describe("next.config.ts — the headers the cross-origin verifier fetch needs", () => {
  // Reaching the app is necessary but not sufficient: the browser verifier at
  // /verify does a cross-origin fetch(snap.signature.keyUri). Without ACAO the
  // fetch is blocked and the verifier falls back to the embedded key — the
  // exact same observable failure as the nginx 404, from a different cause.
  it("sets ACAO and Content-Type on /.well-known/jwks.json", async () => {
    const headers = await nextConfig.headers!();
    const entry = headers.find((h) => h.source === "/.well-known/jwks.json");
    expect(entry, "no headers() entry for /.well-known/jwks.json").toBeDefined();

    const byKey = Object.fromEntries(entry!.headers.map((h) => [h.key.toLowerCase(), h.value]));
    expect(byKey["access-control-allow-origin"]).toBe("*");
    expect(byKey["content-type"]).toMatch(/application\/json/);
    expect(byKey["cache-control"]).toBeDefined();
  });
});
