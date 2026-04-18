# Silent-Block Failure Modes Catalog — MMPM / Parametric Memory

**Created:** 2026-04-19 | **Launch:** 2026-04-25  
**Governing principle:** `v1.procedure.never_silent_block_user` — every refusal exposes (a) that the user was blocked, (b) why in plain language, (c) one concrete next action. Applies to human UI and AI agent channels equally.  
**Companion doc:** `silent-block-ux-audit-plan.md` has code-level fix tables F-1 through F-14. This catalog is the complete enumeration; entries below say "See audit plan F-N" when a fix is already scoped.

---

## SIGNUP

### F-SIGNUP-1 — checkoutUrl stripped at TypeScript cast boundary
**Trigger:** `SignupResult` interface omits `checkoutUrl`; compute returns it at `signup/routes.ts:246` but it's cast away on the website side.  
**Detection:** `mmpm-website/src/app/signup/SignupClient.tsx:8–23`  
**Current behavior:** User lands on "check your email" with no payment link; substrate stuck `pending_payment` forever.  
**Blast radius:** Every new signup.  
**Human UI:** Inline "Complete payment →" button when `status==='pending_payment'` and `checkoutUrl` set; `toast.error("Account created but payment link is missing — try again or contact support.")` if absent.  
**Machine:** `{ error_code:"checkout_url_missing", human_message:"Account created but checkout link unavailable.", next_action:"Retry signup or visit /pricing.", remediation_url:"/pricing" }`  
**Recovery CTA:** "Go to pricing"  
**Test:** vitest — mock 201 without `checkoutUrl`, assert toast fires.  
**Audit plan:** See F-1 to F-4. **Priority: P0**

---

### F-SIGNUP-2 — Billing not configured (Stripe env var missing)
**Trigger:** `getStripePriceId()` throws; `signup/routes.ts:118–120` returns 503 `{ error: 'Billing not configured' }` — no `error_code`.  
**Detection:** `parametric-memory-compute/src/api/signup/routes.ts:118`  
**Current behavior:** Website shows generic error.  
**Blast radius:** All signups when Stripe env vars are missing post-deploy.  
**Human UI:** Toast: "Our payment system is temporarily unavailable. Try again in a few minutes."  
**Machine:** `{ error_code:"billing_unavailable", human_message:"Payment system temporarily unavailable.", next_action:"Retry in a few minutes." }`  
**Recovery CTA:** "Try again"  
**Test:** vitest integration — 503 returns `error_code:'billing_unavailable'`.  
**Audit plan:** New. **Priority: P0**

---

### F-SIGNUP-3 — Substrate cap exceeded (DB trigger fires raw 500)
**Trigger:** `trg_enforce_substrate_cap` fires on INSERT; `err.code==='P0001'` not caught; falls through to `throw err` → 500 with raw stack.  
**Detection:** `parametric-memory-compute/src/api/signup/routes.ts:257–273`  
**Current behavior:** Raw 500; no waitlist offered.  
**Blast radius:** All signups when tier is full.  
**Human UI:** Inline: "This tier is currently full. Join the waitlist — you'll be first when space opens." Show `WaitlistForm` immediately.  
**Machine:** `{ error_code:"substrate_cap_exceeded", human_message:"All slots for this tier are currently full.", next_action:"POST /api/capacity/waitlist", remediation_url:"/pricing" }`  
**Preventative tooltip:** Pricing CTA when `status==='waitlist'`: "This tier is full. Click to join the waitlist."  
**Recovery CTA:** "Join waitlist"  
**Test:** vitest integration — INSERT at cap returns 409 with `error_code`.  
**Audit plan:** See F-5 to F-8. **Priority: P0**

---

### F-SIGNUP-5 — Abandoned signup leaves orphaned `pending_payment` DB state (blocks retry)
**Trigger:** User reaches Stripe Checkout but closes the page / clicks "back" without paying.  
**Detection:** `parametric-memory-compute/src/api/signup/routes.ts:150–192` — the INSERT into `substrates`, `billing_events`, `spend_caps`, plus Stripe customer creation, all commit BEFORE the checkout session exists. No reaper seen in codebase.  
**Current behavior:** Second signup attempt with the same email hits the 409 `email_exists` branch (sends magic link), NOT a fresh checkout. User thinks "I already signed up?" and gives up. Substrate row stuck `pending_payment` forever.  
**Blast radius:** Every user who abandons checkout and tries to come back. Conservative estimate: 15–30% of top-of-funnel.  
**Founder decision 2026-04-19:** abandon = restart. No resume URL. But the DB state must NOT block the restart.  
**Required fix (two parts):**
  1. **Reaper worker** — new periodic job (every 5 min) that deletes any `substrates` row where `status='pending_payment'` AND `created_at < now() - interval '30 minutes'` AND `pending_api_key IS NOT NULL` (never claimed). Cascade delete `billing_events` row, release spend_cap, and cancel the Stripe customer if no other substrate references it.
  2. **Signup endpoint guard** — before returning 409 `email_exists`, check whether the caller's existing account has ANY active substrate. If the only substrate is `pending_payment` with a non-claimed key, treat the request as a restart: reap the old row in the same transaction and proceed with fresh signup.
**Human UI:** Standard 409 magic-link flow still applies for a truly existing paid account. For the abandoned-signup case, the user simply sees the normal checkout page — as if they never came before.  
**Machine:** `{ error_code:"signup_restart_ok", human_message:"Continuing your signup.", ai_message:"Previous abandoned signup reaped. New checkout session created.", next_action:"Complete checkout." }`  
**Test:** integration — (a) signup, abandon, signup again within 30 min → second POST returns fresh `checkoutUrl` (not 409); (b) abandon, wait 30 min → reaper deletes row, ensure no Stripe customer orphan; (c) signup, complete payment, signup again → 409 as expected (paid account IS a real conflict).  
**Migration touch:** None — logic-only change.  
**Audit plan:** New. **Priority: P0**

---

### F-SIGNUP-4 — Email conflict / slug collision edge cases missing error_code
**Trigger:** Email already exists → 409 `{ error:'email_exists' }`; slug collision → 503 `{ error:'temporary_conflict' }`. Neither includes `error_code`.  
**Detection:** `signup/routes.ts:104, 268`  
**Current behavior:** 409 path auto-sends magic link (handled); 503 path shows generic error.  
**Blast radius:** Returning users (409, common); slug collision (503, rare).  
**Human UI:** 409 → "Account found — check your inbox for a sign-in link."; 503 → Toast: "Signup hit a conflict. Please try again."  
**Machine:** `{ error_code:"email_exists"|"slug_collision", human_message:"...", next_action:"..." }`  
**Audit plan:** Partially noted in audit plan batch section. **Priority: P1**

---

## AUTH

### F-AUTH-1 — Magic link expired or already used
**Trigger:** User clicks magic link after 15 min or after first use.  
**Detection:** `mmpm-website/src/app/auth/callback/route.ts:46–49` → redirect `/login?error=invalid_token`; `LoginClient.tsx:9` maps to "This sign-in link has expired or has already been used."  
**Current behavior:** Handled — inline error banner on login page. Missing: machine response shape, and tooltip on the "check email" screen.  
**Blast radius:** Any user who delays or double-clicks.  
**Preventative tooltip:** "check your email" screen: "This link expires in 15 minutes and can only be used once."  
**Machine:** `{ error_code:"token_expired_or_used", human_message:"Sign-in link expired or already used.", next_action:"Request a new sign-in link." }`  
**Recovery CTA:** "Request new link"  
**Audit plan:** New. **Priority: P1**

---

### F-AUTH-2 — Resend email provider failure
**Trigger:** Resend API down or quota exceeded; `emailProvider.send()` throws; `auth/routes.ts:73–76` → 500.  
**Detection:** `parametric-memory-compute/src/services/auth-service.ts:91`  
**Current behavior:** `LoginClient.tsx:89` maps `.error` to inline message — acceptable, but no `error_code`.  
**Blast radius:** All sign-in attempts when Resend is down.  
**Human UI:** Inline: "We couldn't send your sign-in email. Try again in a few minutes."  
**Machine:** `{ error_code:"email_delivery_failed", human_message:"Sign-in email could not be sent.", next_action:"Retry in a few minutes." }`  
**Audit plan:** New. **Priority: P1**

---

### F-AUTH-3 — Auth callback compute unreachable
**Trigger:** `/auth/callback` fetch to compute throws `ECONNREFUSED` / timeout.  
**Detection:** `mmpm-website/src/app/auth/callback/route.ts:59–62` → redirect `/login?error=server_error`  
**Current behavior:** Handled — "Something went wrong on our end." No status page link.  
**Human UI:** Add status page link to error banner.  
**Machine:** `{ error_code:"auth_service_unavailable", human_message:"Sign-in service temporarily unavailable.", next_action:"Try again in a few minutes." }`  
**Audit plan:** New. **Priority: P1**

---

### F-AUTH-4 — Rate limit on magic link requests
**Trigger:** >3 requests/hr (per email) or >5/min (per IP). `LoginClient.tsx:80–85` already handles 429 with correct copy.  
**Detection:** `parametric-memory-compute/src/api/auth/routes.ts:51–52`  
**Current behavior:** Handled correctly in UI. Missing: machine response shape.  
**Machine:** `{ error_code:"rate_limited", human_message:"Too many sign-in requests. Please wait an hour.", next_action:"Wait 1 hour before requesting another link." }`  
**Audit plan:** New. **Priority: P2**

---

## PAYMENT / BILLING

### F-BILLING-1 — Stripe checkout cancelled by user
**Trigger:** User closes Stripe checkout. Three different `cancel_url` values exist in the compute codebase today.  
**Detection (confirmed 2026-04-19):**
  - `src/api/signup/routes.ts:217` — new signup → `${baseUrl}/signup?checkout=cancelled` ✓
  - `src/api/billing/substrate-checkout.ts:187` — upgrade → `${baseUrl}/dashboard?checkout=cancelled` ✓
  - `src/app.ts:369` — fallback → `http://localhost:3000/billing/cancel` ✗ (probably dead)
**Current behavior:** Signup cancel redirects to `/signup?checkout=cancelled` — but the website's signup page does not render a banner on `?checkout=cancelled`. User lands on empty signup form, confused. Fallback `/billing/cancel` route unverified.  
**Blast radius:** Any user who abandons checkout. See F-SIGNUP-5 for the DB orphan that ALSO must be cleaned up.  
**Founder decision 2026-04-19:** abandon = restart (no resume URL). This F-BILLING-1 fix is purely about the cancel-landing page UX.  
**Human UI fix:** On `/signup?checkout=cancelled`, render banner: "Your checkout was not completed. Choose a plan below to try again." Keep the form primed with their email if still in session. Remove the `/billing/cancel` fallback entirely (delete from `app.ts:369` default or point it at `/pricing?checkout=cancelled`).  
**Machine:** N/A (browser redirect).  
**Recovery CTA:** Primary signup form CTA, no separate "resume" path.  
**Test:** vitest snapshot — mount `/signup` with `?checkout=cancelled` query → banner present with the specified copy.  
**Audit plan:** New. **Priority: P0**

---

### F-BILLING-2 — Card declined / invoice.payment_failed → read_only
**Trigger:** Stripe declines card; webhook moves substrate to `read_only`.  
**Detection:** `parametric-memory-compute/src/api/webhooks/substrate-stripe.ts:611`  
**Current behavior:** Dashboard shows "Read Only" badge. No tooltip explaining what it means or how to fix it.  
**Blast radius:** Any paying customer whose card fails.  
**Human UI:** Dashboard banner: "Payment failed. Your substrate is in read-only mode. Update your card to restore access." `read_only` badge tooltip: "Payment failed — writes blocked."  
**Machine:** `{ error_code:"payment_failed", human_message:"Last payment failed. Substrate is in read-only mode.", next_action:"Update your payment method.", remediation_url:"/dashboard" }`  
**Recovery CTA:** "Manage billing" → Stripe portal  
**Audit plan:** New. **Priority: P0**

---

### F-BILLING-3 — Webhook late / lost — substrate stuck pending_payment
**Trigger:** Stripe webhook delayed; substrate never transitions from `pending_payment`.  
**Detection:** `substrate-stripe.ts` — provisioning only triggers on webhook receipt.  
**Current behavior:** `pending_payment` not in `StatusBadge.labels`; renders raw string with unstyled fallback. No explanation, no CTA. (verified — audit plan gap 2)  
**Blast radius:** Any customer after a Stripe incident or deploy timing gap.  
**Human UI:** Add `pending_payment` to labels: "Payment Processing" (amber). Dashboard banner: "Your payment was received and we're setting up your substrate. Usually resolves in under 5 minutes."  
**Machine:** `{ error_code:"pending_payment", human_message:"Payment received, provisioning in progress.", next_action:"Wait up to 10 minutes, then contact support." }`  
**Recovery CTA:** "Contact support" (show after 10 min)  
**Audit plan:** Audit plan gap 2. **Priority: P0**

---

### F-BILLING-4 — Billing portal URL silently absent on 200
**Trigger:** `/api/billing/portal` returns 200 but `portalUrl` field absent; `DashboardClient.tsx:74–77` returns silently.  
**Detection:** `mmpm-website/src/app/dashboard/DashboardClient.tsx:76`  
**Current behavior:** User clicks "Manage billing" — nothing happens.  
**Human UI:** `toast.error('Could not open billing portal. Please try again.')`  
**Machine:** `{ error_code:"billing_portal_unavailable", human_message:"Billing portal could not be opened.", next_action:"Try again or contact support." }`  
**Audit plan:** See F-14. **Priority: P1**

---

### F-BILLING-5 — Spend cap exceeded → must auto-flip substrate to `read_only`
**Trigger:** Cumulative spend hits cap; Stripe webhook stamps subscription `cap_exceeded`.  
**Detection:** `substrate-stripe.ts:208–225, 370`. Whether `substrates.status` is also updated: **unconfirmed in webhook code path.**  
**Founder decision 2026-04-19:** spend_cap_exceeded → substrates.status='read_only' MUST cascade automatically. AI clients calling the API directly must receive the same structured error as the dashboard shows.  
**Required fix (three parts):**
  1. **Webhook cascade** — when `subscription.status='cap_exceeded'` lands, the same handler also updates `substrates.status='read_only'` with a new column `read_only_reason='spend_cap_exceeded'`. Atomic in one transaction.
  2. **Middleware enforcement** — F-MCP-5 (see MCP section). Without that, the status flag is cosmetic.
  3. **AI-facing error** — when middleware rejects, the `error_code` is `substrate_read_only_spend_cap`, `ai_message` tells the AI client to stop writing and prompt the user for a cap raise.
**Human UI:** Dashboard banner: "Monthly spend cap reached. Substrate is in read-only mode. Reads still work. Raise cap or wait for monthly reset."  
**Machine:** `{ error_code:"substrate_read_only_spend_cap", human_message:"Monthly spend cap reached. Substrate paused in read-only.", ai_message:"Spend cap exceeded. Substrate read-only. Tell user to raise cap at /billing/caps or wait for monthly reset.", next_action:"Raise cap or wait for monthly reset.", remediation_url:"/billing/caps" }`  
**Preventative tooltip:** Billing widget: spend progress bar; warning banner at 80% usage.  
**Migration touch:** Add `read_only_reason TEXT` column to `substrates` via node-pg-migrate file.  
**Test:** integration — (a) trigger `cap_exceeded` webhook, assert `substrates.status='read_only'` AND `read_only_reason='spend_cap_exceeded'`; (b) MCP write with that substrate returns the full envelope with correct `error_code` and `ai_message`; (c) MCP read succeeds (read_only means writes blocked, reads permitted).  
**Audit plan:** New. Upgraded from P1 → **Priority: P0** per founder decision on auto-flip + AI-API path.

---

### F-BILLING-6 — Session checkout errors missing error_code (400/403/404)
**Trigger:** Tier missing, account not found, or account closed.  
**Detection:** `parametric-memory-compute/src/api/checkout/session-route.ts:56, 62, 66`  
**Current behavior:** `{ error: string }` without `error_code`; clients cannot distinguish types.  
**Machine:** Add `error_code:"invalid_tier"|"account_not_found"|"account_closed"` to each path.  
**Audit plan:** Audit plan batch section. **Priority: P1**

---

## CAPACITY / TIER

### F-CAP-1 — Pricing page mount capacity check silently fails open
**Trigger:** Capacity fetch on `PricingCardClient.tsx` mount throws; bare `catch { return capacity }` at line 115.  
**Detection:** `mmpm-website/src/app/pricing/PricingCardClient.tsx:115`  
**Current behavior:** Page shows tier as "available" even when status is unknown. User proceeds to checkout that may fail.  
**Human UI:** `toast.error('Could not check availability — tier status may not be current.')`  
**Machine:** `{ error_code:"capacity_unavailable", human_message:"Availability check failed.", next_action:"Retry the page." }`  
**Audit plan:** See F-9, F-10. **Priority: P1**

---

### F-CAP-2 — CTA click capacity check silently fails open
**Trigger:** `PricingCTA.tsx:163` catch swallows network error on capacity check; user proceeds without knowing tier is ambiguous.  
**Detection:** `mmpm-website/src/app/pricing/PricingCTA.tsx:163`  
**Human UI:** `toast.error('Could not verify availability. Please try again before purchasing.')` + disable CTA 3s.  
**Audit plan:** See F-11. **Priority: P1**

---

### F-CAP-3 — Waitlist form silent network failure
**Trigger:** `WaitlistForm.tsx:37` POST fails. Code sets `errorMsg` — partially handled.  
**Detection:** `mmpm-website/src/app/pricing/WaitlistForm.tsx:37–39`  
**Current behavior:** Error paragraph rendered but copy is generic ("Network error. Check your connection.") — acceptable. Verify it's visually distinct.  
**Human UI:** Copy: "We couldn't save your details. Please check your connection and try again."  
**Machine:** `{ error_code:"waitlist_failed", human_message:"Could not save waitlist entry.", next_action:"Try again." }`  
**Audit plan:** See F-13 (partially fixed). **Priority: P1**

---

## PROVISIONING / LIFECYCLE

### F-PROV-1 — Droplet creation failed (provision_failed)
**Trigger:** DigitalOcean API error; provisioner sets `substrates.status='provision_failed'`.  
**Detection:** `parametric-memory-compute/src/workers/substrate-provisioner.ts:1313–1333`  
**Current behavior:** Dashboard shows "Provision Failed" badge. No CTA, no next step visible.  
**Human UI:** Dashboard banner on `provision_failed`: "Your substrate could not be set up. Our team has been notified. Contact support and we'll sort this out."  
**Machine:** `{ error_code:"provision_failed", human_message:"Substrate provisioning failed.", next_action:"Contact support.", remediation_url:"mailto:support@parametric-memory.dev" }`  
**Preventative tooltip:** Badge: "Something went wrong during setup — this is our fault."  
**Recovery CTA:** "Contact support"  
**Audit plan:** New. **Priority: P0**

---

### F-PROV-2 — Provisioning timeout (poll expires silently)
**Trigger:** `BillingSuccessClient.tsx` polls up to `MAX_ATTEMPTS`; when exhausted, polling stops with no user message.  
**Detection:** `mmpm-website/src/app/billing/success/BillingSuccessClient.tsx:104–115`  
**Current behavior:** Spinner stops silently. User has no next action.  
**Human UI:** On poll timeout: "Provisioning is taking longer than usual. Refresh the page in a minute, or contact support if it still hasn't started."  
**Machine:** `{ error_code:"provisioning_timeout", human_message:"Provisioning is taking longer than expected.", next_action:"Refresh in 1 minute." }`  
**Preventative tooltip:** "Provisioning" badge: "Setting up your private substrate — usually ready in 2 minutes."  
**Recovery CTA:** "Refresh page"  
**Audit plan:** New. **Priority: P1**

---

### F-PROV-3 — Health check unreachable, usage shows null
**Trigger:** `/health` fetch on substrate times out (5s); `liveUsage` stays null; `usageUnavailable:true` returned.  
**Detection:** `parametric-memory-compute/src/api/substrates/routes.ts:1288–1307`  
**Current behavior:** Whether dashboard renders `usageUnavailable` as a visible message is unverified.  
**Human UI:** Dashboard usage section: "Usage stats temporarily unavailable — your substrate is still running."  
**Machine:** `{ error_code:"usage_unavailable", human_message:"Usage stats could not be fetched.", next_action:"Refresh in a few minutes." }`  
**Audit plan:** New. **Priority: P2**

---

## KEY / AUTH TOKEN LIFECYCLE

### F-KEY-1 — Key rotation in progress (double-rotation attempt)
**Trigger:** 409 `{ error:'rotation_not_available' }` when rotating while one is in progress.  
**Detection:** `parametric-memory-compute/src/api/substrates/routes.ts:533–538`  
**Current behavior:** 409 returned; whether dashboard renders it as visible message is unverified.  
**Human UI:** Dashboard inline: "Key rotation in progress — your current key stays active until it completes (usually 2–3 minutes)."  
**Machine:** `{ error_code:"rotation_in_progress", human_message:"Key rotation already in progress.", next_action:"Wait for current rotation to complete." }`  
**Preventative tooltip:** Rotate button: "Rotation replaces your API key across 5 locations and takes 2–3 minutes."  
**Audit plan:** New. **Priority: P1**

---

### F-KEY-2 — Stale token in Claude Desktop cache after rotation
**Trigger:** Key rotated; 5-location chain updated; customer's `~/.mcp-auth/` cache still has old token → 401s on MCP calls.  
**Detection:** No in-product detection path; failure is downstream only.  
**Current behavior:** Customer gets silent 401s with no in-product explanation.  
**Human UI:** Post-rotation success screen must include: "You must also clear your Claude Desktop cache: `rm -rf ~/.mcp-auth/` then restart Claude Desktop." Copy-pasteable command shown.  
**Machine:** `{ error_code:"key_rotation_complete", human_message:"Key rotated. Clear ~/.mcp-auth/ and restart Claude Desktop.", next_action:"rm -rf ~/.mcp-auth/", detail:"5-location chain updated" }`  
**Audit plan:** New. **Priority: P1**

---

### F-KEY-3 — Claim link already used (pending_api_key is NULL)
**Trigger:** Second claim attempt; `pending_api_key IS NULL` → `{ claimed:false }` returned.  
**Detection:** `parametric-memory-compute/src/api/substrates/routes.ts:551–598`  
**Current behavior:** `{ claimed:false }` with HTTP 200; whether dashboard surfaces this clearly is unverified.  
**Human UI:** "This key has already been claimed. If you've lost your key, use key rotation to generate a new one."  
**Machine:** `{ error_code:"key_already_claimed", human_message:"API key already claimed.", next_action:"Use key rotation to generate a new key." }`  
**Preventative tooltip:** Claim Key button: "Each key can only be claimed once. Store it in a password manager."  
**Recovery CTA:** "Rotate key"  
**Audit plan:** New. **Priority: P1**

---

## MCP RUNTIME

### F-MCP-1 — MCP OAuth / Bearer validation fail (substrate not running)
**Trigger:** AI client calls MCP endpoint; substrate is `pending_payment`, `provisioning`, or `provision_failed`; Bearer invalid.  
**Detection:** mmpm-service container; specific error body shape unverified.  
**Current behavior:** AI client likely receives 401 with no structured body. No human UI path for this failure.  
**Human UI:** Dashboard banner: "Your AI assistant cannot connect. Substrate status: [status badge]. [context-specific action]."  
**Machine (MCP-level):** `{ error_code:"substrate_not_ready", human_message:"Substrate is not running.", next_action:"Wait for provisioning or check your dashboard.", remediation_url:"https://parametric-memory.dev/dashboard" }`  
**Preventative tooltip:** MCP endpoint config field: "Your AI can only connect when substrate status is 'Running'."  
**Audit plan:** New. **Priority: P0**

---

### F-MCP-2 — Bootstrap monthly cap reached
**Trigger:** `memory_session_bootstrap` call count exceeds `max_bootstraps_month` for tier.  
**Detection:** `substrate/routes.ts:1277–1279` (limit resolution); enforcement response shape unverified.  
**Current behavior:** Unverified — AI client may receive a generic error with no explanation.  
**Human UI:** Dashboard bootstrap usage bar with warning at 80%, banner at 100%: "Monthly bootstraps used. Upgrade or wait for next month's reset."  
**Machine (MCP-level):** `{ error_code:"bootstrap_cap_reached", human_message:"Monthly bootstrap limit reached.", next_action:"Upgrade plan or wait for monthly reset.", remediation_url:"https://parametric-memory.dev/dashboard" }`  
**Recovery CTA:** "Upgrade plan"  
**Audit plan:** New. **Priority: P1**

---

### F-MCP-3 — Substrate in read_only, AI agent writes blocked
**Trigger:** Payment fails OR spend cap exceeded; substrate in `read_only`; write tools called via MCP.  
**Detection:** `substrate/routes.ts:272` (LIVE_FOR_HEALTH_STATUSES includes `read_only`).  
**Current behavior:** Assumes middleware enforces the write-block. See F-MCP-5 below — middleware does NOT enforce substrate-status read_only today. This entry's UX fix is blocked on F-MCP-5 landing first.  
**Machine (MCP-level):** `{ error_code:"substrate_read_only", human_message:"Writes blocked — substrate is in read-only mode because of a payment or spend-cap issue.", ai_message:"Write blocked: substrate read-only. Reads still work. Tell user to check billing at /dashboard.", next_action:"Update your payment method or raise spend cap.", remediation_url:"https://parametric-memory.dev/dashboard" }`  
**Audit plan:** New. Depends on F-MCP-5. **Priority: P1**

---

### F-MCP-5 — Substrate-status `read_only` NOT enforced at middleware (correctness bug)
**Trigger:** Substrate flipped to `status='read_only'` by spend-cap trigger, payment-fail webhook, or tier migration. An MCP write tool is called with a valid (non-revoked, non-expired) API key.  
**Detection:** `parametric-memory-compute/src/middleware/auth.ts:22–54` — the auth middleware sets `req.permissions` only from `KeyValidator.validateKey()` (`src/services/key-validator.ts`). Key validator checks `api_keys.revoked_at` / `expires_at` only. The `substrates.status` column is never consulted.  
**Current behavior:** A substrate in `read_only` status still accepts writes if the caller's API key itself is valid. Writes succeed. Data is persisted past the cap / past the failed payment. This is a correctness and revenue-integrity bug, not just UX.  
**Blast radius:** Every customer whose substrate is flipped to `read_only` by F-BILLING-2 (card fail) or F-BILLING-5 (spend cap). On launch this is theoretically zero but becomes non-zero the first day a customer's card expires.  
**Required fix:** In `createAuthMiddleware`, after `validateKey`, resolve the substrate row for this key and check `substrate.status`. If status is `read_only` (or anything other than `running`), downgrade `req.permissions` to `'read_only'` and set `req.substrateStatusReason` (e.g., `spend_cap_exceeded`, `payment_failed`, `migrating`). The `requireWritePermission` guard then rejects with the canonical envelope including `ai_message` — the generic "Write permission required. Your API key may be expired or revoked." goes away entirely.  
**Performance:** lookup adds one indexed query per request. Add a 30-second in-process TTL cache keyed by `api_key_hash` to keep it sub-millisecond in the hot path.  
**Machine:** Uses the F-MCP-3 envelope with `error_code` selected from `substrate_read_only_payment_failed`, `substrate_read_only_spend_cap`, `substrate_read_only_migrating` — so the AI client and dashboard can branch remediation.  
**Test:** Testcontainers integration — (a) valid key + substrate `running` → write succeeds; (b) valid key + substrate `read_only` (reason=`spend_cap_exceeded`) → 403 with `error_code:substrate_read_only_spend_cap` and `ai_message` present; (c) revoked key + substrate `running` → existing key-based 403 path preserved; (d) cache hit path — same key twice in <30s issues only one DB query.  
**Audit plan:** New — surfaced by founder Q3 follow-through. **Priority: P0 (correctness + revenue integrity)**

---

### F-MCP-4 — Tool invocation timeout / upstream 502
**Trigger:** MCP tool call times out; substrate container slow or compute 502.  
**Detection:** `substrate/routes.ts:1291` (`AbortSignal.timeout(5_000)`); MCP tool path behavior unverified.  
**Machine (MCP-level):** `{ error_code:"tool_timeout", human_message:"Tool invocation timed out.", next_action:"Retry. If persistent, contact support." }`  
**Audit plan:** New. **Priority: P2**

---

## DASHBOARD / NETWORK

### F-DASH-1 — Substrate list SSR fails silently (returns empty array)
**Trigger:** `getSubstrates()` in `dashboard/page.tsx:52–63` returns `[]` silently on any non-2xx or thrown error.  
**Detection:** `mmpm-website/src/app/dashboard/page.tsx:58, 62`  
**Current behavior:** Dashboard renders with empty substrate list. No error state visible.  
**Human UI:** Pass `fetchError:true` to `DashboardClient`; render inline: "Could not load your substrates. Please refresh."  
**Recovery CTA:** "Refresh"  
**Audit plan:** New. **Priority: P1**

---

### F-DASH-2 — Substrate poll silently stops on network error
**Trigger:** 10-second poll throws; `DashboardClient.tsx:560` bare `catch {}`.  
**Detection:** `mmpm-website/src/app/dashboard/DashboardClient.tsx:560`  
**Current behavior:** Status badges go stale; no user indication.  
**Human UI:** After 3 consecutive failures: warning banner "Live status updates paused. [Refresh]"  
**Audit plan:** New. **Priority: P2**

---

### F-NET-1 — compute-proxy 502 HTML page (nginx → JSON conversion)
**Trigger:** Express down; nginx returns HTML 502; old code forwarded HTML to client.  
**Detection:** M-0A fix in `mmpm-website/src/lib/compute-proxy.ts`; regression test at `api/capacity/route.test.ts:113`  
**Current behavior:** `computeProxy` now converts HTML 502 to structured JSON 502 — fixed. But client components don't all check for 502 and render a message.  
**Human UI:** Any proxy consumer should map 502 to: "Service temporarily unavailable. Please try again."  
**Machine:** `{ error_code:"upstream_unavailable", human_message:"Service temporarily unavailable.", next_action:"Try again in a few minutes." }`  
**Audit plan:** New (M-0A resolved root; client-side handling incomplete). **Priority: P1**

---

### F-NET-2 — User goes offline mid-session
**Trigger:** Browser loses internet; fetches throw `TypeError: Failed to fetch`.  
**Current behavior:** Each component shows its own "Network error" message. No global offline indicator.  
**Human UI:** `window.addEventListener('offline')` → global banner: "You're offline. Some features won't work until your connection returns." Auto-dismiss on `online` event.  
**Audit plan:** New. **Priority: P2**

---

## SILENT CATCHES — code scan findings

These `catch {}` blocks in website API routes have unverified response shapes and may silently return non-JSON or unstructured 500s:

| File | Line | Impact |
|------|------|--------|
| `src/app/api/signup/route.ts` | 23 | Signup proxy — every new signup |
| `src/app/api/checkout/route.ts` | 27 | Checkout proxy — checkout users |
| `src/app/api/billing/upgrade/route.ts` | 37 | Upgrade flow |
| `src/app/api/billing/portal/route.ts` | 27 | Billing portal |
| `src/app/api/billing/substrate-checkout/route.ts` | 30 | Substrate checkout |
| `src/app/api/memory/[...path]/route.ts` | 66 | Memory proxy |
| `src/app/api/compute/[...path]/route.ts` | 51 | Generic compute proxy |

**Fix pattern for all:** replace bare `catch` with `return NextResponse.json({ error_code:'proxy_error', human_message:'Request failed unexpectedly. Please try again.' }, { status:500 })`.  
**Priority: P1 for signup/checkout; P2 for billing/memory proxies.**

---

## Summary Matrix

| ID | Category | Blast Radius | Priority | Audit Ref |
|----|----------|-------------|----------|-----------|
| F-SIGNUP-1 | Signup | Every new signup | P0 | F-1 to F-4 |
| F-SIGNUP-2 | Signup | All signups (env misconfigured) | P0 | New |
| F-SIGNUP-3 | Signup | All signups at tier capacity | P0 | F-5 to F-8 |
| F-SIGNUP-5 | Signup | Every checkout abandoner (DB orphan blocks retry) | P0 | New |
| F-BILLING-1 | Billing | Checkout abandonment (cancel page UX) | P0 | New |
| F-BILLING-2 | Billing | Paying customers (card fail) | P0 | New |
| F-BILLING-3 | Billing | Webhook delay | P0 | Audit gap 2 |
| F-BILLING-5 | Billing | Spend-cap customers (auto-flip + AI path) | P0 (was P1) | New |
| F-PROV-1 | Provisioning | Provision failure users | P0 | New |
| F-MCP-1 | MCP Runtime | Live AI agents | P0 | New |
| F-MCP-5 | MCP Runtime | Correctness: read_only not enforced at middleware | P0 | New |
| F-DASH-3 pending_payment label | Dashboard | pending_payment users | P0 | Audit gap 2 |
| F-SIGNUP-4 | Signup | Returning users / slug collision | P1 | Batch |
| F-AUTH-1 | Auth | Expired link users | P1 | New |
| F-AUTH-2 | Auth | All signins (Resend down) | P1 | New |
| F-AUTH-3 | Auth | Magic link users (compute down) | P1 | New |
| F-BILLING-4 | Billing | Billing portal users | P1 | F-14 |
| F-BILLING-5 | Billing | Cap-exceeded customers | P1 | New |
| F-BILLING-6 | Billing | Checkout validation paths | P1 | Batch |
| F-CAP-1 | Capacity | Pricing page (compute down) | P1 | F-9, F-10 |
| F-CAP-2 | Capacity | CTA click (compute down) | P1 | F-11 |
| F-CAP-3 | Capacity | Waitlist form | P1 | F-13 |
| F-PROV-2 | Provisioning | Every new paid customer | P1 | New |
| F-KEY-1 | Key lifecycle | Key rotation users | P1 | New |
| F-KEY-2 | Key lifecycle | Key rotation users | P1 | New |
| F-KEY-3 | Key lifecycle | Claim link users | P1 | New |
| F-MCP-2 | MCP Runtime | Heavy users | P1 | New |
| F-MCP-3 | MCP Runtime | Payment-lapsed AI agents | P1 | New |
| F-DASH-1 | Dashboard | All users (compute down) | P1 | New |
| F-NET-1 | Network | All proxy endpoints | P1 | New |
| Silent catches | Multiple | Signup/checkout/billing | P1 | New |
| F-AUTH-4 | Auth | Aggressive retryers | P2 | New |
| F-PROV-3 | Provisioning | All running substrates | P2 | New |
| F-MCP-4 | MCP Runtime | Slow substrates | P2 | New |
| F-DASH-2 | Dashboard | Mid-session users | P2 | New |
| F-NET-2 | Network | Offline users | P2 | New |

---

## Copy Style Guide

1. Say what happened, not the technical cause. "Our service is temporarily unavailable." not "Error 503."
2. Always include one imperative next action. "Please try again." not nothing.
3. Never blame the user. "That email doesn't look right." not "You entered an invalid email."
4. Be specific about which action failed. "We couldn't save your waitlist entry." not "Something went wrong."
5. Match urgency to impact: `toast.error` for blockers; warning banner for degraded state; `toast.info` for progress.
6. For time-bounded states, name the timeline. "Usually ready in 2 minutes." not "Please wait."
7. Never expose raw error codes, SQL text, or stack traces in UI copy. `error_code` is machine-only; `human_message` is user-facing.
8. For irreversible actions (key rotation, plan cancel), confirm consequences before the action, not just after failure.

**Before/after examples:**

| Before | After |
|--------|-------|
| "Error 503: upstream unavailable." | "Our service is temporarily unavailable. Try again in a few minutes." |
| "Something went wrong." | "We couldn't save your waitlist entry. Please check your connection and try again." |
| "pending_payment" (raw string badge) | "Payment Processing" (amber badge with tooltip) |

---

## Tooltip Strategy

**Preventative (before failure):**
1. Pricing CTA when tier is full — explain why disabled, show waitlist.
2. "Rotate key" button — explain 5-location chain, cache clear requirement, 2–3 min duration.
3. "Claim Key" button — "Can only be claimed once. Store it in a password manager."
4. MCP endpoint field — "Your AI can only connect when substrate status is 'Running'."
5. Trial pricing — "Card is charged on day 15. Cancel anytime in the billing portal."
6. Bootstrap usage bar at 80%+ — "Approaching your monthly limit. Upgrade to avoid interruptions."

**Reactive (when state is bad):**
7. `read_only` badge — explain payment failure, link to billing portal.
8. `provision_failed` badge — "This is our fault. Support is the fastest path."
9. `pending_payment` badge — "Payment received — activating your substrate."
10. Usage "unavailable" — "Your substrate is still running. Stats refresh every 5 minutes."

---

## Canonical Error Response Shape

Every error envelope returned by compute API routes AND MCP tool responses MUST carry the same shape. This is the contract for humans (rendered directly in UI) and for AI clients (parsed and relayed into an LLM context window). Founder decision 2026-04-19: `ai_message` is mandatory alongside `human_message` — the same error must communicate to both audiences with no ambiguity.

```typescript
interface ApiError {
  error_code: string;        // snake_case, stable across versions — never change once shipped
  human_message: string;     // plain English, safe to render directly in UI
  ai_message: string;        // short, action-prescriptive, low-token — for AI client context windows
  next_action: string;       // imperative sentence — what to do now
  remediation_url?: string;  // absolute or root-relative deep-link to fix it
  detail?: string;           // internal context — OMIT in production for security-sensitive errors
}
```

**Why `ai_message` is a separate field, not a reuse of `human_message`:**
- An MCP client feeds the message back into an LLM. Every token costs money and latency.
- `human_message` favours gentleness and context ("Your monthly spend cap has been reached..."). `ai_message` favours action prescription ("Write blocked: spend_cap_exceeded. Substrate is read-only. Tell user to raise cap or wait.").
- Vague AI-facing messages lead to the AI making up its own guesses about what went wrong — which turns into support tickets.

**Example payloads:**

```json
{ "error_code": "checkout_url_missing", "human_message": "Account created but checkout link unavailable.", "ai_message": "Signup succeeded but checkoutUrl was absent from response. User must retry signup or visit /pricing.", "next_action": "Retry signup or visit /pricing.", "remediation_url": "/pricing" }

{ "error_code": "substrate_cap_exceeded", "human_message": "All slots for this tier are currently full.", "ai_message": "Tier at capacity. User should join the waitlist at /pricing.", "next_action": "Join the waitlist.", "remediation_url": "/pricing" }

{ "error_code": "substrate_read_only", "human_message": "Writes blocked — substrate is in read-only mode because of a payment or spend-cap issue.", "ai_message": "Write blocked: substrate read-only. Reads still work. Tell user to check billing at /dashboard.", "next_action": "Update payment method or raise spend cap.", "remediation_url": "https://parametric-memory.dev/dashboard" }

{ "error_code": "substrate_not_ready", "human_message": "Substrate is not running yet. Status: provisioning.", "ai_message": "Substrate provisioning, not ready. User should wait ~2 minutes.", "next_action": "Wait for provisioning — usually 2 minutes.", "remediation_url": "https://parametric-memory.dev/dashboard" }
```

---

## Toast Taxonomy

| Type | When | Duration | Dismissal |
|------|------|----------|-----------|
| `toast.error` | Blocking failure | Persist | Manual only |
| `toast.warning` | Degraded / ambiguous state | 8s | Auto + manual |
| `toast.success` | Completed irreversible action | 4s | Auto |
| `toast.info` | Background progress | 5s | Auto |

**Rules:** Max 1 error toast at a time; deduplicate by `error_code`. Never toast for poll failures — use banners for sustained degradation. Error toasts must include a CTA when a recovery action exists: `toast.error('...', { action: { label:'Try again', onClick: retry } })`.

---

## Machine-Readable Addendum — AI Agent Error Handling

`error_code` values are designed to be parseable by AI clients calling MMPM tools:

1. All values are stable snake_case identifiers — never rename once shipped. AI client prompts can include: "If you receive `error_code: substrate_not_ready`, tell the user to check their dashboard."
2. `next_action` is an imperative sentence the AI can relay verbatim to the user.
3. `remediation_url` is always absolute or root-relative — AI clients can surface it as a clickable link.
4. MCP tool responses must include all four fields. HTTP status alone is insufficient.
5. `detail` is stripped in production for security-sensitive paths (auth, key operations). AI clients must not rely on it.
6. Retryable errors: `substrate_not_ready`, `bootstrap_cap_reached`, `substrate_read_only`, `tool_timeout`. All others require user action before retry.

---

## Founder Decisions (resolved 2026-04-19)

1. **`cancelUrl` target:** Confirmed — signup uses `/signup?checkout=cancelled` (good). Dashboard upgrade uses `/dashboard?checkout=cancelled` (good). Default fallback at `app.ts:369` is `/billing/cancel` which is dead — kill or repoint. Fix scoped in F-BILLING-1.
2. **Resume-checkout URL:** No. Abandon = restart. DB orphans must not block the restart. Fix scoped in F-SIGNUP-5 (reaper + signup-endpoint restart guard).
3. **`read_only` enforcement at mmpm-service:** Must enforce at service layer. Confirmed gap — `middleware/auth.ts` only checks key-based read_only; substrate-status read_only is not consulted today. This is a correctness + revenue-integrity bug, not just UX. Fix scoped in F-MCP-5 (new P0).
4. **Cap-hit response shape:** Canonical envelope with BOTH `human_message` and `ai_message` fields — mandatory. Every error returned by compute (API or MCP) must carry both. See the updated Canonical Error Response Shape section.
5. **spend_cap_exceeded → substrates.status:** Must auto-cascade inside the webhook handler. Fix scoped in F-BILLING-5 (upgraded to P0). The AI client consuming MMPM directly via MCP must receive the structured read-only error — handled by F-MCP-5 enforcement + F-BILLING-5 envelope.
