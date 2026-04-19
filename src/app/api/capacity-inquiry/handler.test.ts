/**
 * Unit tests for the shared capacity-inquiry handler.
 *
 * The handler is the single source of truth for validation + side effects;
 * both /api/capacity-inquiry and the deprecated /api/team-inquiry shim
 * delegate to it. Tests here cover every validation branch + the webhook
 * forwarding path.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleCapacityInquiry } from "./handler";

// Silence the structured console.log calls from the handler — they're
// intentional in prod (they ARE the "email" until SMTP is wired up), but in
// tests they're just noise.
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CAPACITY_INQUIRY_WEBHOOK_URL;
  delete process.env.TEAM_INQUIRY_WEBHOOK_URL;
});

describe("handleCapacityInquiry — validation", () => {
  it("accepts a complete valid payload for every canonical tier", async () => {
    for (const tier of ["free", "starter", "indie", "pro", "team"]) {
      const result = await handleCapacityInquiry({
        name: "Ada Lovelace",
        email: "ada@example.com",
        tier,
        message: "need more capacity please",
      });
      expect(result, `tier=${tier} should pass validation`).toEqual({ ok: true });
    }
  });

  it("rejects missing name with missing_fields", async () => {
    const result = await handleCapacityInquiry({
      email: "ada@example.com",
      tier: "pro",
      message: "hi",
    });
    expect(result).toEqual({ ok: false, status: 400, error: "missing_fields" });
  });

  it("rejects missing email with missing_fields", async () => {
    const result = await handleCapacityInquiry({
      name: "Ada",
      tier: "pro",
      message: "hi",
    });
    expect(result).toEqual({ ok: false, status: 400, error: "missing_fields" });
  });

  it("rejects missing tier with missing_fields", async () => {
    const result = await handleCapacityInquiry({
      name: "Ada",
      email: "ada@example.com",
      message: "hi",
    });
    expect(result).toEqual({ ok: false, status: 400, error: "missing_fields" });
  });

  it("rejects missing message with missing_fields", async () => {
    const result = await handleCapacityInquiry({
      name: "Ada",
      email: "ada@example.com",
      tier: "pro",
    });
    expect(result).toEqual({ ok: false, status: 400, error: "missing_fields" });
  });

  it("rejects an unknown tier with invalid_tier", async () => {
    const result = await handleCapacityInquiry({
      name: "Ada",
      email: "ada@example.com",
      tier: "enterprise-cloud", // real tier id elsewhere, but not a canonical billing tier
      message: "hi",
    });
    expect(result).toEqual({ ok: false, status: 400, error: "invalid_tier" });
  });

  it("rejects a syntactically bad email with invalid_email", async () => {
    const result = await handleCapacityInquiry({
      name: "Ada",
      email: "not-an-email",
      tier: "pro",
      message: "hi",
    });
    expect(result).toEqual({ ok: false, status: 400, error: "invalid_email" });
  });

  it("missing_fields wins over invalid_tier when both would apply (order guard)", async () => {
    // If we ever reorder the checks, this test tells us — missing required
    // fields is a cheaper client-side error to surface than "wrong enum".
    const result = await handleCapacityInquiry({
      email: "ada@example.com",
      tier: "not-a-tier", // invalid, but name/message are missing first
      // name missing
      // message missing
    });
    expect(result).toEqual({ ok: false, status: 400, error: "missing_fields" });
  });

  it("empty-string fields count as missing (no 'valid but empty' requests)", async () => {
    const result = await handleCapacityInquiry({
      name: "",
      email: "ada@example.com",
      tier: "pro",
      message: "hi",
    });
    expect(result).toEqual({ ok: false, status: 400, error: "missing_fields" });
  });
});

describe("handleCapacityInquiry — webhook forwarding", () => {
  it("does NOT call fetch when no webhook env var is set", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());

    await handleCapacityInquiry({
      name: "Ada",
      email: "ada@example.com",
      tier: "pro",
      message: "hi",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts to CAPACITY_INQUIRY_WEBHOOK_URL with tier + fields in the body", async () => {
    process.env.CAPACITY_INQUIRY_WEBHOOK_URL = "https://hooks.example/capacity";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());

    await handleCapacityInquiry({
      name: "Ada Lovelace",
      email: "ada@example.com",
      tier: "pro",
      message: "need more atoms",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://hooks.example/capacity");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body ?? "{}")) as { text: string };
    expect(body.text).toContain("pro");
    expect(body.text).toContain("Ada Lovelace");
    expect(body.text).toContain("ada@example.com");
    expect(body.text).toContain("need more atoms");
  });

  it("falls back to TEAM_INQUIRY_WEBHOOK_URL if the new one isn't set (operator back-compat)", async () => {
    process.env.TEAM_INQUIRY_WEBHOOK_URL = "https://hooks.example/legacy";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());

    await handleCapacityInquiry({
      name: "Ada",
      email: "ada@example.com",
      tier: "indie",
      message: "hi",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("https://hooks.example/legacy");
  });

  it("prefers the new env var over the legacy one when both are set", async () => {
    process.env.CAPACITY_INQUIRY_WEBHOOK_URL = "https://hooks.example/new";
    process.env.TEAM_INQUIRY_WEBHOOK_URL = "https://hooks.example/legacy";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());

    await handleCapacityInquiry({
      name: "Ada",
      email: "ada@example.com",
      tier: "team",
      message: "hi",
    });

    expect(fetchSpy.mock.calls[0][0]).toBe("https://hooks.example/new");
  });

  it("returns ok even when webhook delivery throws (logging is source of truth)", async () => {
    process.env.CAPACITY_INQUIRY_WEBHOOK_URL = "https://hooks.example/capacity";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await handleCapacityInquiry({
      name: "Ada",
      email: "ada@example.com",
      tier: "pro",
      message: "hi",
    });

    expect(result).toEqual({ ok: true });
  });
});
