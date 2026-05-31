/**
 * Invariant tests for the canonical tier registry.
 *
 * SM-MULTI-2 (2026-05): the website's per-tier `maxSubstrates` MUST mirror
 * compute's authoritative ceilings — DEFAULT_CEILINGS (src/config/
 * platform-ceilings.ts), the `platform_settings.max_substrates_*` row, and the
 * `enforce_substrate_cap` trigger (init.sql). Compute is the source of truth;
 * the website only advertises. If these drift, the pricing page either lies
 * about how many instances a tier allows or dead-ends a purchase the DB would
 * accept.
 *
 * EXPECTED_MAX_SUBSTRATES below is the contract. If you change it here, change
 * compute's DEFAULT_CEILINGS + the platform_settings migration in lockstep
 * (and vice-versa). The previous "every tier === 1" pin (2026-04-11) is
 * retired now that the slug-scoped substrate routes + dashboard list + the
 * SM-MULTI-1 cap-reached card have shipped.
 */

import { describe, it, expect } from "vitest";
import { TIERS, TIER_ORDER, TIERS_BY_ID, getTier, isValidTierId, type TierId } from "./tiers";

/** Mirror of compute DEFAULT_CEILINGS.maxSubstrates — keep in lockstep. */
const EXPECTED_MAX_SUBSTRATES: Record<TierId, number> = {
  free: 1,
  starter: 1,
  indie: 2,
  pro: 3,
  team: 5,
};

/** The substrate feature-bullet copy implied by a ceiling. */
function expectedSubstrateBullet(n: number): string {
  return n === 1 ? "1 substrate" : `Up to ${n} substrates`;
}

describe("tiers.ts — maxSubstrates mirrors compute ceilings (SM-MULTI-2)", () => {
  it("every tier's maxSubstrates matches the compute ceiling contract", () => {
    for (const tier of TIERS) {
      expect(
        tier.limits.maxSubstrates,
        `tier ${tier.id} maxSubstrates must mirror compute DEFAULT_CEILINGS`,
      ).toBe(EXPECTED_MAX_SUBSTRATES[tier.id]);
    }
  });

  it("exactly one feature per tier mentions substrates, matching its ceiling", () => {
    for (const tier of TIERS) {
      const substrateFeatures = tier.features.filter((f) => /substrate/i.test(f.name));
      expect(
        substrateFeatures.length,
        `tier ${tier.id} should have exactly 1 substrate feature bullet`,
      ).toBe(1);
      expect(substrateFeatures[0].name).toBe(
        expectedSubstrateBullet(EXPECTED_MAX_SUBSTRATES[tier.id]),
      );
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
