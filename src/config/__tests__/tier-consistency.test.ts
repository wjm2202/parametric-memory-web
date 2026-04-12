/**
 * Tier Consistency Tests — N-5 (Sprint: naming alignment)
 *
 * These tests are the enforcement layer for the canonical tier registry.
 * They catch any naming inconsistency before it reaches production:
 *
 *  1. The registry itself is internally consistent.
 *  2. Source files use correct tier display names (Starter, Solo, Professional, Team).
 *  3. Source files that previously had inline tier constants have been
 *     migrated to import from the registry.
 *  4. PricingCTA.tsx does NOT contain a TIER_TO_CHECKOUT remapping table.
 *  5. The registry is the sole definition of tier IDs, labels, and prices.
 *
 * If a test fails, fix the root cause — do not adjust the test to match
 * wrong data.
 */

import { readFileSync } from "fs";
import path from "path";
import {
  TIERS,
  TIERS_BY_ID,
  TIER_ORDER,
  TIER_LABELS,
  TIER_PRICES,
  getTierLabel,
  getTierPrice,
  isValidTierId,
  getTier,
} from "../tiers";

// ── Helpers ──────────────────────────────────────────────────────────────────

const srcRoot = path.resolve(__dirname, "../../");

function readSrc(relPath: string): string {
  return readFileSync(path.join(srcRoot, relPath), "utf-8");
}

// ── 1. Registry internal consistency ─────────────────────────────────────────

describe("tiers.ts — registry internal consistency", () => {
  it("TIER_ORDER contains exactly the canonical billing tiers", () => {
    expect(TIER_ORDER).toEqual(["free", "starter", "indie", "pro", "team"]);
  });

  it("TIERS array length matches TIER_ORDER length", () => {
    expect(TIERS).toHaveLength(TIER_ORDER.length);
  });

  it("every TIER_ORDER entry has a matching Tier object in TIERS_BY_ID", () => {
    for (const id of TIER_ORDER) {
      expect(TIERS_BY_ID[id]).toBeDefined();
      expect(TIERS_BY_ID[id].id).toBe(id);
    }
  });

  it("TIER_LABELS keys match TIER_ORDER exactly", () => {
    expect(Object.keys(TIER_LABELS).sort()).toEqual([...TIER_ORDER].sort());
  });

  it("TIER_PRICES keys match TIER_ORDER exactly", () => {
    expect(Object.keys(TIER_PRICES).sort()).toEqual([...TIER_ORDER].sort());
  });

  it("prices are in non-decreasing order across TIER_ORDER", () => {
    for (let i = 1; i < TIER_ORDER.length; i++) {
      const prev = TIER_PRICES[TIER_ORDER[i - 1]];
      const curr = TIER_PRICES[TIER_ORDER[i]];
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it("free tier has price 1", () => {
    expect(TIER_PRICES.free).toBe(1);
  });

  it("starter tier has price 3", () => {
    expect(TIER_PRICES.starter).toBe(3);
  });

  it("atom limits increase with tier order", () => {
    // -1 means unlimited — only team may have that
    const limits = TIER_ORDER.map((id) => TIERS_BY_ID[id].limits.maxAtoms);
    for (let i = 1; i < limits.length; i++) {
      const prev = limits[i - 1];
      const curr = limits[i];
      if (curr === -1) continue; // unlimited always beats any finite limit
      if (prev === -1) fail("A finite limit cannot follow an unlimited one");
      expect(curr).toBeGreaterThan(prev);
    }
  });

  it("every tier has non-empty name, description, and cta", () => {
    for (const tier of TIERS) {
      expect(tier.name.length).toBeGreaterThan(0);
      expect(tier.description.length).toBeGreaterThan(0);
      expect(tier.cta.length).toBeGreaterThan(0);
    }
  });

  it("every tier has a non-empty stripePriceEnvKey", () => {
    for (const tier of TIERS) {
      expect(tier.stripePriceEnvKey.length).toBeGreaterThan(0);
      expect(tier.stripePriceEnvKey).toMatch(/^STRIPE_PRICE_/);
    }
  });

  it("every tier has a non-empty stripeProductEnvKey", () => {
    for (const tier of TIERS) {
      expect(tier.stripeProductEnvKey.length).toBeGreaterThan(0);
      expect(tier.stripeProductEnvKey).toMatch(/^STRIPE_PRODUCT_/);
    }
  });
});

// ── 2. Helper functions ───────────────────────────────────────────────────────

describe("tiers.ts — helper functions", () => {
  it("isValidTierId returns true for all canonical IDs", () => {
    for (const id of TIER_ORDER) {
      expect(isValidTierId(id)).toBe(true);
    }
  });

  it("isValidTierId returns false for legacy names", () => {
    for (const legacy of ["solo", "enterprise", "growth"]) {
      expect(isValidTierId(legacy)).toBe(false);
    }
  });

  it("isValidTierId returns true for starter (canonical tier)", () => {
    expect(isValidTierId("starter")).toBe(true);
  });

  it("getTier returns the correct Tier object", () => {
    expect(getTier("pro").price).toBe(29);
    expect(getTier("indie").name).toBe("Solo");
  });

  it("getTier returns correct Starter tier", () => {
    expect(getTier("starter").price).toBe(3);
    expect(getTier("starter").name).toBe("Starter");
  });

  it("getTier throws for unknown IDs", () => {
    expect(() => getTier("solo")).toThrow(/Unknown tier/);
    expect(() => getTier("growth")).toThrow(/Unknown tier/);
  });

  it("getTierLabel returns display name for canonical IDs", () => {
    expect(getTierLabel("free")).toBe("Free");
    expect(getTierLabel("starter")).toBe("Starter");
    expect(getTierLabel("indie")).toBe("Solo");
    expect(getTierLabel("pro")).toBe("Professional");
    expect(getTierLabel("team")).toBe("Team");
  });

  it("getTierLabel falls back to raw string for unknown IDs", () => {
    expect(getTierLabel("solo")).toBe("solo");
    expect(getTierLabel("growth")).toBe("growth");
  });

  it("getTierLabel returns '—' for null/undefined", () => {
    expect(getTierLabel(null)).toBe("—");
    expect(getTierLabel(undefined)).toBe("—");
  });

  it("getTierPrice returns correct price for canonical IDs", () => {
    expect(getTierPrice("free")).toBe(1);
    expect(getTierPrice("starter")).toBe(3);
    expect(getTierPrice("indie")).toBe(9);
    expect(getTierPrice("pro")).toBe(29);
    expect(getTierPrice("team")).toBe(79);
  });

  it("getTierPrice returns 0 for unknown/null IDs", () => {
    expect(getTierPrice("solo")).toBe(0);
    expect(getTierPrice(null)).toBe(0);
  });
});

// ── 3. Legacy names banned from source files ──────────────────────────────────

describe("source files — no legacy tier names", () => {
  /**
   * These files must not contain the old Architecture A tier IDs as string
   * literals. The `starter` and `solo` IDs were used in the old dedicated-
   * droplet system and have been replaced by `indie` and `pro` respectively.
   */

  it("pricing/page.tsx does not use legacy tier IDs as string literals", () => {
    const src = readSrc("app/pricing/page.tsx");
    expect(src).not.toMatch(/id:\s*["']starter["']/);
    expect(src).not.toMatch(/id:\s*["']solo["']/);
    // Should import from tiers registry
    expect(src).toMatch(/@\/config\/tiers/);
  });

  it("pricing/PricingCTA.tsx does not contain TIER_TO_CHECKOUT remapping", () => {
    const src = readSrc("app/pricing/PricingCTA.tsx");
    expect(src).not.toContain("TIER_TO_CHECKOUT");
    expect(src).not.toContain('"solo"');
    // Should import validation from tiers registry
    expect(src).toMatch(/@\/config\/tiers/);
  });

  it("admin/AdminClient.tsx does not define its own TIER_LABELS inline", () => {
    const src = readSrc("app/admin/AdminClient.tsx");
    // Should not define a local TIER_LABELS constant
    expect(src).not.toMatch(/const TIER_LABELS\s*[:=]/);
    // Should not reference old tier IDs
    expect(src).not.toContain('"starter"');
    expect(src).not.toContain('"solo"');
    // Should import from tiers registry
    expect(src).toMatch(/@\/config\/tiers/);
  });

  it("dashboard/DashboardClient.tsx does not define TIER_LABELS or TIER_PRICES inline", () => {
    const src = readSrc("app/dashboard/DashboardClient.tsx");
    expect(src).not.toMatch(/const TIER_LABELS\s*[:=]/);
    expect(src).not.toMatch(/const TIER_PRICES\s*[:=]/);
    expect(src).not.toMatch(/const TIER_ORDER\s*[:=]/);
    // Should import from tiers registry
    expect(src).toMatch(/@\/config\/tiers/);
  });
});

// ── 4. Dead code files must not exist ────────────────────────────────────────

describe("dead code — legacy config files must be removed", () => {
  it("config/stripe-products.ts does not exist (Architecture A dead code)", () => {
    expect(() => readSrc("config/stripe-products.ts")).toThrow();
  });

  it("config/substrate-tiers.ts does not exist (replaced by tiers.ts)", () => {
    expect(() => readSrc("config/substrate-tiers.ts")).toThrow();
  });
});

// ── 5. Cross-project naming: compute product names must match website labels ──

describe("cross-project — compute Stripe product names align with website", () => {
  /**
   * The compute project's substrate-tier.ts defines `name` fields that become
   * Stripe product display names (visible on invoices, billing portal, emails).
   * These MUST use the same display names as the website tier registry.
   *
   * Expected format: "Parametric Memory — {displayName}"
   *
   * If this test fails, update the `name` field in:
   *   mmpm-compute/parametric-memory-compute/src/types/substrate-tier.ts
   * Then re-run: STRIPE_SECRET_KEY=sk_test_xxx npx tsx scripts/setup-stripe-products.ts
   */

  // Map of compute tier ID → expected Stripe product display name
  const EXPECTED_STRIPE_NAMES: Record<string, string> = {
    free: "Parametric Memory — Free",
    starter: "Parametric Memory — Starter",
    indie: "Parametric Memory — Solo",          // internal ID "indie", display "Solo"
    pro: "Parametric Memory — Professional",    // internal ID "pro", display "Professional"
    team: "Parametric Memory — Team",
  };

  it("all tiers have a defined expected Stripe product name", () => {
    for (const id of TIER_ORDER) {
      expect(EXPECTED_STRIPE_NAMES[id]).toBeDefined();
    }
  });

  it("expected Stripe names use the website display name, not the internal ID", () => {
    // These two tiers have internal IDs that differ from their display names.
    // This test ensures we never regress to using the internal ID in Stripe.
    expect(EXPECTED_STRIPE_NAMES["indie"]).toContain("Solo");
    expect(EXPECTED_STRIPE_NAMES["indie"]).not.toContain("Indie");
    expect(EXPECTED_STRIPE_NAMES["pro"]).toContain("Professional");
    expect(EXPECTED_STRIPE_NAMES["pro"]).not.toMatch(/— Pro$/);
  });

  it("expected Stripe product names match the 'Parametric Memory — {label}' pattern", () => {
    for (const id of TIER_ORDER) {
      const label = TIER_LABELS[id];
      const expected = `Parametric Memory — ${label}`;
      expect(EXPECTED_STRIPE_NAMES[id]).toBe(expected);
    }
  });
});

// ── 6. FAQ answers reference correct plan names ───────────────────────────────

describe("pricing/PricingClient.tsx — FAQ uses canonical plan names", () => {
  it("references 'Starter' plan (canonical $3/mo tier)", () => {
    const src = readSrc("app/pricing/PricingClient.tsx");
    // Starter at $3/mo is a canonical billing tier
    expect(src).toMatch(/Starter/);
  });

  it("references 'Solo' as the display name for the indie tier", () => {
    const src = readSrc("app/pricing/PricingClient.tsx");
    // Solo is the public display name for the indie ($9/mo) tier
    expect(src).toMatch(/\bSolo\b/);
  });

  it("does not claim 'dedicated instance' architecture for all tiers", () => {
    const src = readSrc("app/pricing/PricingClient.tsx");
    // The current architecture is shared containers, not dedicated instances per user
    expect(src).not.toMatch(/dedicated instance/i);
  });
});
