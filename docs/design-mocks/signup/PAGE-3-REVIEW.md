# Page 3 — Signup · Review

**Reviewed:** 2026-07-01 · **Target:** `src/app/signup/SignupClient.tsx` (+ compute `src/api/signup/routes.ts`)
**Finding:** U2 (Med) — "Signup asks for a tier before value is proven."
**Status:** U2 **already resolved in code**. One product decision + minor flags remain. No redesign mock needed.

---

## U2 is resolved

The review flagged a **required tier radio group (`signup-tier-select`)** forcing a price-bracket choice before the visitor saw anything. That control is **gone**. The current form is minimal:

- Email input (`signup-email`) + a Terms/Privacy clickwrap checkbox → **"Continue"**.
- No tier selection. The POST body is just `{ email, agreedToTerms, termsVersion }`.
- After submit: account is created, a magic sign-in link is emailed, and (for new accounts) the "Check your email" view shows the API key, the MCP config, and a **"Complete payment →"** button (Stripe `checkoutUrl`).

So the drop-off point the review identified — a required decision before first value — no longer exists. Good. (The registry entry `signup-tier-select` in `DUAL-ACCESSIBILITY.md` is now orphaned/unused; harmless, can be pruned.)

## The real decision — what tier does signup default to?

`compute/src/api/signup/routes.ts` creates the account with **`tier = 'free'`** (Basic) and builds the checkout for the Basic price (`SUBSTRATE_TIERS.free`). So every `/signup` visitor is defaulted to the **Basic tier** — the one we just decided **not to advertise** on pricing (200 atoms, $3/mo in compute / $1 legacy on the site).

This is a genuine inconsistency to resolve:

- The **homepage and pricing CTAs point to `/pricing`** ("Get your instance — $5/mo"), where the visitor picks a tier → checkout. That path leads with **Starter $5**.
- The **`/signup` path silently defaults to Basic** — a smaller, cheaper, unadvertised tier.

So a user's entry tier depends on which door they came through. Options:
1. **Default `/signup` to Starter ($5)** — consistent with the advertised entry point; U2's own recommendation was "default to Starter (or most-popular)."
2. **Keep Basic as the low-friction taster** — but then it should arguably be acknowledged somewhere, not silently assigned, and it conflicts with "don't advertise the $1 tier."
3. **Make `/signup` collect the tier from a query param** (e.g. `/signup?tier=starter` from the pricing CTA) and default to Starter otherwise.

This is a product/pricing-flow decision (and it touches compute), so I'm surfacing it rather than guessing.

## Minor flags (verify / cheap fixes)

- **Instance domain shown at signup.** The check-email view prints `{slug}.mmpm.co.nz` (SignupClient.tsx:202), but the owner-confirmed instance URL form is `<slug>.droplet-mcp.nz`. Confirm which is correct for a freshly provisioned substrate and make the displayed domain match the real one (same issue class as the homepage setup-card URL).
- **Stale route comment.** `signup/routes.ts` header says "$1/month free tier"; the Basic price is now $3 in compute. Cosmetic, but worth aligning.
- **Provision-before-payment.** Signup creates the Stripe customer + account + `pending_payment` substrate + checkout session *before* payment (known; also the LOW-MED signup cost-abuse security finding). Not a copy issue — noting for awareness.

## Recommendation

No mock/redesign is warranted — U2 is closed. The one decision that matters is the **default signup tier** (Basic vs Starter). Once you pick, the change is small: default to Starter in the compute signup route (and optionally honor `?tier=` from the pricing CTA). The domain-display and comment fixes are quick follow-ups.
