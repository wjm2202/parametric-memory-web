import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 2 — testid reconciliation sweep.
 *
 * Asserts the kebab-case testids registered in docs/DUAL-ACCESSIBILITY.md are
 * the ones the source files actually emit, and that no stale `oauth-button-*`
 * or "Join with" labels survive anywhere.
 *
 * Pattern: source-contract — we read the TSX as text rather than rendering,
 * because these components pull in server-only config and we only care that
 * the literals are right.
 */

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

describe("Phase 2: testid reconciliation", () => {
  describe("LoginClient.tsx — OAuth button labels and testids", () => {
    const src = read("src/app/login/LoginClient.tsx");

    it('emits "Sign in with Google" and "Sign in with GitHub" labels', () => {
      expect(src).toContain("Sign in with Google");
      expect(src).toContain("Sign in with GitHub");
    });

    it('has no stale "Join with" labels', () => {
      expect(src).not.toMatch(/Join with Google/);
      expect(src).not.toMatch(/Join with GitHub/);
    });

    it("emits signin-${id} testid for OAuth providers", () => {
      expect(src).toContain("`signin-${id}`");
    });

    it("has no stale oauth-button-* testids", () => {
      expect(src).not.toMatch(/oauth-button-/);
    });

    it("carries the registered form/email/submit/error testids", () => {
      expect(src).toContain('data-testid="login-form"');
      expect(src).toContain('data-testid="login-email"');
      expect(src).toContain('data-testid="login-submit"');
      expect(src).toContain('data-testid="login-error"');
    });

    it('error container uses role="alert" for assistive tech', () => {
      expect(src).toMatch(
        /data-testid="login-error"[^>]*role="alert"|role="alert"[^>]*data-testid="login-error"/,
      );
    });
  });

  describe("SignupClient.tsx — form testids", () => {
    const src = read("src/app/signup/SignupClient.tsx");

    it("carries the registered form/email/submit/error testids", () => {
      expect(src).toContain('data-testid="signup-form"');
      expect(src).toContain('data-testid="signup-email"');
      expect(src).toContain('data-testid="signup-form-submit"');
      expect(src).toContain('data-testid="signup-error"');
    });

    it('error container uses role="alert" for assistive tech', () => {
      expect(src).toMatch(
        /data-testid="signup-error"[^>]*role="alert"|role="alert"[^>]*data-testid="signup-error"/,
      );
    });
  });

  describe("HeroAnimatedSequence.tsx — landing hero CTAs", () => {
    const src = read("src/components/landing/HeroAnimatedSequence.tsx");

    it("primary CTA carries landing-hero-cta-primary testid", () => {
      expect(src).toContain('data-testid="landing-hero-cta-primary"');
    });

    it("secondary CTA carries landing-hero-cta-secondary testid", () => {
      expect(src).toContain('data-testid="landing-hero-cta-secondary"');
    });
  });

  describe("WaitlistForm.tsx — form testids", () => {
    const src = read("src/components/landing/WaitlistForm.tsx");

    it("carries waitlist-form/email/submit testids", () => {
      expect(src).toContain('data-testid="waitlist-form"');
      expect(src).toContain('data-testid="waitlist-email"');
      expect(src).toContain('data-testid="waitlist-submit"');
    });
  });

  describe("PricingCTA.tsx — pricing card CTAs", () => {
    const src = read("src/app/pricing/PricingCTA.tsx");

    it("emits pricing-card-{slug}-cta testid with indie→solo map", () => {
      // The ternary `tierId === "indie" ? "solo" : tierId` is the basis for
      // the registry slug — keep it verbatim so the registry stays authoritative.
      expect(src).toMatch(/pricing-card-\$\{tierId === "indie" \? "solo" : tierId\}-cta/);
    });

    it("has no stale pricing-card-indie-cta literal anywhere", () => {
      expect(src).not.toMatch(/pricing-card-indie-cta/);
    });
  });

  describe("LoginClient.test.tsx — tests reference new testids", () => {
    const src = read("src/app/login/LoginClient.test.tsx");

    it("references signin-* testids (not oauth-button-*)", () => {
      expect(src).toContain("signin-google");
      expect(src).toContain("signin-github");
      expect(src).not.toMatch(/oauth-button-/);
    });

    it('asserts "Sign in with ..." labels (not "Join with ...")', () => {
      expect(src).toContain("Sign in with Google");
      expect(src).toContain("Sign in with GitHub");
      expect(src).not.toMatch(/Join with Google/);
      expect(src).not.toMatch(/Join with GitHub/);
    });
  });
});
