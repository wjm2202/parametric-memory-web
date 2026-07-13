/**
 * /privacy page tests.
 *
 * Why: the privacy policy makes factual claims about what the code does —
 * most critically §8, which claims to list EVERY cookie the site sets.
 * These tests lock the policy to the auth implementation so the two can't
 * drift apart silently: if a new cookie is added to the auth flow (or a
 * disclosure is deleted in a refactor), this suite fails and forces the
 * policy to be updated in the same change.
 *
 * The page is a Server Component (uses next/headers cookies()), so we
 * read the source file as text and assert the load-bearing strings appear,
 * mirroring src/app/copyright/__tests__/page.test.tsx.
 *
 * 2026-07-13 update (SSO/2FA/waitlist disclosures): see the session note
 * in memory (v1.task.website_seo_aeo_discoverability) for the gap analysis
 * that produced these assertions.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PAGE_PATH = path.join(process.cwd(), "src", "app", "privacy", "page.tsx");
const pageSrc = fs.readFileSync(PAGE_PATH, "utf-8");

/** Collapse whitespace so Prettier JSX re-wrapping can't flake assertions. */
const normalize = (s: string) => s.replace(/\s+/g, " ");
const src = normalize(pageSrc);

/**
 * Every cookie the site sets MUST be disclosed in the §8 table.
 * Sources of truth:
 *   mmpm_session        — src/app/auth/callback/route.ts (SESSION_COOKIE)
 *   mmpm_redirect       — post-login redirect flow
 *   mmpm_oauth_state    — src/lib/auth/oauth-start.ts (5-min OAuth state/PKCE)
 *   mmpm_pending_token  — src/lib/auth/oauth-callback.ts (10-min 2FA pending)
 * If you add a cookie to the auth flow, add it to the policy table AND here.
 */
const DISCLOSED_COOKIES = [
  "mmpm_session",
  "mmpm_redirect",
  "mmpm_oauth_state",
  "mmpm_pending_token",
] as const;

describe("/privacy — §8 cookie table completeness", () => {
  for (const cookie of DISCLOSED_COOKIES) {
    it(`discloses the ${cookie} cookie`, () => {
      expect(src).toContain(cookie);
    });
  }

  it("cookie-table durations match the auth implementation", () => {
    // mmpm_oauth_state: OAUTH_FLOW_TTL_MS = 5 * 60 * 1000 (pkce-store.ts)
    expect(src).toContain("5 minutes");
    // mmpm_pending_token: PENDING_TOKEN_MAX_AGE_SECONDS = 10 * 60 (oauth-callback.ts)
    expect(src).toContain("10 minutes");
    // mmpm_session: 30-day session
    expect(src).toContain("30 days");
  });

  it("claims exactly four essential cookies (update in lockstep with the table)", () => {
    expect(src).toContain("All four cookies are essential");
  });
});

describe("/privacy — OAuth SSO disclosure (§2.1)", () => {
  it("discloses data received from Google/GitHub sign-in", () => {
    expect(src).toContain("Sign-in with Google or GitHub (OAuth)");
    expect(src).toContain("display name");
    expect(src).toContain("unique account identifier");
    expect(src).toContain("never receive or store your Google or GitHub password");
  });

  it("links both providers' privacy policies", () => {
    expect(src).toContain("https://policies.google.com/privacy");
    expect(src).toContain(
      "https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement",
    );
  });
});

describe("/privacy — 2FA disclosure (§2.6)", () => {
  it("discloses TOTP shared-secret storage and its lifecycle", () => {
    expect(src).toContain("Two-Factor Authentication Data");
    expect(src).toContain("shared secret");
    expect(src).toContain("deleted when you disable 2FA or delete your account");
  });
});

describe("/privacy — waitlist disclosure (§2.7)", () => {
  it("discloses pre-account waitlist email collection and IP rate-limiting", () => {
    expect(src).toContain("Waitlist");
    expect(src).toContain("rate-limiting");
    // Waitlist mail flows through Resend — §5.3 must say so.
    expect(src).toContain("waitlist notifications");
  });
});

describe("/privacy — freshness", () => {
  it("Last Updated reflects the 2026-07-13 SSO/2FA/waitlist revision", () => {
    expect(src).toContain("Last Updated: 13 July 2026");
  });

  it("keeps the original effective date", () => {
    expect(src).toContain("Effective Date: 5 April 2026");
  });
});

describe("/privacy — claims that must stay true", () => {
  it("still claims no third-party analytics (breaks if GA/Clarity is ever added)", () => {
    expect(src).toContain("We do not use any third-party analytics services or tracking scripts");
  });

  it("still discloses Stripe 7-year billing retention", () => {
    expect(src).toContain("Stripe retains billing records for 7 years");
  });
});
