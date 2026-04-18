# Silent-Block UX Audit + Fix Plan
**Scope:** MMPM SaaS pre-launch (2026-04-25). 7 days out. 1 production customer (smooth-harbor).
**Repos:** `mmpm-website` (Next.js 14 App Router) · `parametric-memory-compute` (Express API)

---

## 1. Governing Principle

**`v1.procedure.never_silent_block_user`** — every business-logic refusal must surface to BOTH channels:

- **Human channel:** UI toast (sonner), inline banner, or error paragraph — visible within 2 seconds of the failure.
- **Agent/machine channel:** structured JSON body on every 4xx/5xx — see error shape spec below.
- **Invariant:** `catch {}` that swallows errors, `redirect()` after a failed fetch with no explanation, and a 500 with a raw DB exception message are all policy violations.
- **Test gate:** every fix ships with a test asserting BOTH the response shape AND the UI feedback.

---

## 2. Error Response Shape Spec

### Canonical JSON (both repos must comply)

```ts
interface ApiError {
  error_code: string;          // machine-stable snake_case identifier
  human_message: string;       // plain-English sentence safe to show in UI
  next_action: string;         // what the user/agent should do next
  remediation_url?: string;    // optional deep-link (Stripe portal, pricing page, etc.)
  detail?: string;             // optional: internal context (omit in prod for security-sensitive errors)
}
```

**Rule:** every non-2xx response body must include at minimum `error_code` and `human_message`. Existing `{ error: string }` shape is a partial compliance — allowed only where `error` can be mapped 1:1 to a `human_message` in the client.

### Three concrete error_code values for known sites

| Site | `error_code` | `human_message` | `next_action` |
|---|---|---|---|
| L-1 checkout URL missing | `checkout_url_missing` | "Your account was created but we couldn't start the payment flow. Click below to go to checkout." | "Redirect to /pricing or retry POST /api/signup" |
| #22 starter cap DB trigger | `substrate_cap_exceeded` | "All Starter slots are currently full. Join the waitlist — you'll be first when space opens." | "POST /api/capacity/waitlist" |
| #23 tier-block at checkout | `tier_at_capacity` | "The {tier} tier is currently full. Join the waitlist or choose a different plan." | "POST /api/capacity/waitlist or navigate to /pricing" |

---

## 3. Known Silent-Block Sites + Fix List

### L-1 — Signup `checkoutUrl` silently discarded (CRITICAL — hits every new signup)

**Root cause:** `SignupResult` interface in `SignupClient.tsx` (lines 8–23) does not declare `checkoutUrl`. The compute API returns it at `src/api/signup/routes.ts:246` (`checkoutUrl: checkoutSession.url`). The website proxy at `src/app/api/signup/route.ts` passes the response through unchanged (`computeProxy` passthrough), so the field is present in the raw response — but `signupData` is typed as `SignupResult`, and TypeScript strips unknown fields at the cast boundary (`as SignupResult`). The field never reaches `CheckEmailView`. User is left in `pending_payment` with no link to pay.

**Secondary gap:** `SignupClient.tsx` fetches `/api/signup` (website-internal proxy), which proxies to `POST /api/v1/signup` (compute). The proxy doc-comment at line 14 (`Returns: { customerId, slug, tier, mcpEndpoint, apiKey, mcpConfig, limits, status }`) also omits `checkoutUrl` — stale doc silently led to the missed field.

**Fixes:**

| # | File | Change | Effort | Acceptance criteria |
|---|---|---|---|---|
| F-1 | `mmpm-website/src/app/signup/SignupClient.tsx` | Add `checkoutUrl?: string` to `SignupResult` interface (line 21). In `CheckEmailView`, if `signupData.checkoutUrl` is set and `status === 'pending_payment'`, render a prominent "Complete payment →" button that does `window.location.href = signupData.checkoutUrl`. | 30 min | User who signs up sees the Stripe checkout link immediately. |
| F-2 | `mmpm-website/src/app/signup/SignupClient.tsx` | If `signupRes.ok` but `signupData.checkoutUrl` is absent, surface `toast.error("Checkout link missing — please try again or contact support.")` and set error state. Do not silently proceed to the "check your email" view with no payment path. | 20 min | Test: mock `/api/signup` returning 201 without `checkoutUrl`; assert toast fires with `error_code: 'checkout_url_missing'`. |
| F-3 | `mmpm-website/src/app/api/signup/route.ts` | Update doc-comment (line 14) to include `checkoutUrl` in the `Returns:` list. | 5 min | Linting pass. |
| F-4 | `parametric-memory-compute/src/api/signup/routes.ts` | No compute change needed — it already returns `checkoutUrl`. Add an integration test asserting the field is present in the 201 response body. | 30 min | `checkoutUrl` starts with `https://checkout.stripe.com`. |

**Test required (F-2):** see Section 5.

---

### #22 — Starter cap preflight: DB trigger fires raw 500 (HIGH — fires when tier is full)

**Root cause:** `trg_enforce_substrate_cap` (migration `047_substrate-cap-and-spend-cap-triggers.sql`, updated in `065_substrate-cap-trigger-read-account-tier.sql`) fires `RAISE EXCEPTION 'SUBSTRATE_CAP: ...'` on `INSERT INTO substrates`. In `src/api/signup/routes.ts` (line 257–273), the catch block only handles `err.code === '23505'` (unique constraint). A trigger exception arrives with `err.code === 'P0001'` (PL/pgSQL RAISE EXCEPTION). It falls through to `throw err`, which becomes an Express 500 with a raw stack trace or generic error — no `error_code`, no `human_message`, no `next_action`. Same gap exists in `src/api/checkout/session-route.ts` for the session-checkout path.

**Fixes:**

| # | File | Change | Effort | Acceptance criteria |
|---|---|---|---|---|
| F-5 | `parametric-memory-compute/src/api/signup/routes.ts` (line 257) | In catch block, add: `if (err.code === 'P0001' && err.message?.includes('SUBSTRATE_CAP')) { res.status(409).json({ error_code: 'substrate_cap_exceeded', human_message: 'All slots for this tier are currently full. Join the waitlist.', next_action: 'POST /api/capacity/waitlist', remediation_url: '/pricing' }); return; }` — before the generic `throw err`. | 20 min | POST /api/v1/signup when substrate cap is at max returns 409 with `error_code: 'substrate_cap_exceeded'`. |
| F-6 | `parametric-memory-compute/src/api/checkout/session-route.ts` (around line 119 INSERT) | Same catch pattern around the substrate INSERT block. | 20 min | Same as F-5 but on the session-checkout path. |
| F-7 | `parametric-memory-compute/src/api/signup/routes.ts` | Add a **preflight SELECT** before the `INSERT INTO substrates` that counts active substrates and checks against `platform_settings`. Return a clean 409 with `error_code: 'substrate_cap_exceeded'` before the DB ever sees the INSERT. This replaces the trigger as the user-facing gate (trigger remains as a backstop). | 1 hr | 409 returned before Stripe customer is created (avoids orphan Stripe customers). |
| F-8 | `mmpm-website/src/app/signup/SignupClient.tsx` | In the `else` branch (non-ok, non-409, non-422), check `data.error_code === 'substrate_cap_exceeded'` and show a specific message: "This tier is currently full — join the waitlist." with a link to `/pricing`. | 20 min | User on signup page sees waitlist message, not "something went wrong". |

---

### #23 — Tier-block reason missing in checkout UI (MEDIUM — fires at tier capacity)

**Root cause:** `PricingCTA.tsx` (line 157–166): when `onCheckCapacity()` returns `status: 'waitlist' | 'paused'`, the component sets `blockedByCapacity = true` and renders `<WaitlistForm>`. This part works. The silent-block is in `PricingCardClient.tsx` line 90: `.catch(() => { /* Fail open — keep default "open" state */ })` — if the capacity check itself errors (network, 500 from compute), the user silently proceeds to checkout, which then fails at the Stripe session creation with a generic error. There is also no toast or banner telling the user WHY they hit the waitlist form if the capacity status arrives correctly — the `capacityMessage` string from compute is displayed in `WaitlistForm`, but it's optional and may be null, falling back to a generic sentence.

Additionally: `PricingCTA.tsx` line 163: `catch { /* Fail open — if capacity check errors, let them proceed to checkout. */ }` — silent swallow of capacity check error. Line 203: `catch { setError("Network error...") }` — this one is acceptable.

**Fixes:**

| # | File | Change | Effort | Acceptance criteria |
|---|---|---|---|---|
| F-9 | `parametric-memory-compute/src/api/capacity/routes.ts` (line 129) | When returning the 500 fallback, include: `{ error_code: 'capacity_unavailable', human_message: 'Availability check failed. Slots may be limited — try again.', next_action: 'retry GET /api/capacity' }`. | 15 min | 500 from capacity endpoint has `error_code`. |
| F-10 | `mmpm-website/src/app/pricing/PricingCardClient.tsx` (line 90) | Replace silent `.catch(() => {})` with `.catch((err) => { toast.error('Could not check availability. Please try again.'); console.warn('[capacity] mount fetch failed', err); })`. Import `toast` from `sonner`. | 20 min | Network failure on mount fetch shows toast, does not silently fail open without any signal. |
| F-11 | `mmpm-website/src/app/pricing/PricingCTA.tsx` (line 163) | Replace silent `catch {}` on capacity check with `catch { toast.error('Could not verify availability.'); setLoading(false); return; }`. Do not fail open silently — surface the ambiguity to the user. | 20 min | Capacity check failure on CTA click shows toast. |
| F-12 | `parametric-memory-compute/src/api/capacity/routes.ts` | Ensure `message` field in tier data is always populated when `status !== 'open'`. Current code returns `message: null` for many paths — the fallback in `PricingCTA` uses a generic string. Add a computed message server-side: `"The {tier} tier is currently full. Join the waitlist."` | 20 min | `GET /api/capacity` when tier is full returns non-null `message`. |

---

## 4. Sweep: Additional Silent-Block Sites Found

### Silent `catch {}` swallowing errors — non-admin client components

| File | Line | Context | Severity |
|---|---|---|---|
| `mmpm-website/src/app/dashboard/DashboardClient.tsx` | ~560 | Substrate poll interval: `catch { // Silently fail }` — user's substrate list stops updating; no indication. | Medium |
| `mmpm-website/src/app/dashboard/DashboardClient.tsx` | ~546 | `billing/status` fetch: `.catch(() => setBillingError(true))` — at least sets error state, but `billingError` only sets a flag; verify there's a visible error render. | Low |
| `mmpm-website/src/app/pricing/PricingCardClient.tsx` | 115 | Capacity check on CTA click: `catch { return capacity }` — see F-11 above. | High |
| `mmpm-website/src/app/pricing/WaitlistForm.tsx` | 37 | Waitlist POST failure: `catch {}` — if the waitlist POST fails, the user thinks they joined but didn't. | High |

**Fix for WaitlistForm:**

| # | File | Change | Effort | Acceptance criteria |
|---|---|---|---|---|
| F-13 | `mmpm-website/src/app/pricing/WaitlistForm.tsx` | Replace `catch {}` with `catch { toast.error('Could not save your details. Please try again.'); setSubmitting(false); }` | 15 min | Failed waitlist POST shows toast. |

### Dashboard `openBillingPortal` — no toast on missing `portalUrl`

`DashboardClient.tsx` line 76: if `data.portalUrl` is undefined on a 200 response, the function returns silently — user clicks "Manage billing" and nothing happens. Fix: add `toast.error('Could not open billing portal. Please try again.')` before the return.

| # | File | Change | Effort |
|---|---|---|---|
| F-14 | `mmpm-website/src/app/dashboard/DashboardClient.tsx` (~line 76) | Add `toast.error(...)` when `data.portalUrl` is absent on a 200 response. Also add `import { toast } from 'sonner'`. | 15 min |

### Compute routes missing structured error shape

Quick survey of endpoints that return raw `{ error: string }` without `error_code` or `human_message`:

| Route file | Status returned | Gap |
|---|---|---|
| `src/api/capacity/routes.ts` line 129 | 500 | Missing `error_code` — see F-9 |
| `src/api/checkout/session-route.ts` line 56 | 400 `{ error: 'tier is required' }` | Missing `error_code` |
| `src/api/checkout/session-route.ts` line 63 | 404 `{ error: 'Account not found' }` | Missing `error_code` |
| `src/api/checkout/session-route.ts` line 66 | 403 `{ error: 'Account is closed' }` | Missing `error_code` |
| `src/api/signup/routes.ts` line 261 | 409 `{ error: 'email_exists' }` | Missing `error_code` (partial — `error` value is machine-readable) |
| `src/api/signup/routes.ts` line 119 | 503 `{ error: 'Billing not configured...' }` | Missing `error_code` |

These can be batch-fixed with a shared error-shape helper function.

---

## 5. Grep Commands — Reproduce the Sweep

Paste these `rg` commands at repo root to reproduce the full sweep.

```sh
# Silent catch blocks (empty or comment-only body) — both repos
rg 'catch\s*\{(\s*//[^\n]*)?\s*\}' --type ts --type tsx -n

# .catch(() => {}) — anonymous swallowers
rg '\.catch\(\(\)\s*=>\s*\{[^}]*\}\)' --type ts --type tsx -n

# redirect/push after fetch with no error surface check
rg 'router\.push|window\.location\.href' --type tsx -n

# Routes returning 4xx/5xx without error_code field
rg 'res\.status\([45]\d\d\)\.json\(\{' --type ts -n

# Client fetch calls that don't reference error_code or human_message
rg 'await fetch\(' --type tsx -n | grep -v error_code

# checkoutUrl references (confirm coverage)
rg 'checkoutUrl' --type ts --type tsx -n

# SUBSTRATE_CAP / SPEND_CAP trigger exception strings (confirm catch coverage)
rg 'SUBSTRATE_CAP|SPEND_CAP|P0001' --type ts -n

# toast usage outside /admin — confirm sonner reach on primary funnel
rg 'from.*sonner|toast\.' --type tsx -n | grep -v admin
```

---

## 6. Test Template — vitest + React Testing Library + sonner

```tsx
// Example: tests/signup/checkout-url-missing.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, it, expect, beforeAll, afterAll } from 'vitest';
import { toast } from 'sonner';
import SignupClient from '@/app/signup/SignupClient';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  Toaster: () => null,
}));

beforeAll(() => {
  // Mock /api/signup returning 201 but missing checkoutUrl
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: true,
    status: 201,
    json: async () => ({
      customerId: 'acc_test',
      slug: 'test-abc123',
      tier: 'free',
      mcpEndpoint: 'https://test-abc123.mmpm.co.nz/mcp',
      apiKey: 'mmk_live_testkey',
      limits: { maxAtoms: 1000, maxBootstrapsPerMonth: 50, maxStorageMB: 100 },
      status: 'pending_payment',
      // checkoutUrl intentionally absent — this is the regression scenario
      mcpConfig: { mcpServers: {} },
    }),
  } as Response);
});

afterAll(() => {
  vi.restoreAllMocks();
});

it('shows error toast when checkoutUrl is missing from signup response', async () => {
  render(<SignupClient />);

  await userEvent.type(screen.getByLabelText(/email/i), 'user@example.com');
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(screen.getByRole('button', { name: /continue/i }));

  await waitFor(() => {
    // UI feedback: toast fired
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('checkout')
    );
  });
});

it('returns error_code in response body when checkoutUrl is missing', async () => {
  // Integration-level: test the compute route directly
  // (use supertest against the Express app in test mode)
  // This lives in parametric-memory-compute/tests/integration/signup-checkout-url.test.ts
  // Pseudocode pattern:
  //   const res = await request(app).post('/api/v1/signup').send({ email, agreedToTerms: true });
  //   expect(res.status).toBe(201);
  //   expect(res.body.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);
  //   // If checkoutUrl missing → assert 500 does NOT bubble (compute side must always return it)
});

// Example: capacity cap toast test
it('shows toast when capacity check fails on CTA click', async () => {
  global.fetch = vi.fn().mockRejectedValueOnce(new Error('network'));
  // render PricingCTA with onCheckCapacity wired to fetch...
  // click CTA button
  // assert: toast.error called with capacity-related message
  expect(toast.error).toHaveBeenCalled();
});
```

**Key imports for any new test:**
```ts
import { toast } from 'sonner';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() }, Toaster: () => null }));
```

---

## 7. Sequencing — 7 Days to Launch

**Priority order: blast radius first, edge case last.**

### Day 1–2 (ship before any more signups)
1. **F-1 + F-2** — `SignupClient.tsx`: add `checkoutUrl` to `SignupResult`, render "Complete payment" link, toast on missing URL. Every single new signup hits this. Smooth-harbor already got through but any next signup stalls here.
2. **F-3** — Update proxy doc-comment. 5 min. Do it with F-1/F-2.
3. **F-4** — Integration test asserting compute returns `checkoutUrl`. Prevents regression.

### Day 2–3
4. **F-7** — Preflight SELECT in signup route before substrate INSERT. Prevents orphan Stripe customers on cap-exceeded. Compute-side.
5. **F-5 + F-6** — Catch `P0001` / `SUBSTRATE_CAP` in signup + session-checkout routes. Return structured 409. Even if preflight is in place, trigger remains as backstop and its error must be handled.
6. **F-8** — Website: map `error_code: 'substrate_cap_exceeded'` to readable message on signup page.

### Day 3–4
7. **F-13** — WaitlistForm silent catch. High blast radius if capacity is open and someone joins the waitlist — they'd think they're on it when they're not.
8. **F-10 + F-11** — PricingCardClient + PricingCTA silent capacity-check swallows. Medium — fires only when capacity check itself fails (not when tier is full).
9. **F-9** — Compute capacity 500 shape. Pair with F-10.
10. **F-12** — Ensure `message` is always non-null when `status !== 'open'`. Compute-side.

### Day 4–5
11. **F-14** — Dashboard billing portal missing `portalUrl` silent return. Medium.
12. **Batch:** add `error_code` to checkout route 400/403/404 responses. Low user impact (unlikely paths at launch) but completes the spec.

### Day 5–7 (buffer)
- Write remaining tests for F-5, F-7, F-13.
- Run full `rg` sweep above and triage any new findings.
- Regression smoke test the signup → payment → provisioning flow end-to-end.

---

## 8. Out of Scope for This Audit

- **Internal admin-only 500s** — `src/app/admin/` routes: admin users have full visibility via the admin page; structured errors there are nice-to-have, not launch-blocking.
- **Dev-only routes** — `/api/deploy-hook`, `/api/docs-hook` — internal CI triggers, not user-facing.
- **Compute worker errors** — substrate provisioner failures (`src/workers/substrate-provisioner.ts`), cloud-init failures — these are async; the dashboard already polls and shows `provision_failed` status badge with a support link. Not a silent block.
- **Blog/docs 404s** — `src/app/blog/[slug]` and `src/app/docs/[...slug]` catch blocks swallow MDX render errors; acceptable — they fall through to the Next.js not-found page.
- **Stripe webhook handler errors** — `src/app/api/webhook/` — Stripe retries failed webhooks; user impact is latency on provisioning, not a silent UI block.
- **`pending_api_key` / key-rotation 401 debugging** — operational concern, not UX silent-block. Covered by the 5-location Token Chain doc in `CLAUDE.md`.

---

## Gaps Noticed During Audit

1. **`Toaster` is mounted in `layout.tsx`** (global root) — good. But `toast` from `sonner` is only imported in admin components (`ConfirmUpgradeDialog.tsx`, `ChangePlanSheet.tsx`). None of the primary funnel components (`SignupClient`, `PricingCTA`, `PricingCardClient`, `WaitlistForm`, `DashboardClient`) import `toast`. The infrastructure is there (sonner ^2.0.7, Toaster in layout) — just not wired to the funnel. Every fix in this plan that adds toast is a one-line import addition.

2. **`checkoutUrl` also absent from `pending_payment` substrate display in DashboardClient** — if a user somehow lands on the dashboard with `status: 'pending_payment'` (e.g. they closed the Stripe tab), there is no "resume payment" CTA visible. The `StatusBadge` renders "pending_payment" as an unlabelled fallback (no entry in the `labels` map). Low priority but worth a follow-up issue.

3. **Compute `session-checkout` route creates a substrate row before creating the Stripe session** (lines 119–137). If Stripe session creation fails after the INSERT, the substrate row is stranded in `pending_payment` with no checkout URL attached. No rollback on Stripe failure. Worth a TODO-tracked issue but not a silent-block UX problem (it won't block the next attempt).

4. **`WaitlistForm.tsx` does not import or use `toast`** — confirmed by `rg` sweep. The catch block is bare. Fix is F-13.
