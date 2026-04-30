/**
 * Tests for parse-user-agent.ts.
 *
 * Table-driven — one assertion per representative UA string. Pinning
 * the canonical strings so a ua-parser-js bump that changes its output
 * format fails this suite rather than silently re-rendering every audit
 * row's "from where" line.
 *
 * The exact major version numbers don't matter (they grow with browsers);
 * what matters is the SHAPE of the output ("Browser N on OS").
 */

import { describe, it, expect } from "vitest";
import { parseUserAgent } from "./parse-user-agent";

describe("parseUserAgent — fallback shapes", () => {
  it("returns 'Unknown device' for null", () => {
    expect(parseUserAgent(null)).toBe("Unknown device");
  });
  it("returns 'Unknown device' for undefined", () => {
    expect(parseUserAgent(undefined)).toBe("Unknown device");
  });
  it("returns 'Unknown device' for empty string", () => {
    expect(parseUserAgent("")).toBe("Unknown device");
  });
  it("returns 'Unknown device' for whitespace-only string", () => {
    expect(parseUserAgent("   ")).toBe("Unknown device");
  });
});

describe("parseUserAgent — desktop browsers", () => {
  it("Chrome on macOS", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Chrome/134.0.6998.117 Safari/605.1.15";
    expect(parseUserAgent(ua)).toBe("Chrome 134 on macOS");
  });

  it("Firefox on Windows", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0";
    expect(parseUserAgent(ua)).toBe("Firefox 130 on Windows");
  });

  it("Safari on macOS", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
    expect(parseUserAgent(ua)).toBe("Safari 17 on macOS");
  });
});

describe("parseUserAgent — mobile + non-browser UAs", () => {
  it("Mobile Safari on iOS still resolves", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 Version/18.2 Mobile/15E148 Safari/604.1";
    const label = parseUserAgent(ua);
    expect(label).toMatch(/Safari/);
    expect(label).toMatch(/iOS/);
    expect(label).toMatch(/\d/); // some major version digit
  });

  it("curl renders with 'Unknown OS' suffix", () => {
    expect(parseUserAgent("curl/8.5.0")).toBe("curl 8 on Unknown OS");
  });
});

describe("parseUserAgent — robustness", () => {
  it("preserves shape on malformed UAs (no crash, returns SOMETHING)", () => {
    // ua-parser-js generally returns undefined fields for nonsense; we
    // expect "Unknown browser on Unknown OS" or similar — never an error.
    const result = parseUserAgent("not-a-real-user-agent");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("renders only major version (not patch / build)", () => {
    // A regression here would render "Chrome 134.0.6998.117" — the patch
    // numbers churn weekly and clutter the audit feed.
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 Chrome/134.0.6998.117 Safari/605.1.15";
    expect(parseUserAgent(ua)).not.toMatch(/\d+\.\d+\.\d+/);
  });
});
