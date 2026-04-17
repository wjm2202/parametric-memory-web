import { describe, it, expect } from "vitest";
import {
  TERMINAL_STATES,
  formatUsdCents,
  prorationPreview,
  retryCounter,
  fastPathSuccessHeadline,
  slowPathSuccessHeadline,
  failureBody,
  formatAtomsDelta,
  formatBootstrapsDelta,
  formatStorageDelta,
} from "./tier-change-copy";

// Pure-function tests for the formatters and headline helpers in the copy
// constants file. String constants themselves are not tested — QA reviews
// those by reading the file.

describe("tier-change-copy helpers", () => {
  describe("TERMINAL_STATES", () => {
    it("includes completed, failed, and rolled_back", () => {
      expect(TERMINAL_STATES.has("completed")).toBe(true);
      expect(TERMINAL_STATES.has("failed")).toBe(true);
      expect(TERMINAL_STATES.has("rolled_back")).toBe(true);
    });

    it("does NOT include any in-flight state", () => {
      expect(TERMINAL_STATES.has("none")).toBe(false);
      expect(TERMINAL_STATES.has("payment_pending")).toBe(false);
      expect(TERMINAL_STATES.has("queued")).toBe(false);
      expect(TERMINAL_STATES.has("processing")).toBe(false);
    });
  });

  describe("formatUsdCents", () => {
    it("formats whole dollars", () => {
      expect(formatUsdCents(2900)).toBe("$29.00");
    });

    it("formats partial dollars", () => {
      expect(formatUsdCents(633)).toBe("$6.33");
    });

    it("formats zero", () => {
      expect(formatUsdCents(0)).toBe("$0.00");
    });

    it("formats sub-dollar amounts", () => {
      expect(formatUsdCents(7)).toBe("$0.07");
    });
  });

  describe("prorationPreview", () => {
    it("renders both amounts and the billing date", () => {
      // 2026-05-17 UTC — month/day formatting is locale-independent for en-US.
      const nextBilling = new Date("2026-05-17T00:00:00Z");
      const out = prorationPreview(633, 2900, nextBilling);
      expect(out).toContain("$6.33 charged today");
      expect(out).toContain("$29.00/mo");
      expect(out).toMatch(/May 1[67]/); // timezone-tolerant
    });
  });

  describe("retryCounter", () => {
    it("renders 1-indexed attempt counter", () => {
      expect(retryCounter(1, 5)).toBe("Attempt 1 of 5");
      expect(retryCounter(3, 5)).toBe("Attempt 3 of 5");
    });
  });

  describe("headline helpers", () => {
    it("fastPathSuccessHeadline includes the target tier name", () => {
      expect(fastPathSuccessHeadline("Pro")).toContain("Pro");
      expect(fastPathSuccessHeadline("Pro")).toContain("limits are active");
    });

    it("slowPathSuccessHeadline reassures about API key + MCP endpoint", () => {
      const out = slowPathSuccessHeadline("Team");
      expect(out).toContain("Team");
      expect(out).toContain("API key");
      expect(out).toContain("MCP endpoint");
    });

    it("failureBody names the tier the customer is still on", () => {
      expect(failureBody("Indie")).toContain("Indie");
      expect(failureBody("Indie")).toContain("no charge");
    });
  });

  // ── Delta formatters ────────────────────────────────────────────────────────
  //
  // Real tier caps come from `src/config/tiers.ts` (indie=10k atoms, pro=100k,
  // team=500k; indie=1k bootstraps, pro=10k, team=unlimited; indie=500MB,
  // pro=2GB, team=10GB). The expectations below use those real numbers so the
  // test doubles as a sanity check for the pricing-page copy.

  describe("formatAtomsDelta", () => {
    it("returns null when target is equal to or less than current", () => {
      expect(formatAtomsDelta(10_000, 10_000)).toBeNull();
      expect(formatAtomsDelta(100_000, 10_000)).toBeNull();
    });

    it("formats a sub-1000 delta without SI suffix", () => {
      expect(formatAtomsDelta(500, 750)).toBe("+250 atoms");
    });

    it("formats a thousands delta with k suffix (indie → pro, 10k → 100k)", () => {
      expect(formatAtomsDelta(10_000, 100_000)).toBe("+90k atoms");
    });

    it("formats a millions delta with M suffix and trims trailing .0", () => {
      // +2,000,000 → "+2M atoms", not "+2.0M atoms"
      expect(formatAtomsDelta(0, 2_000_000)).toBe("+2M atoms");
    });

    it("keeps one decimal when the M value has fractional part", () => {
      // +1,500,000 → "+1.5M atoms"
      expect(formatAtomsDelta(0, 1_500_000)).toBe("+1.5M atoms");
    });

    it("renders 'Unlimited atoms' when target is unlimited", () => {
      expect(formatAtomsDelta(100_000, -1)).toBe("Unlimited atoms");
    });

    it("returns null when both sides are already unlimited", () => {
      expect(formatAtomsDelta(-1, -1)).toBeNull();
    });
  });

  describe("formatBootstrapsDelta", () => {
    it("returns null when target is equal to or less than current", () => {
      expect(formatBootstrapsDelta(1_000, 1_000)).toBeNull();
      expect(formatBootstrapsDelta(10_000, 1_000)).toBeNull();
    });

    it("formats a sub-1000 delta (starter → indie: 200 → 1000 = +800)", () => {
      expect(formatBootstrapsDelta(200, 1_000)).toBe("+800 bootstraps/mo");
    });

    it("formats a thousands delta (indie → pro, 1k → 10k)", () => {
      expect(formatBootstrapsDelta(1_000, 10_000)).toBe("+9k bootstraps/mo");
    });

    it("renders 'Unlimited bootstraps/mo' when target removes the cap (pro → team)", () => {
      expect(formatBootstrapsDelta(10_000, -1)).toBe("Unlimited bootstraps/mo");
    });
  });

  describe("formatStorageDelta", () => {
    it("returns null when target is equal to or less than current", () => {
      expect(formatStorageDelta(500, 500)).toBeNull();
      expect(formatStorageDelta(2048, 500)).toBeNull();
    });

    it("formats a sub-GB delta in MB (starter → indie: 100 → 500 MB)", () => {
      expect(formatStorageDelta(100, 500)).toBe("+400 MB storage");
    });

    it("switches to GB when delta >= 1024 MB (indie → pro: 500 → 2048 MB)", () => {
      // 2048 - 500 = 1548 MB → "+1.5 GB storage"
      expect(formatStorageDelta(500, 2048)).toBe("+1.5 GB storage");
    });

    it("trims trailing .0 on whole-GB deltas (pro → team: 2GB → 10GB = +8 GB)", () => {
      expect(formatStorageDelta(2048, 10_240)).toBe("+8 GB storage");
    });

    it("renders 'Unlimited storage' when target removes the cap", () => {
      expect(formatStorageDelta(10_240, -1)).toBe("Unlimited storage");
    });
  });
});
