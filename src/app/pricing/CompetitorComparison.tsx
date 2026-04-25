/**
 * CompetitorComparison — `/pricing` "vs. Competitors" section.
 *
 * Item M5b (sprint 2026-W18). The previous implementation was a single
 * `overflow-x-auto` table that scrolled off-screen on 390px-wide mobile
 * viewports with no visual affordance. This component renders two
 * presentations of the same data:
 *
 *   - ≥ md  — the original comparison table (unchanged layout, sticky
 *             first column with z-index so the Parametric/Mem0/Zep values
 *             slide *under* it correctly on narrow desktop widths).
 *   - < md  — a stacked card layout: one card per feature row, with the
 *             three competitor values inside. No horizontal scrolling.
 *
 * Data is defined here (moved from pricing/page.tsx) so the pricing page
 * doesn't need to know about either layout.
 *
 * testids (pricing-* surface, per docs/DUAL-ACCESSIBILITY.md):
 *   - pricing-comparison            — section wrapper
 *   - pricing-comparison-table      — the md+ <table>
 *   - pricing-comparison-cards      — the <md card list
 *   - pricing-comparison-row-<slug> — one entry per feature (present in both
 *                                     layouts; tests scope with within()
 *                                     just like nav-link-* in the drawer).
 */

interface Row {
  feature: string;
  parametric: string;
  mem0: string;
  zep: string;
}

export const competitors: readonly Row[] = [
  {
    feature: "Pricing model",
    parametric: "Flat monthly subscription",
    mem0: "Subscription + overages",
    zep: "Credits (pay-as-you-go)",
  },
  {
    feature: "Dedicated instance",
    parametric: "Yes (hosted, managed)",
    mem0: "No (shared)",
    zep: "No (shared)",
  },
  {
    feature: "SSL/TLS certificate",
    parametric: "Yes (per instance)",
    mem0: "Shared / CDN",
    zep: "Shared / CDN",
  },
  { feature: "Cryptographic proofs", parametric: "Yes (RFC 6962)", mem0: "No", zep: "No" },
  { feature: "Markov prediction", parametric: "Yes (64% hit rate)", mem0: "No", zep: "No" },
  {
    feature: "Graph/relational memory",
    parametric: "Yes (included)",
    mem0: "No ($249 Pro only)",
    zep: "Yes",
  },
  { feature: "MCP native", parametric: "Yes", mem0: "No", zep: "No" },
  {
    feature: "Per-query costs",
    parametric: "None (flat rate)",
    mem0: "Yes (limits)",
    zep: "Yes (credits)",
  },
  {
    feature: "Your data isolated",
    parametric: "Yes (dedicated DB)",
    mem0: "No (shared DB)",
    zep: "No (shared DB)",
  },
] as const;

/**
 * Slugify a feature label for use inside a testid. Stable, lowercase,
 * non-word chars collapsed to dashes. Exported for tests.
 */
export function featureSlug(feature: string): string {
  return feature
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function CompetitorComparison() {
  return (
    <section
      data-testid="pricing-comparison"
      className="mx-auto max-w-5xl px-4 pb-24 sm:px-6"
      aria-label="Comparison with competitors"
    >
      <h2 className="mb-3 text-2xl font-bold text-white sm:text-3xl">vs. Competitors</h2>
      <p className="text-surface-200 mb-8 text-sm sm:text-base">
        Parametric Memory Professional ($29/mo) vs. Mem0 Starter ($19/mo) vs. Zep Flex ($25/mo)
      </p>

      {/* ── Desktop / tablet (≥ md): original table ──────────────────── */}
      <div
        data-testid="pricing-comparison-table"
        className="border-surface-200/10 bg-surface-900/30 hidden overflow-x-auto rounded-xl border backdrop-blur-sm md:block"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-surface-200/10 border-b">
              {/* z-10 ensures the sticky header cell paints over the scrolled
                  body cells (fixes the "value bleed" flagged in the audit). */}
              <th
                scope="col"
                className="bg-surface-950/80 sticky left-0 z-10 px-6 py-4 text-left font-semibold text-white"
              >
                Feature
              </th>
              <th scope="col" className="text-brand-300 px-6 py-4 text-center font-semibold">
                Parametric Memory
                <div className="mt-1 text-xs font-normal text-white">Professional · $29/mo</div>
              </th>
              <th scope="col" className="text-surface-300 px-6 py-4 text-center font-semibold">
                Mem0
                <div className="text-surface-400 mt-1 text-xs font-normal">Starter · $19/mo</div>
              </th>
              <th scope="col" className="text-surface-300 px-6 py-4 text-center font-semibold">
                Zep
                <div className="text-surface-400 mt-1 text-xs font-normal">Flex · $25/mo</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {competitors.map((row) => {
              const slug = featureSlug(row.feature);
              return (
                <tr
                  key={slug}
                  data-testid={`pricing-comparison-row-${slug}`}
                  className="border-surface-200/5 hover:bg-surface-900/50 border-b transition-colors"
                >
                  <th
                    scope="row"
                    className="bg-surface-950/40 sticky left-0 z-10 px-6 py-4 text-left font-medium text-white"
                  >
                    {row.feature}
                  </th>
                  <td className="px-6 py-4 text-center">
                    <span className="text-sm font-medium text-emerald-400">{row.parametric}</span>
                  </td>
                  <td className="text-surface-200 px-6 py-4 text-center">{row.mem0}</td>
                  <td className="text-surface-200 px-6 py-4 text-center">{row.zep}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Mobile (< md): stacked cards, no horizontal scroll ───────── */}
      <ul
        data-testid="pricing-comparison-cards"
        className="flex flex-col gap-3 md:hidden"
        aria-label="Feature comparison — mobile"
      >
        {competitors.map((row) => {
          const slug = featureSlug(row.feature);
          return (
            <li
              key={slug}
              data-testid={`pricing-comparison-row-${slug}`}
              className="border-surface-200/10 bg-surface-900/30 overflow-hidden rounded-xl border backdrop-blur-sm"
            >
              <h3 className="border-surface-200/10 bg-surface-950/40 border-b px-4 py-3 text-sm font-semibold text-white">
                {row.feature}
              </h3>
              <dl className="divide-surface-200/5 divide-y">
                <div className="flex flex-col gap-0.5 px-4 py-3">
                  <dt className="text-brand-300 text-xs font-semibold tracking-wide uppercase">
                    Parametric Memory
                  </dt>
                  <dd className="text-sm font-medium text-emerald-400">{row.parametric}</dd>
                </div>
                <div className="flex flex-col gap-0.5 px-4 py-3">
                  <dt className="text-surface-400 text-xs font-semibold tracking-wide uppercase">
                    Mem0
                  </dt>
                  <dd className="text-surface-200/80 text-sm">{row.mem0}</dd>
                </div>
                <div className="flex flex-col gap-0.5 px-4 py-3">
                  <dt className="text-surface-400 text-xs font-semibold tracking-wide uppercase">
                    Zep
                  </dt>
                  <dd className="text-surface-200/80 text-sm">{row.zep}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
