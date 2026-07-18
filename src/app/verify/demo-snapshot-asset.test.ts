/**
 * Guard: the /verify "Download a demo snapshot" button must point at a file
 * that actually ships in public/.
 *
 * Why this exists: the demo asset public/demo-snapshots/mmpm-research-snap.json
 * was deleted in commit 8c974a9 ("update after long mem eval", 2026-07-12)
 * while VerifyClient.tsx still linked to it via DEMO_URL, so the live download
 * 404'd ("File wasn't available on site"). Every VerifyClient.*.test.tsx still
 * passed — they mock `fetch` and use in-memory File fixtures, so they never
 * touch the real static asset. A mocked-fetch unit test cannot catch a missing
 * public file by construction. This test reads the filesystem, so it can: it
 * ties the code's DEMO_URL to the on-disk asset and fails if either drifts.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const VERIFY_CLIENT = join(process.cwd(), "src/app/verify/VerifyClient.tsx");

/** Parse DEMO_URL out of the component source so the test tracks the real reference. */
function demoUrlFromSource(): string {
  const src = readFileSync(VERIFY_CLIENT, "utf8");
  const m = src.match(/const\s+DEMO_URL\s*=\s*["'`]([^"'`]+)["'`]/);
  if (!m)
    throw new Error("DEMO_URL not found in VerifyClient.tsx — did the constant move or rename?");
  return m[1];
}

describe("/verify — demo snapshot asset ships in public/", () => {
  const demoUrl = demoUrlFromSource();
  const abs = join(process.cwd(), "public", demoUrl);

  it("DEMO_URL is a public-root .json path under /demo-snapshots", () => {
    expect(demoUrl.startsWith("/demo-snapshots/")).toBe(true);
    expect(demoUrl.endsWith(".json")).toBe(true);
  });

  it("the file DEMO_URL points to actually exists in public/ (regression: deleted in 8c974a9)", () => {
    expect(
      existsSync(abs),
      `${demoUrl} is linked by the Verify page's download button but is missing from public/ — the live download will 404`,
    ).toBe(true);
  });

  it("the shipped demo is a non-empty, valid v1 snapshot the verifier can parse", () => {
    const raw = readFileSync(abs, "utf8");
    expect(raw.length).toBeGreaterThan(1000);
    const snap = JSON.parse(raw) as {
      formatVersion?: string;
      formatUri?: string;
      signature?: unknown;
    };
    expect(typeof snap.formatVersion).toBe("string");
    expect(snap.formatUri ?? "").toContain("snapshot/v1");
  });
});
