/**
 * Regression test — nginx.conf's CSP must allow every iframe the app embeds.
 *
 * The bug this catches: /videos/[slug] (src/lib/videos.ts, shipped
 * 2026-07-13) embeds https://www.youtube-nocookie.com/embed/<id> in an
 * <iframe>. nginx.conf's Content-Security-Policy header was last edited
 * 2026-05-18 for Stripe Embedded Checkout and never updated for video pages
 * added afterwards, so frame-src omitted the YouTube domain. The browser
 * enforced its own CSP and refused to load the iframe, rendering "This
 * content is blocked. Contact the site owner to fix the issue." on every
 * video page — indistinguishable, from a screenshot, from a YouTube-side
 * block, but entirely caused by this header.
 *
 * The reverse direction matters too: nginx.conf is hand-edited, so a future
 * edit could just as easily *drop* the entry. This test pins the current
 * embed domain so a regression fails CI instead of shipping silently.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { youtubeEmbedUrl } from "./src/lib/videos";

describe("nginx.conf — Content-Security-Policy frame-src", () => {
  const conf = readFileSync(path.join(__dirname, "nginx.conf"), "utf8");

  const cspLineMatch = conf.match(/add_header Content-Security-Policy "([^"]+)"/);

  it("defines a Content-Security-Policy header", () => {
    expect(cspLineMatch).not.toBeNull();
  });

  const csp = cspLineMatch?.[1] ?? "";
  const frameSrcMatch = csp.match(/frame-src ([^;]+);/);

  it("defines a frame-src directive", () => {
    expect(frameSrcMatch).not.toBeNull();
  });

  const frameSrc = frameSrcMatch?.[1] ?? "";

  it("allows the YouTube embed domain the /videos pages actually use", () => {
    // Derive the origin from the same helper the video pages call, so this
    // test breaks (not lies) if the embed domain ever changes.
    const embedOrigin = new URL(youtubeEmbedUrl("test-id")).origin;
    expect(frameSrc, `frame-src "${frameSrc}" is missing ${embedOrigin}`).toContain(embedOrigin);
  });

  it("still allows the Stripe embed domains — no regression", () => {
    expect(frameSrc).toContain("https://js.stripe.com");
    expect(frameSrc).toContain("https://checkout.stripe.com");
    expect(frameSrc).toContain("https://hooks.stripe.com");
  });

  it("frame-ancestors stays 'none' — this fix must not loosen clickjacking protection", () => {
    expect(csp).toMatch(/frame-ancestors 'none'/);
  });
});
