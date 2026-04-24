import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 3 — SSO tap targets + iOS polish.
 *
 * WCAG 2.5.5 Target Size (AAA) requires interactive targets ≥ 44x44 CSS px;
 * Apple HIG and Material Design both converge on 48px as the practical floor.
 * This suite asserts the source-level invariants that back that guarantee for
 * /login, /signup, and their shared OAuth provider buttons.
 *
 * iOS Safari's 100vh includes the retracting bottom UI bar, so content can be
 * cropped by ~75px when the bar is visible. `100dvh` (dynamic viewport height)
 * is the stable replacement; we check that both auth pages use it for the
 * outer wrapper.
 */

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

describe("Phase 3: SSO tap targets + iOS polish", () => {
  describe("LoginClient.tsx", () => {
    const src = read("src/app/login/LoginClient.tsx");

    it("OAuth provider button has min-h-[48px] tap target", () => {
      // The OAuth <a> is the className starting with "group flex ... rounded-lg border".
      expect(src).toMatch(
        /className="group flex min-h-\[48px\][^"]*rounded-lg border border-white\/10/,
      );
    });

    it("email submit button has min-h-[48px] tap target", () => {
      // The submit button is the className with "bg-indigo-600 ... disabled:opacity-40".
      expect(src).toMatch(
        /className="flex min-h-\[48px\][^"]*bg-indigo-600[^"]*disabled:opacity-40"/,
      );
    });

    it("outer page wrapper uses min-h-[100dvh] (not min-h-screen)", () => {
      expect(src).toContain("min-h-[100dvh]");
      expect(src).not.toMatch(/className="[^"]*min-h-screen/);
    });

    it('"Create an account" footer link has inline-block tap padding', () => {
      // Prettier's Tailwind plugin canonicalises to: `-my-1 inline-block py-1 ...`.
      // We match on that order — the linter is the single source of truth.
      expect(src).toMatch(
        /href="\/signup"[\s\S]{0,60}className="-my-1 inline-block py-1 text-indigo-400/,
      );
    });
  });

  describe("SignupClient.tsx", () => {
    const src = read("src/app/signup/SignupClient.tsx");

    it("submit button has min-h-[48px] tap target", () => {
      expect(src).toMatch(
        /className="flex min-h-\[48px\][^"]*bg-indigo-600[^"]*disabled:opacity-40"/,
      );
    });

    it("outer page wrapper uses min-h-[100dvh] (not min-h-screen)", () => {
      expect(src).toContain("min-h-[100dvh]");
      expect(src).not.toMatch(/className="[^"]*min-h-screen/);
    });

    it("Terms of Service link has inline-block tap padding", () => {
      // Prettier's Tailwind plugin canonicalises to `-my-1 inline-block py-1`.
      expect(src).toMatch(
        /href="\/terms"[\s\S]{0,200}className="-my-1 inline-block py-1 text-white\/70/,
      );
    });

    it("Privacy Policy link has inline-block tap padding", () => {
      expect(src).toMatch(
        /href="\/privacy"[\s\S]{0,200}className="-my-1 inline-block py-1 text-white\/70/,
      );
    });
  });
});
