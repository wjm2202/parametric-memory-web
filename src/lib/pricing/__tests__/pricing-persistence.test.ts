/**
 * Data-persistence invariant for the pricing table.
 *
 * Added 2026-08-06 alongside the Terms of Service L2-cache / no-permanence
 * clause. MMPM is a transient L2 cache, not a long-term data store, and no
 * plan may imply otherwise. Previously this module mapped each tier to a
 * fixed retention window ("12 months", "36 months", "Unlimited") — that
 * directly contradicted the new Terms language, so it was removed in favor
 * of a single non-committal label across every tier.
 *
 * This test locks in two things:
 *   1. every row carries the same, non-numeric persistence label — no plan
 *      is allowed to reintroduce a durability promise, and
 *   2. the label itself does not contain digits or "unlimited" (both read as
 *      guarantees to a reasonable customer).
 */

import { describe, it, expect } from "vitest";
import { getPricingTableRows } from "@/lib/pricing";

describe("pricing table — no per-plan data-retention guarantees", () => {
  it("every row uses the same persistence label", () => {
    const rows = getPricingTableRows();
    expect(rows.length).toBeGreaterThan(0);
    const labels = new Set(rows.map((r) => r.persistenceLabel));
    expect(labels.size).toBe(1);
  });

  it("the persistence label makes no durability promise (no numbers, no 'unlimited')", () => {
    for (const row of getPricingTableRows()) {
      expect(row.persistenceLabel, `${row.name} persistenceLabel`).not.toMatch(/\d/);
      expect(row.persistenceLabel, `${row.name} persistenceLabel`).not.toMatch(/unlimited/i);
    }
  });

  it("the persistence label explicitly disclaims long-term storage", () => {
    for (const row of getPricingTableRows()) {
      expect(row.persistenceLabel, `${row.name} persistenceLabel`).toMatch(/not.*long-term/i);
    }
  });
});
