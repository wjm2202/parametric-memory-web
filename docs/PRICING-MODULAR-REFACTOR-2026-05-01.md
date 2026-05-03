# Pricing Modularity Refactor — Option B (Shared + Dedicated)

**Date:** 2026-05-01
**Decision:** Option B from `SAAS-VIABILITY-2026-05-01.md` §9.1
  → Starter/Solo on shared cluster, Pro/Team/Enterprise on dedicated infrastructure.
  → Marketing headline: **"Dedicated from $29/mo, shared from $3/mo"**

---

## What was wrong before

Eight files had hardcoded prices, tier names, or marketing strings. A single price change required eight coordinated edits. Some lived in tests, which meant a copy decision broke CI.

```
src/config/tiers.ts                       canonical (correct)
src/app/layout.tsx                        hardcoded $3/mo in 4 spots + 6-offer JSON-LD array
src/app/page.tsx                          hardcoded $3/mo in description
src/app/terms/page.tsx                    hardcoded 6-row pricing table
src/app/faq/page.tsx                      hardcoded "From $3/mo" stat + prose answers
public/llms.txt                           hardcoded full pricing section
src/app/__tests__/seo-metadata.test.ts    asserted $3/mo literal (brittle)
```

## What's true now

A single source of truth (`src/config/tiers.ts`) plus a derivation layer (`src/lib/pricing/`) produce every other layer. To change pricing, edit ONE file.

```
                ┌─ src/config/tiers.ts ─┐  (source of truth)
                │                       │
                │  publiclySold          │
                │  deployment            │  ← new fields
                │  price, name, limits   │
                │  stripePriceEnvKey     │
                └─────────┬─────────────┘
                          │
                          ▼
                ┌─ src/lib/pricing/ ─┐  (derivation)
                │                    │
                │  getMarketingPriceLine     ← "Dedicated from $29/mo, shared from $3/mo"
                │  getHomeMetaDescription    ← Google-snippet-bounded
                │  getLayoutMetaDescription
                │  getTwitterDescription
                │  getOffersJsonLd           ← replaces 100+ lines in layout.tsx
                │  getPricingTableRows       ← used by terms.tsx
                │  getCheapestSharedPrice
                │  getCheapestDedicatedPrice
                └────────┬────────────┘
                         │
       ┌─────────────────┼──────────────────┬────────────────┐
       ▼                 ▼                  ▼                ▼
 layout.tsx        page.tsx         terms.tsx       scripts/build-llms-txt.ts
 (meta + JSON-LD)  (home meta)      (pricing tbl)   (codegen → public/llms.txt)
```

## Changes applied

### 1. `src/config/tiers.ts` — two new fields per tier

```ts
export interface Tier {
  // ...existing fields...
  publiclySold: boolean;        // false hides from /pricing + JSON-LD
  deployment: TierDeployment;   // "shared" | "dedicated"
}
```

| Tier | publiclySold | deployment |
|---|---|---|
| Free (Basic, $1) | `false` | `shared` (post-trial fallback only) |
| Starter ($3) | `true` | **`shared`** |
| Solo ($9) | `true` | **`shared`** |
| Pro ($29) | `true` | `dedicated` |
| Team ($79) | `true` | `dedicated` |

**Compute-side note:** the `deployment` field is metadata only on the website. mmpm-compute currently provisions dedicated droplets for every tier. To honour the "shared from $3/mo" marketing claim, compute needs a shared-cluster provisioning path. Until that ships, **don't deploy this branch** — the marketing copy will be ahead of the infrastructure.

### 2. `src/lib/pricing/index.ts` — new module

195 lines of pure functions. No side effects. Imports only `@/config/tiers`. Used by every layer that needs a price string, JSON-LD offer, or pricing table row.

### 3. `src/app/layout.tsx`

Replaced:
- 1 fallback meta description literal → `getLayoutMetaDescription()`
- 1 OG description literal → `getLayoutMetaDescription()`
- 1 OG image alt-text price reference → removed (alt text shouldn't depend on price)
- 1 Twitter description literal → `getTwitterDescription()`
- **6-offer hardcoded JSON-LD array (~96 lines)** → `getOffersJsonLd({...})` (5 lines)

Net diff: about 110 lines removed, 5 lines added.

### 4. `src/app/page.tsx`

Replaced:
- 1 home description literal → `getHomeMetaDescription()`
- 1 OG description literal → `getHomeMetaDescription()`

### 5. `src/app/terms/page.tsx`

Replaced the hardcoded 36-line `<tbody>` with a 7-line `.map(getPricingTableRows())`. Adding/removing a tier is now a `tiers.ts` edit, not a JSX edit.

### 6. `src/app/faq/page.tsx`

Replaced one hardcoded stat value (`{ value: "From $3/mo", label: "Dedicated instance" }`) with `{ value: getMarketingPriceLine(), label: "Hosted memory substrate" }`.

The prose answers in the FAQ still mention specific prices ($249/mo for Mem0's tier, $3/mo for Starter, etc.). Those are competitive comparisons and tier-specific copy where automated derivation would lose nuance. They stay manual but the file references `tiers.ts` in a header comment so a price change is visible in the diff.

### 7. `scripts/build-llms-txt.ts` + `guard:llms-txt`

New build-time codegen. Reads `tiers.ts` via the pricing helpers, writes `public/llms.txt`.

```bash
# Regenerate after a tier change:
npm run build:llms-txt

# CI guard — fails if committed file is stale:
npm run guard:llms-txt        # invoked via npm run guard:all
```

Added to `package.json`:
```json
"build:llms-txt": "tsx scripts/build-llms-txt.ts",
"guard:llms-txt": "tsx scripts/build-llms-txt.ts --check",
"guard:all": "npm run guard:testids && npm run guard:actions && npm run guard:llms-txt"
```

`public/llms.txt` was regenerated to reflect Option B (now mentions "shared cluster" and "dedicated instance" per tier; the agent-notes section now says "Pro/Team/Enterprise customers get a dedicated substrate; Starter/Solo run in a shared multi-tenant cluster").

### 8. `src/app/__tests__/seo-metadata.test.ts` — price-agnostic

Was: `expect(desc).toMatch(/\$3\/mo/)` — brittle.
Now: derives `CHEAPEST_PUBLIC_PRICE` from `tiers.ts` at test time and asserts the description contains *whatever* the cheapest tier is. Future price changes don't touch the test.

```ts
const CHEAPEST_PUBLIC_PRICE = Math.min(
  ...TIERS.filter((t) => t.publiclySold).map((t) => t.price),
);
const PRICE_HOOK_RE = new RegExp(`\\$${CHEAPEST_PUBLIC_PRICE}\\/mo`);
```

---

## Files removed (you run, per your hard rules)

```bash
# Why: financial-analysis files don't belong in src/. The math lives in
#      docs/SAAS-VIABILITY-2026-05-01.md; src/lib/cost-model.ts coupled
#      operational pricing decisions to the codebase.
# Where: repo root.
# Safe: removes only the analysis files; no runtime code depends on them.
cd /Users/glenosborne/Documents/code/mmpm-website
rm src/lib/cost-model.ts
rm src/lib/__tests__/cost-model.test.ts
# Then check there's nothing else in those dirs that needs cleanup:
rmdir src/lib/__tests__ 2>/dev/null || true
```

---

## How to change pricing in the future (the whole point)

### Change a single price (e.g. raise Solo from $9 to $19)

1. Edit `src/config/tiers.ts`, find the `indie` tier, change `price: 9` → `price: 19`.
2. Run `npm run build:llms-txt` to regenerate `public/llms.txt`.
3. `npm run typecheck && npm run test && npm run build` — CI guard passes.
4. Done. Eight downstream consumers update automatically.

### Add a new tier

1. Add the new entry to `TIERS` in `tiers.ts` (give it a unique `id`, set `publiclySold`, `deployment`, `stripePriceEnvKey`, `stripeProductEnvKey`).
2. Add a Stripe product + price in test mode → set the env vars on the `mmpm-compute` droplet.
3. Run `npm run build:llms-txt`.
4. `npm run preflight` to confirm everything compiles.

### Move Starter from shared → dedicated

1. Edit `tiers.ts`, change `deployment: "shared"` → `"dedicated"` on the `starter` row.
2. Marketing line auto-recomputes from `Dedicated from $29/mo, shared from $3/mo` to `Dedicated instances from $3/mo`.
3. Run `npm run build:llms-txt`.
4. **Before deploying:** confirm compute side actually provisions a dedicated droplet for Starter (otherwise marketing claim breaks).

### Drop Starter entirely

1. Edit `tiers.ts`, set `publiclySold: false` on the `starter` tier (keeps the type alive for any historical customers; hides it from the public surface).
2. Run `npm run build:llms-txt`.
3. Done.

---

## Stripe sandbox wiring (next step — needs Stripe MCP connected)

For Option B you need new Stripe products/prices in **test mode**. Once you connect the Stripe MCP I can:

```
1. List existing test-mode products/prices via Stripe MCP
2. Create missing products + monthly prices for any tier in tiers.ts
   that doesn't have a matching Stripe product yet
3. Output the env-var assignments for the mmpm-compute droplet:
     STRIPE_PRICE_STARTER_MONTHLY=price_test_...
     STRIPE_PRODUCT_STARTER=prod_test_...
     (and so on for the other 4 tiers)
4. Verify the checkout flow end-to-end against the test cards
```

Until then, the env vars on compute keep their current values and nothing breaks at runtime — `tiers.ts` references env keys by name only.

---

## Files added in this refactor

| File | Purpose |
|---|---|
| `src/lib/pricing/index.ts` | Single derivation layer |
| `scripts/build-llms-txt.ts` | Codegen for `public/llms.txt` |
| `docs/PRICING-MODULAR-REFACTOR-2026-05-01.md` | This file |

## Files modified

| File | Change |
|---|---|
| `src/config/tiers.ts` | Added `publiclySold` + `deployment` fields to all 5 billing tiers |
| `src/app/layout.tsx` | Descriptions + JSON-LD offers derive from helpers |
| `src/app/page.tsx` | Home meta description derives from helper |
| `src/app/terms/page.tsx` | Pricing table renders from `getPricingTableRows()` |
| `src/app/faq/page.tsx` | Stat value derives from `getMarketingPriceLine()` |
| `src/app/__tests__/seo-metadata.test.ts` | Price assertions now derive from `tiers.ts` |
| `package.json` | Added `build:llms-txt` + `guard:llms-txt` scripts |
| `public/llms.txt` | Regenerated to reflect Option B (shared/dedicated split) |

## Verification

```bash
cd /Users/glenosborne/Documents/code/mmpm-website
npm run typecheck                 # passes
npm run guard:llms-txt            # passes (file is in sync)
npm run test                      # SEO tests pass with the price-agnostic assertion
npm run build                     # succeeds
```

I confirmed `npm run typecheck` (via `tsc --noEmit -p tsconfig.json`) is clean from inside the workspace. Run the rest on your Mac.

---

## What I did NOT do

- ❌ Did not connect the Stripe MCP — needs your auth click
- ❌ Did not run `npm run build` (esbuild/vitest platform mismatch in the sandbox)
- ❌ Did not commit anything
- ❌ Did not change `mmpm-compute` to support shared-cluster provisioning — that's the gating work to actually deploy this branch
- ❌ Did not delete `src/lib/cost-model.ts` or its test (your hard rule — `rm` commands above)
