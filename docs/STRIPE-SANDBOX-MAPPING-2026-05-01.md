# Stripe Sandbox → Tier Mapping (2026-05-01)

**Stripe account:** `acct_1TARK1KPmxRibChZ` ("mmpm sandbox" — confirmed test mode by `mtr_test_*` meter ID on the atom-overage price).
**Goal:** Map every existing Stripe sandbox product to the canonical tier in `src/config/tiers.ts` and produce the env-var block to drop into the `mmpm-compute` droplet.

---

## TL;DR

**Every billing tier in `tiers.ts` already has a matching Stripe product + recurring monthly price at the correct amount.** No new products need to be created for Option B. The only work left is setting the env vars on the compute droplet.

There's also some sandbox cruft (older duplicate products and 9 "myproduct" entries from Stripe CLI experiments) — listed at the bottom for cleanup if you want.

---

## Canonical mapping — set these env vars on the compute droplet

```bash
# ── STRIPE TEST MODE — env vars for mmpm-compute ─────────────────────────────
# These map every tier in src/config/tiers.ts to its Stripe sandbox identifiers.
# Set these on the mmpm-compute droplet (NOT the website droplet — only compute
# talks to Stripe directly; website proxies via /api/billing/* endpoints).
#
# Stripe account: acct_1TARK1KPmxRibChZ (test mode / "mmpm sandbox")
# Source of truth for env-var KEYS: src/config/tiers.ts (stripePriceEnvKey, stripeProductEnvKey)

# Free ($1/mo) — post-trial fallback tier, not publicly sold
STRIPE_PRODUCT_FREE=prod_UDWIPBM9Hws5Jh
STRIPE_PRICE_FREE_MONTHLY=price_1TG2oPKPmxRibChZTKAHgWYv

# Starter ($3/mo) — shared cluster (Option B)
STRIPE_PRODUCT_STARTER=prod_UIyTVszpb4IINH
STRIPE_PRICE_STARTER_MONTHLY=price_1TKMbQKPmxRibChZXFjqx6lL

# Solo / indie ($9/mo) — shared cluster (Option B)
STRIPE_PRODUCT_INDIE=prod_UDWIoYrBd178SU
STRIPE_PRICE_INDIE_MONTHLY=price_1TF5FzKPmxRibChZcJaXUvvs

# Professional / pro ($29/mo) — dedicated instance
STRIPE_PRODUCT_PRO=prod_UDWIDlkdTthCz3
STRIPE_PRICE_PRO_MONTHLY=price_1TF5G0KPmxRibChZmTTNZeOq

# Team ($79/mo) — dedicated instance
STRIPE_PRODUCT_TEAM=prod_UDWIAIrI1D5RAS
STRIPE_PRICE_TEAM_MONTHLY=price_1TF5G2KPmxRibChZLwQhNxEB
```

**Apply on the compute droplet (you run, per your hard rules):**

```bash
# Why: writes the Stripe sandbox identifiers into the running compute service
# so checkout and tier-change flows can resolve tier IDs to the correct
# Stripe products + prices. Replaces any earlier values in .env.
# Where: SSH into the mmpm-compute droplet, repo root.
# Safe: edits .env only — no DB writes, no live Stripe calls.
ssh root@<compute-droplet-ip>
cd /opt/mmpm-compute   # or wherever the deployed repo lives
$EDITOR .env
# Paste the 10 lines above into the .env file under a comment block.
# Don't remove any other STRIPE_* vars (publishable key, secret key, webhook secret).

# Restart the service so the env reload picks up:
docker compose restart mmpm-service   # (or pm2 restart mmpm if using PM2)

# Verify the service sees the new vars:
docker compose exec mmpm-service env | grep STRIPE_
```

I cannot read or write your `.env*` files (per your hard rules), so this is a manual step.

---

## Enterprise tiers — out of scope for this checkout flow

| Tier | Stripe product | Latest price | Why not in env vars |
|---|---|---|---|
| Enterprise Cloud ($299/mo) | `prod_UAnf8gkAg7peli` | `price_1TCS4RKPmxRibChZlVxc107m` | Contact-sales only — no `stripePriceEnvKey` in `tiers.ts` |
| Enterprise Self-Hosted ($499/mo) | `prod_UAnfhexWDcTOWR` | `price_1TCS4SKPmxRibChZNKvEDgCE` | Contact-sales only — no `stripePriceEnvKey` |

These products exist at the right amounts in test mode if/when you wire them into a billed flow later. For now they only appear in `ENTERPRISE_TIERS` (mailto: links, no Stripe checkout).

---

## Atom-overage product

```
STRIPE_PRODUCT_ATOM_OVERAGE=prod_UDWI2aLZZLbTym
STRIPE_PRICE_ATOM_OVERAGE=price_1TF5JWKPmxRibChZ7g36TKHC
# Type: metered (mtr_test_61UOTFtCuKRJEhbFu41KPmxRibChZ29A)
```

Already wired in compute (separate envs from the tier block). No action needed.

---

## Sandbox cleanup (optional, you decide)

Test-mode account has artifacts from earlier experimentation that you may want to archive. **I won't archive them — that's a destructive action you should do yourself.** All can be archived from the dashboard at https://dashboard.stripe.com/test/products.

### 9 "myproduct" entries from Stripe CLI testing
```
prod_UBWNR1jLHwQAA1   (price $15)
prod_UBW1hL8NsEYXfl   (price $15)
prod_UBVu0PgqXvaet6   (price $15)
prod_UBVeutsVplMn35   (price $15)
prod_UBMTsWd7bTvOzz   (price $15)
prod_UBMQm1FdgsmTxj   (price $15)
prod_UBMNtWEFB8zufe   (price $15)
prod_UBMKAd28h1Ihtj   (price $15)
prod_UBMGiB8thxambf   (price $15)
```

### Older duplicates (no "Parametric Memory —" prefix) — superseded
```
prod_UAnf1jBUGaufmP   ("Starter")               — superseded by prod_UIyTVszpb4IINH
prod_UAnfHnRmvoyaSp   ("Solo")                  — superseded by prod_UDWIoYrBd178SU
prod_UAnfqLJnuZv6FE   ("Team")                  — superseded by prod_UDWIAIrI1D5RAS
```

The Pro tier doesn't have an obvious duplicate; just verify before archiving.

To archive each safely:
```
Stripe dashboard → Products → click the product → Archive
```
(Archiving is reversible. Don't delete; archive.)

---

## Smoke test the checkout flow

After setting env vars on compute and restarting:

```bash
# Why: confirms the website's /api/checkout endpoint resolves tier IDs to
# the correct Stripe sandbox prices. Use the Stripe test card 4242 4242 4242 4242.
# Where: parametric-memory.dev (production website, but it's pointing at
# Stripe test mode via the env vars above so no real charge happens).
# Safe: test-mode card; no real money moves.

# 1. Sign up a fresh test account on parametric-memory.dev
# 2. From the dashboard, click "Upgrade" on the Pro tier
# 3. Use card 4242 4242 4242 4242, any future expiry, any CVC, any ZIP
# 4. Confirm the checkout completes and the dashboard reflects "Professional"
# 5. From Stripe dashboard, verify a customer + subscription was created in test mode
```

If the checkout 422s with "missing STRIPE_PRICE_*", an env var didn't make it onto the running container — check the docker compose env or pm2 ecosystem file.

---

## What I changed in code (separate from Stripe)

```
.github/workflows/guards.yml   ← added llms-txt-sync job
docs/STRIPE-SANDBOX-MAPPING-2026-05-01.md   ← this file
```

**No code commits, no Stripe-side mutations.** Just the read-only audit + the CI guard.
