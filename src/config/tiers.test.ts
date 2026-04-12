/**
 * Invariant tests for the canonical tier registry.
 *
 * These assertions enforce the architectural constraint recorded in
 * `TierLimits.maxSubstrates` JSDoc: every tier is pinned to exactly 1 live
 * substrate because the compute API has no path for the client to
 * disambiguate between multiple live substrates on the same account.
 *
 * If this test ever fails, it means someone bumped a tier's substrate count
 * on a customer surface (pricing page, llms.txt, docs) BEFORE the compute
 * rotate-key / billing-portal / reactivate / deprovision routes started
 * accepting a `substrateId` in the URL. That would re-introduce the bug
 * that caused commit 30dcb41 ("fix sudo issue", Apr 9 2026) to be reverted.
 * Don't loosen this test — fix the compute contract first.
 */

import { describe, it, expect } from "vitest";
import { TIERS, TIER_ORDER, TIERS_BY_ID, getTier, isValidTierId } from "./tiers";

describe("tiers.ts — maxSubstrates invariant (2026-04-11)", () => {
  it("every canonical tier has maxSubstrates === 1", () => {
    for (const tier of TIERS) {
      expect(tier.limits.maxSubstrates, `tier ${tier.id} must advertise 1 substrate`).toBe(1);
    }
  });

  it("exactly one feature per tier mentions substrates, and it equals '1 substrate'", () => {
    for (const tier of TIERS) {
      const substrateFeatures = tier.features.filter((f) => /substrate/i.test(f.name));
      expect(
        substrateFeatures.length,
        `tier ${tier.id} should have exactly 1 substrate feature bullet`,
      ).toBe(1);
      expect(substrateFeatures[0].name).toBe("1 substrate");
      expect(substrateFeatures[0].included).toBe(true);
    }
  });

  it("no tier feature bullet contains the obsolete phrase 'substrate instance'", () => {
    for (const tier of TIERS) {
      for (const feature of tier.features) {
        expect(
          feature.name.toLowerCase(),
          `tier ${tier.id} feature "${feature.name}" must not use the plural marketing phrase`,
        ).not.toContain("substrate instance");
      }
    }
  });
});

describe("tiers.ts — registry shape", () => {
  it("TIER_ORDER contains all tier IDs exactly once", () => {
    expect(TIER_ORDER.length).toBe(TIERS.length);
    expect(new Set(TIER_ORDER).size).toBe(TIER_ORDER.length);
    for (const tier of TIERS) {
      expect(TIER_ORDER).toContain(tier.id);
    }
  });

  it("TIERS_BY_ID is keyed by every tier id", () => {
    for (const tier of TIERS) {
      expect(TIERS_BY_ID[tier.id]).toBe(tier);
    }
  });

  it("getTier returns the matching object for each known id", () => {
    for (const tier of TIERS) {
      expect(getTier(tier.id)).toBe(tier);
    }
  });

  it("getTier throws for an unknown id", () => {
    expect(() => getTier("gold-plated")).toThrow(/Unknown tier/);
  });

  it("isValidTierId accepts every canonical id and rejects junk", () => {
    for (const id of TIER_ORDER) {
      expect(isValidTierId(id)).toBe(true);
    }
    expect(isValidTierId("platinum")).toBe(false);
    expect(isValidTierId("")).toBe(false);
  });

  it("tier prices are in non-decreasing upgrade order", () => {
    const prices = TIER_ORDER.map((id) => TIERS_BY_ID[id].price);
    for (let i = 1; i < prices.length; i++) {
      expect(
        prices[i],
        `${TIER_ORDER[i]} should cost >= ${TIER_ORDER[i - 1]}`,
      ).toBeGreaterThanOrEqual(prices[i - 1]);
    }
  });
});
