/**
 * Sprint nextjs-16-upgrade (2026-05-27) — M2 regression lock.
 *
 * Pins the explicit values we set on `next.config.ts > images`, so a future
 * engineer cannot quietly delete them and silently pick up whatever default
 * the installed Next.js version happens to ship that month.
 *
 * Why this matters: Next 15.x and 16.x ship different defaults for
 * `minimumCacheTTL`, `imageSizes`, and `qualities`. Once we leave any of
 * these implicit, the behaviour of `/_next/image` becomes coupled to the
 * Next version rather than to a deliberate decision recorded in source.
 *
 * If you intentionally want to change one of these values, update both
 * `next.config.ts` AND this test — the diff will surface the change in
 * code review.
 *
 * See docs/SPRINT-NEXTJS-16-UPGRADE-2026-05-27.md (row M2).
 */

import { describe, it, expect } from "vitest";
import nextConfig from "../../../next.config";

describe("next.config.ts — images defaults are explicitly pinned (M2)", () => {
  it("declares an images config block", () => {
    expect(nextConfig.images).toBeDefined();
  });

  it("pins formats to AVIF + WebP", () => {
    expect(nextConfig.images?.formats).toEqual(["image/avif", "image/webp"]);
  });

  it("pins minimumCacheTTL to 14400 (4 hours) — v16 default, explicit", () => {
    expect(nextConfig.images?.minimumCacheTTL).toBe(14400);
  });

  it("pins imageSizes to include 16 (homepage favicon @ width=24)", () => {
    expect(nextConfig.images?.imageSizes).toEqual([16, 32, 48, 64, 96, 128, 256, 384]);
  });

  it("pins qualities to [75] — matches the implicit default we already render", () => {
    expect(nextConfig.images?.qualities).toEqual([75]);
  });
});
