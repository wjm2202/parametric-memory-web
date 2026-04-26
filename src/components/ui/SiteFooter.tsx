/* ── SiteFooter — canonical copyright + jurisdiction line ─────────────────
 * Rendered globally from src/app/layout.tsx so every page on the site
 * carries the same copyright statement. The text on this component is
 * the SHORT FORM of the notice; the long form (proprietary licence,
 * authorship statement, NZ jurisdiction clause) lives at /copyright and
 * in the LICENSE file at the repo root.
 *
 * Why a dedicated component:
 *   • single source of truth for the wording
 *   • testable in isolation (see SiteFooter.test.tsx)
 *   • matches privacy/terms etc. that already say "Parametric Memory
 *     Limited · New Zealand" — we line up with that visual idiom
 *
 * IMPORTANT: do NOT add nav links here. The homepage and legal pages have
 * their own richer footers with site nav. This component is purely the
 * legal trailer that must appear on every page (admin, dashboard,
 * pricing, login, etc.) regardless of whether that page has its own footer.
 */
import Link from "next/link";

export const COPYRIGHT_YEAR_RANGE = "2025–2026";
export const COPYRIGHT_HOLDER = "G. Osborne";

/**
 * Short-form copyright string asserted by tests. Keep this exact text
 * stable: the homepage layout test, the SiteFooter unit test, and the
 * /copyright page test all reference it.
 */
export const COPYRIGHT_LINE = `© ${COPYRIGHT_YEAR_RANGE} ${COPYRIGHT_HOLDER}. All rights reserved. Authored in New Zealand.`;

export default function SiteFooter() {
  return (
    <footer
      role="contentinfo"
      aria-label="Site copyright"
      className="border-surface-800/40 mt-auto border-t bg-[#030712]"
      data-testid="site-footer"
    >
      <div className="mx-auto max-w-6xl px-6 py-6">
        <p
          className="text-surface-500 font-mono text-[11px] leading-relaxed sm:text-xs"
          data-testid="site-footer-copyright"
        >
          {COPYRIGHT_LINE}{" "}
          <Link
            href="/copyright"
            className="text-surface-400 hover:text-surface-200 underline underline-offset-2"
            data-testid="site-footer-copyright-link"
          >
            Copyright &amp; licensing
          </Link>
          .
        </p>
      </div>
    </footer>
  );
}
