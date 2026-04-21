/**
 * Unit tests for the OAuth return-to allow-list validator.
 *
 * Every attack class documented in return-to.ts has an explicit case
 * here. The positive cases also pin down that we pass the *original*
 * string through unchanged — callers rely on this so they can preserve
 * query strings / fragments without having to re-construct them.
 *
 * No mocking, no env, no network — this is a pure function and the
 * tests should stay that way. If a test case ever needs infrastructure,
 * the validator has outgrown its single-responsibility scope and the
 * design needs a second look.
 */
import { describe, it, expect } from "vitest";
import { validateReturnTo, ALLOWED_RETURN_TO_PATHS } from "./return-to";

describe("validateReturnTo — allow-list positives", () => {
  it("accepts the root path", () => {
    expect(validateReturnTo("/")).toBe("/");
  });

  it("accepts /dashboard exactly", () => {
    expect(validateReturnTo("/dashboard")).toBe("/dashboard");
  });

  it("accepts /admin exactly", () => {
    expect(validateReturnTo("/admin")).toBe("/admin");
  });

  it("accepts a sub-path of /dashboard", () => {
    expect(validateReturnTo("/dashboard/billing")).toBe("/dashboard/billing");
  });

  it("accepts a deep sub-path of /admin", () => {
    expect(validateReturnTo("/admin/users/42/edit")).toBe("/admin/users/42/edit");
  });

  it("accepts a trailing slash on an allowed prefix", () => {
    expect(validateReturnTo("/dashboard/")).toBe("/dashboard/");
  });

  it("preserves a query string on an allowed prefix", () => {
    expect(validateReturnTo("/dashboard?tab=billing")).toBe("/dashboard?tab=billing");
  });

  it("preserves a fragment on an allowed prefix", () => {
    expect(validateReturnTo("/dashboard#overview")).toBe("/dashboard#overview");
  });

  it("preserves query + fragment together", () => {
    expect(validateReturnTo("/admin/users?page=3#top")).toBe("/admin/users?page=3#top");
  });

  it("accepts a query string on root", () => {
    expect(validateReturnTo("/?from=email")).toBe("/?from=email");
  });
});

describe("validateReturnTo — open-redirect attacks (must reject)", () => {
  it("rejects an absolute http URL", () => {
    expect(validateReturnTo("http://evil.com/dashboard")).toBeNull();
  });

  it("rejects an absolute https URL", () => {
    expect(validateReturnTo("https://evil.com")).toBeNull();
  });

  it("rejects a protocol-relative URL", () => {
    expect(validateReturnTo("//evil.com")).toBeNull();
  });

  it("rejects a protocol-relative URL that names an allowed path", () => {
    // The sneaky case — "//evil.com/dashboard" has "/dashboard" in it,
    // but browsers read "//evil.com" as the authority and land there.
    expect(validateReturnTo("//evil.com/dashboard")).toBeNull();
  });

  it("rejects a javascript: URL", () => {
    expect(validateReturnTo("javascript:alert(1)")).toBeNull();
  });

  it("rejects a data: URL", () => {
    expect(validateReturnTo("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects a file: URL", () => {
    expect(validateReturnTo("file:///etc/passwd")).toBeNull();
  });

  it("rejects an ftp: URL", () => {
    expect(validateReturnTo("ftp://evil.com")).toBeNull();
  });

  it("rejects a URL with userinfo trying to spoof an allowed host", () => {
    // "http://memory.kiwi@evil.com" routes to evil.com but looks legit
    // to a casual reader. The scheme check catches this already.
    expect(validateReturnTo("http://memory.kiwi@evil.com")).toBeNull();
  });
});

describe("validateReturnTo — backslash / escape tricks", () => {
  it("rejects a leading backslash", () => {
    // "\" on its own doesn't start with "/", but we want to be explicit.
    expect(validateReturnTo("\\evil.com")).toBeNull();
  });

  it("rejects a slash-backslash host trick", () => {
    // Some browsers rewrite this to "//evil.com" in the Location header.
    expect(validateReturnTo("/\\evil.com")).toBeNull();
  });

  it("rejects a backslash anywhere in an otherwise valid path", () => {
    expect(validateReturnTo("/dashboard\\evil")).toBeNull();
  });

  it("rejects a double-backslash protocol-relative spoof", () => {
    expect(validateReturnTo("\\\\evil.com")).toBeNull();
  });
});

describe("validateReturnTo — prefix-bypass attacks", () => {
  it("rejects /dashboard-fake (not a path-segment match)", () => {
    expect(validateReturnTo("/dashboard-fake")).toBeNull();
  });

  it("rejects /dashboardextra (dashes, letters, etc.)", () => {
    expect(validateReturnTo("/dashboardextra")).toBeNull();
  });

  it("rejects /admin.evil.com", () => {
    expect(validateReturnTo("/admin.evil.com")).toBeNull();
  });

  it("rejects /evil", () => {
    expect(validateReturnTo("/evil")).toBeNull();
  });

  it("rejects an API route even though it starts with a slash", () => {
    expect(validateReturnTo("/api/secret")).toBeNull();
  });

  it("rejects a percent-encoded slash that would otherwise look allowed", () => {
    // "%2Fdashboard" is a literal pathname, not "/dashboard". Browsers
    // do not re-decode Location headers, but even if they did, we should
    // not honour opaque encodings.
    expect(validateReturnTo("/%2Fdashboard")).toBeNull();
  });
});

describe("validateReturnTo — control characters / CRLF injection", () => {
  it("rejects a null byte in the path", () => {
    expect(validateReturnTo("/dashboard\x00/evil")).toBeNull();
  });

  it("rejects CR in the path (header injection)", () => {
    expect(validateReturnTo("/dashboard\rSet-Cookie: x=1")).toBeNull();
  });

  it("rejects LF in the path (header injection)", () => {
    expect(validateReturnTo("/dashboard\nSet-Cookie: x=1")).toBeNull();
  });

  it("rejects a tab character", () => {
    expect(validateReturnTo("/dashboard\tfoo")).toBeNull();
  });

  it("rejects DEL (0x7f)", () => {
    expect(validateReturnTo("/dashboard\x7f")).toBeNull();
  });
});

describe("validateReturnTo — wrong-type / empty inputs", () => {
  it("rejects undefined", () => {
    expect(validateReturnTo(undefined)).toBeNull();
  });

  it("rejects null", () => {
    expect(validateReturnTo(null)).toBeNull();
  });

  it("rejects a number", () => {
    expect(validateReturnTo(42)).toBeNull();
  });

  it("rejects an array (Next.js can hand us string[])", () => {
    // A caller might forget that `req.query.returnTo` can be a string[]
    // when the param appears multiple times. Forcing them to pick one
    // is safer than picking the first for them.
    expect(validateReturnTo(["/dashboard", "//evil.com"])).toBeNull();
  });

  it("rejects an object", () => {
    expect(validateReturnTo({ path: "/dashboard" })).toBeNull();
  });

  it("rejects the empty string", () => {
    expect(validateReturnTo("")).toBeNull();
  });
});

describe("validateReturnTo — bare-hostname / scheme variants", () => {
  it("rejects a bare hostname (no slash at all)", () => {
    expect(validateReturnTo("evil.com")).toBeNull();
  });

  it("rejects 'javascript' with no colon (no slash either — same effect)", () => {
    expect(validateReturnTo("javascript")).toBeNull();
  });

  it("rejects capitalised scheme", () => {
    // "JAVASCRIPT:alert(1)" still has no leading slash.
    expect(validateReturnTo("JAVASCRIPT:alert(1)")).toBeNull();
  });

  it("rejects scheme with whitespace trick (leading space)", () => {
    // " javascript:alert(1)" does not start with "/".
    expect(validateReturnTo(" javascript:alert(1)")).toBeNull();
  });
});

describe("ALLOWED_RETURN_TO_PATHS — sanity pins", () => {
  it("is a non-empty readonly list", () => {
    expect(ALLOWED_RETURN_TO_PATHS.length).toBeGreaterThan(0);
  });

  it("contains the documented defaults", () => {
    // If this list ever changes, a positive-case test above probably
    // needs updating too — that's deliberate, the tests are the
    // codified allow-list.
    expect(ALLOWED_RETURN_TO_PATHS).toContain("/");
    expect(ALLOWED_RETURN_TO_PATHS).toContain("/dashboard");
    expect(ALLOWED_RETURN_TO_PATHS).toContain("/admin");
  });

  it("has no entries with query strings or fragments (validator expects bare paths)", () => {
    for (const entry of ALLOWED_RETURN_TO_PATHS) {
      expect(entry).not.toMatch(/[?#]/);
    }
  });

  it("has no duplicate entries", () => {
    expect(new Set(ALLOWED_RETURN_TO_PATHS).size).toBe(ALLOWED_RETURN_TO_PATHS.length);
  });
});
