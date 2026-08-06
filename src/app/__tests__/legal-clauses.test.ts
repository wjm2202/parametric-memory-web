/**
 * Invariant tests for the legal pages (Terms of Service and Acceptable Use
 * Policy).
 *
 * Why these exist
 *   The legal pages contain protections we rely on commercially:
 *     - the right to change pricing when supplier costs or operating costs
 *       change (Terms §5.3),
 *     - the right to suspend, throttle, or terminate accounts at our
 *       reasonable discretion (Terms §6.2/6.3, AUP §5),
 *     - indemnification for third-party claims arising from customer data
 *       and downstream use of probabilistic outputs (Terms §14),
 *     - force majeure protection for upstream provider failures (Terms §15).
 *
 *   If any of these clauses are accidentally removed, modified out of
 *   recognition, or have their data-testid stripped, this test fails in CI
 *   before the page ships.
 *
 * What this test does NOT do
 *   - it does not render the page in jsdom (the page is a Next.js server
 *     component using `cookies()` and is awkward to render in unit tests),
 *   - it does not validate the legal force or enforceability of the clauses
 *     (that requires a lawyer review, see legal@parametric-memory.dev).
 *
 *   For full DOM rendering coverage, the Playwright smoke spec at
 *   e2e/smoke/public-pages.spec.ts visits these pages and asserts they
 *   render without errors.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const TERMS_SRC = readFileSync(resolve(__dirname, "../terms/page.tsx"), "utf8");
const AUP_SRC = readFileSync(resolve(__dirname, "../aup/page.tsx"), "utf8");

/**
 * Collapse runs of whitespace (spaces, tabs, newlines) to a single space so
 * regex assertions over the rendered prose are not coupled to whatever line
 * wrapping prettier picks. Prettier reflows JSX text every time the file is
 * formatted, so any test that hard-codes a particular newline placement is
 * a flaky test waiting to happen.
 */
const normalize = (s: string) => s.replace(/\s+/g, " ");
const TERMS_FLAT = normalize(TERMS_SRC);
const AUP_FLAT = normalize(AUP_SRC);

describe("Terms of Service — required protective clauses", () => {
  it("declares the right to change pricing (§5.3)", () => {
    expect(TERMS_SRC).toContain('data-testid="terms-pricing-changes"');
    expect(TERMS_SRC).toContain("5.3 Right to Change Pricing");
    expect(TERMS_SRC).toMatch(/right to change pricing/i);
  });

  it("enumerates all required pricing-change grounds", () => {
    // These are the categories that justify a price change. If any is
    // removed, the clause loses scope.
    expect(TERMS_SRC).toMatch(/Supplier or infrastructure costs change/);
    expect(TERMS_SRC).toMatch(/Operational costs exceed the fees charged for a plan/);
    expect(TERMS_SRC).toMatch(/Currency, tax, or regulatory changes/);
    expect(TERMS_SRC).toMatch(/Material changes to the Service/);
    expect(TERMS_SRC).toMatch(/Anti-abuse or fair-use enforcement/);
  });

  it("preserves 30-day notice for price increases on existing subs", () => {
    // Required for consumer-protection compliance in EU/UK/AU.
    expect(TERMS_SRC).toMatch(/30 days(?:&rsquo;|')? advance notice/);
  });

  it("declares downgrades unsupported and prohibited (§5.5)", () => {
    // Downgrades are not a supported product flow: the platform provisions
    // per-tier resources and never reduces a running instance in place. The
    // clause must state all three: not technically feasible, not supported,
    // and contractually prohibited — and preserve the cancellation carveout.
    expect(TERMS_SRC).toContain('data-testid="terms-no-downgrades"');
    expect(TERMS_SRC).toContain("5.5 Plan Changes");
    expect(TERMS_FLAT).toMatch(/Downgrades to a lower-priced tier are not technically feasible/);
    expect(TERMS_FLAT).toMatch(/not supported, and are expressly prohibited/);
    expect(TERMS_FLAT).toMatch(/must not attempt to effect a downgrade/);
    expect(TERMS_FLAT).toMatch(/you may always cancel/);
  });

  it("declares suspension rights at sole and reasonable discretion (§6.2)", () => {
    expect(TERMS_SRC).toContain('data-testid="terms-suspension"');
    expect(TERMS_SRC).toContain("6.2 Suspension by MMPM");
    expect(TERMS_SRC).toMatch(/sole and reasonable discretion/);
    expect(TERMS_SRC).toMatch(/suspend, throttle, rate-limit/);
  });

  it("enumerates the suspension grounds we rely on", () => {
    expect(TERMS_SRC).toMatch(/breached, or are likely to breach/);
    expect(TERMS_FLAT).toMatch(/fraudulent activity, payment chargebacks/);
    expect(TERMS_SRC).toMatch(/payment is overdue, declined, reversed/);
    expect(TERMS_SRC).toMatch(/disproportionate operational/);
    expect(TERMS_SRC).toMatch(/threatens the integrity, security/);
    expect(TERMS_SRC).toMatch(/required to do so by applicable law/);
    expect(TERMS_SRC).toMatch(/abusive, threatening, or harassing behaviour/);
  });

  it("declares termination rights for cause (§6.3)", () => {
    expect(TERMS_SRC).toContain('data-testid="terms-termination"');
    expect(TERMS_SRC).toContain("6.3 Termination by MMPM");
    expect(TERMS_SRC).toMatch(/immediately and without refund/);
  });

  it("declares no refund on termination for cause (§6.5)", () => {
    expect(TERMS_SRC).toContain('data-testid="terms-no-refund-cause"');
    expect(TERMS_SRC).toMatch(
      /No refund or service credit will be issued for periods during which/,
    );
  });

  it("preserves the indemnification clause (§14)", () => {
    expect(TERMS_SRC).toContain('data-testid="terms-indemnification"');
    expect(TERMS_SRC).toContain("14. Indemnification");
    expect(TERMS_SRC).toMatch(/defend, indemnify, and hold/);
    expect(TERMS_SRC).toMatch(/Your data, content, or memory atoms/);
    expect(TERMS_SRC).toMatch(/probabilistic memory outputs/);
  });

  it("preserves the force majeure clause (§15)", () => {
    expect(TERMS_SRC).toContain('data-testid="terms-force-majeure"');
    expect(TERMS_SRC).toContain("15. Force Majeure");
    expect(TERMS_SRC).toMatch(/upstream cloud,\s+hosting, AI model, or payment providers/);
  });

  it("preserves consumer-protection carveouts (cannot be drafted away)", () => {
    // We must keep these so the aggressive clauses survive judicial review
    // in NZ/EU/UK/AU/CA. If someone deletes them, we lose the whole posture.
    expect(TERMS_FLAT).toMatch(
      /Mandatory consumer protection rights in your jurisdiction are unaffected/,
    );
    expect(TERMS_FLAT).toMatch(
      /mandatory consumer protection law in your jurisdiction prohibits or limits/,
    );
  });

  it("includes pricing-change and suspension rows in the quick-reference summary", () => {
    expect(TERMS_SRC).toMatch(/"Pricing Changes"/);
    expect(TERMS_SRC).toMatch(/"Plan Changes"/);
    expect(TERMS_SRC).toMatch(/"Suspension"/);
    expect(TERMS_SRC).toMatch(/"Indemnification"/);
    expect(TERMS_SRC).toMatch(/"Force Majeure"/);
  });

  it("includes a data-persistence row in the quick-reference summary", () => {
    expect(TERMS_SRC).toMatch(/"Data Persistence"/);
  });
});

describe("Terms of Service — L2 cache / no data-permanence clause", () => {
  it("declares MMPM is a transient L2 cache, not a long-term data store (§2)", () => {
    expect(TERMS_SRC).toContain('data-testid="terms-l2-cache-nature"');
    expect(TERMS_FLAT).toMatch(/short-lived, best-effort L2 cache/);
    expect(TERMS_FLAT).toMatch(/not a long-term data store/);
    expect(TERMS_FLAT).toMatch(/loaded, used, and destroyed/);
    expect(TERMS_FLAT).toMatch(/transient and duplicative/);
  });

  it("declares data permanence is not guaranteed and is the data owner's sole responsibility (§2)", () => {
    expect(TERMS_FLAT).toMatch(
      /Data permanence is not, and has never been, a guarantee of the Service/,
    );
    expect(TERMS_FLAT).toMatch(/no responsibility for data loss, corruption, or unavailability/);
    expect(TERMS_FLAT).toMatch(
      /mastering, backing up, and preserving your data outside of MMPM is your sole responsibility/,
    );
  });

  it("expands §9.3 into a dedicated 'not a long-term data store' clause", () => {
    expect(TERMS_SRC).toContain('data-testid="terms-not-a-data-store"');
    expect(TERMS_SRC).toContain(
      "9.3 Not a Long-Term Data Store &mdash; L2 Cache Nature of the Service",
    );
    expect(TERMS_FLAT).toMatch(/temporary, best-effort L2 cache/);
    expect(TERMS_FLAT).toMatch(/agents and agent swarms/);
    expect(TERMS_FLAT).toMatch(
      /Data permanence is not guaranteed by the Service at any plan or tier, and we accept no responsibility for data loss/,
    );
    expect(TERMS_FLAT).toMatch(/all care, no responsibility/);
    expect(TERMS_FLAT).toMatch(
      /Responsibility for data permanence, backup, and durability of the source data rests solely and exclusively with you/,
    );
    // still preserves the pre-existing deletion mechanics
    expect(TERMS_FLAT).toMatch(/Deletion removes access to your data within 24 hours/);
    expect(TERMS_FLAT).toMatch(/MMPM is not a backup system/);
  });

  it("carries the no-permanence warning into the AS-IS disclaimer box (§7)", () => {
    expect(TERMS_FLAT).toMatch(
      /MMPM IS A TRANSIENT L2 CACHE, NOT A LONG-TERM DATA STORE\. WE DO NOT WARRANT DATA PERMANENCE AT ANY TIER OR PLAN\./,
    );
  });

  it("no longer advertises fixed month-based retention windows on the pricing table", () => {
    // The pricing table used to render row.retentionLabel ("12/24/36
    // months", "Unlimited") per plan — that directly contradicted the
    // no-permanence clause above. It must now render the uniform
    // persistenceLabel under a "Data Persistence" column instead. (The
    // per-plan labels themselves are locked down in
    // src/lib/pricing/__tests__/pricing-persistence.test.ts.)
    expect(TERMS_SRC).not.toContain("row.retentionLabel");
    expect(TERMS_SRC).not.toContain("<th>Retention</th>");
    expect(TERMS_SRC).toContain("row.persistenceLabel");
    expect(TERMS_SRC).toContain("<th>Data Persistence</th>");
  });
});

describe("Acceptable Use Policy — required enforcement clauses", () => {
  it("documents the full enforcement ladder (§5.1)", () => {
    expect(AUP_SRC).toContain('data-testid="aup-enforcement-actions"');
    expect(AUP_SRC).toContain("5.1 Range of Actions");
    for (const action of [
      "Warning",
      "Quarantine",
      "Throttling or rate-limiting",
      "Read-only mode",
      "Account suspension",
      "Account termination",
      "Permanent ban",
      "Reporting to authorities",
    ]) {
      expect(AUP_SRC, `enforcement action missing from AUP §5.1: ${action}`).toContain(action);
    }
  });

  it("preserves no-prior-notice authority for severe violations (§5.2)", () => {
    expect(AUP_SRC).toContain('data-testid="aup-no-prior-notice"');
    expect(AUP_SRC).toMatch(/not required to provide warning or a cure period/);
  });

  it("declares enforcement is at sole and reasonable discretion (§5.3)", () => {
    expect(AUP_SRC).toContain('data-testid="aup-discretion"');
    expect(AUP_SRC).toMatch(/sole and reasonable discretion/);
    expect(AUP_FLAT).toMatch(
      /may prevent future account creation by the same individual, organization, payment method, or affiliated entity/,
    );
  });

  it("preserves no-refund-on-enforcement clause (§5.4)", () => {
    expect(AUP_SRC).toContain('data-testid="aup-no-refund"');
    expect(AUP_FLAT).toMatch(
      /No refund or service credit will be issued for periods during which an account was suspended, throttled, or terminated for cause/,
    );
  });

  it("AUP cross-references Terms §6 for refund consistency", () => {
    expect(AUP_FLAT).toMatch(/Section&nbsp;6 of the/);
  });
});

describe("Cross-document consistency", () => {
  it("Terms references the AUP for acceptable use", () => {
    expect(TERMS_SRC).toMatch(/href="\/aup"/);
  });

  it("AUP references the Terms of Service", () => {
    expect(AUP_SRC).toMatch(/href="\/terms"/);
  });

  it("both documents share the same effective date after a coordinated update", () => {
    // If we change one, we should change the other in the same change-set.
    const termsDate = TERMS_SRC.match(/Effective Date: ([^&]+?)&nbsp;/)?.[1]?.trim();
    const aupDate = AUP_SRC.match(/Effective Date: ([^&]+?)&nbsp;/)?.[1]?.trim();
    expect(termsDate).toBeTruthy();
    expect(aupDate).toBeTruthy();
    expect(termsDate).toEqual(aupDate);
  });
});
