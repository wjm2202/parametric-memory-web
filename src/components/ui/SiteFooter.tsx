/* ── SiteFooter — site-wide sitemap + canonical copyright line ────────────
 * Rendered globally from src/app/layout.tsx so every page on the site carries
 * BOTH a full sitemap (so humans and AI agents/crawlers can reach every page
 * from anywhere — the top nav is intentionally lean) and the canonical
 * copyright statement.
 *
 * Dual-accessibility (docs/DUAL-ACCESSIBILITY.md): the sitemap links are
 * always server-rendered — no JS disclosure — so they are discoverable by
 * crawlers, answer engines, and Playwright without interaction. Legal +
 * Privacy links live here (they were removed from the top nav on 2026-07-02
 * to fix nav overcrowding); this footer is where every page's legal journey
 * is guaranteed reachable.
 *
 * The copyright paragraph is the SHORT FORM of the notice; the long form
 * (proprietary licence, authorship statement, NZ jurisdiction clause) lives
 * at /copyright and in the LICENSE file at the repo root.
 *
 * Why a dedicated component:
 *   • single source of truth for the sitemap + copyright wording
 *   • testable in isolation (see SiteFooter.test.tsx)
 *   • guarantees the footer appears on every page (admin, dashboard, pricing,
 *     login, etc.) regardless of whether that page has its own hero footer.
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

/* ── Sitemap data ──────────────────────────────────────────────────────────
 * Single source of truth for the footer link graph. Each link carries a
 * stable `footer-link-<slug>` testid (pre-registered in DUAL-ACCESSIBILITY.md)
 * so agents/tests can target it. Exported for reuse in tests.
 */
export interface FooterLink {
  href: string;
  label: string;
  testid: string;
}
export interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

export const SITE_FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: "Product",
    links: [
      { href: "/pricing", label: "Pricing", testid: "footer-link-pricing" },
      { href: "/enterprise", label: "Enterprise", testid: "footer-link-enterprise" },
      { href: "/verify", label: "Verify", testid: "footer-link-verify" },
      { href: "/docs", label: "Docs", testid: "footer-link-docs" },
      { href: "/knowledge", label: "Knowledge graph", testid: "footer-link-knowledge" },
      { href: "/visualise", label: "Visualise", testid: "footer-link-visualise" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About", testid: "footer-link-about" },
      { href: "/blog", label: "Blog", testid: "footer-link-blog" },
      { href: "/faq", label: "FAQ", testid: "footer-link-faq" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/terms", label: "Terms", testid: "footer-link-terms" },
      { href: "/privacy", label: "Privacy", testid: "footer-link-privacy" },
      { href: "/aup", label: "Acceptable use", testid: "footer-link-aup" },
      { href: "/dpa", label: "Data processing", testid: "footer-link-dpa" },
      { href: "/copyright", label: "Copyright", testid: "footer-link-copyright" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer
      role="contentinfo"
      aria-label="Site footer"
      className="border-surface-800/40 mt-auto border-t bg-[#030712]"
      data-testid="site-footer"
    >
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* ── Sitemap ─────────────────────────────────────────────────────── */}
        <nav
          aria-label="Footer"
          data-testid="footer-sitemap"
          className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 md:grid-cols-4"
        >
          {/* Brand cell (spans a column on wider layouts) */}
          <div className="col-span-2 sm:col-span-3 md:col-span-1">
            <span className="font-display text-surface-300 text-sm font-semibold">
              Parametric Memory
            </span>
            <p className="text-surface-500 mt-2 max-w-xs text-xs leading-relaxed">
              Persistent, verifiable memory for AI agents.
            </p>
          </div>

          {SITE_FOOTER_COLUMNS.map((col) => (
            <div key={col.heading}>
              <h2 className="text-surface-500 text-xs font-semibold tracking-wider uppercase">
                {col.heading}
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      data-testid={link.testid}
                      className="font-body text-surface-400 hover:text-surface-200 text-sm transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* ── Canonical copyright trailer ─────────────────────────────────── */}
        <div className="border-surface-800/40 mt-10 border-t pt-6">
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
      </div>
    </footer>
  );
}
