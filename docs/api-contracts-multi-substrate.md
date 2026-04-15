# MMPM Compute API Contracts — Multi-Substrate

> Generated 2026-04-13. Canonical reference for the website frontend.
> All endpoints proxy through Next.js API routes → mmpm-compute.

---

## Authentication

All session-authenticated endpoints require the `mmpm_session` cookie. The website proxy converts this to `Authorization: Bearer <token>` when forwarding to compute.

Internal endpoints require `X-Internal-Key` header (never used from browser).

---

## 1. Auth Endpoints

### POST /api/auth/request-link
**Auth:** None | **Rate limit:** 5/min IP + 3/hour email

Request:
```json
{ "email": "string" }
```
Response (200):
```json
{ "sent": true }
```

### GET /api/auth/verify?token=RAW_TOKEN
**Auth:** None | **Rate limit:** 5/min

Response (200):
```json
{ "sessionToken": "string", "account": { "id": "string", "email": "string" } }
```
Response with TOTP (200):
```json
{ "pendingToken": "string", "totpRequired": true }
```

### POST /api/auth/logout
**Auth:** Session

Response (200):
```json
{ "ok": true }
```

### GET /api/auth/me
**Auth:** Session

Response (200):
```json
{
  "id": "string",
  "email": "string",
  "name": "string | null",
  "tier": "string | null",
  "status": "string",
  "balanceCents": "number",
  "createdAt": "ISO 8601"
}
```

---

## 2. TOTP Endpoints

### GET /api/auth/totp/status
**Auth:** Session
```json
{ "enrolled": "boolean" }
```

### POST /api/auth/totp/enrol
**Auth:** Session
```json
{ "qrDataUrl": "string", "secret": "string", "backupCodes": ["string"] }
```

### POST /api/auth/totp/enrol/confirm
**Auth:** Session | **Body:** `{ "code": "string" }`
```json
{ "confirmed": true }
```

### DELETE /api/auth/totp/enrol
**Auth:** Session
```json
{ "disabled": true }
```

### POST /api/auth/totp/challenge
**Auth:** Pending token | **Body:** `{ "pendingToken": "string", "code": "string" }`
```json
{ "sessionToken": "string" }
```

### POST /api/auth/totp/recover
**Auth:** Pending token | **Body:** `{ "pendingToken": "string", "backupCode": "string" }`
```json
{ "sessionToken": "string" }
```

---

## 3. Signup

### POST /api/v1/signup
**Auth:** None | **Rate limit:** 5/min IP

Request:
```json
{ "email": "string", "name": "string (optional)" }
```
Response (201):
```json
{ "accountId": "string", "checkoutUrl": "string | null", "apiKey": "string" }
```

---

## 4. Multi-Substrate Endpoints (NEW — slug-scoped)

> These are the primary endpoints the website should use going forward.
> All return 404 `{ error: "substrate_not_found" }` for non-owned slugs (no existence leak).
> Rate limit: 60 req/min per account (shared across all slug routes).

### GET /api/v1/substrates
**Auth:** Session | **Purpose:** List all substrates for the authenticated account

Response (200):
```json
{
  "substrates": [
    {
      "id": "string (UUID)",
      "slug": "string",
      "tier": "string",
      "status": "string",
      "createdAt": "ISO 8601",
      "updatedAt": "ISO 8601"
    }
  ]
}
```
Sort order: status priority (running → provisioning → read_only → suspended → others), then `created_at DESC`.

### GET /api/v1/substrates/:slug
**Auth:** Session | **Purpose:** Full details for a single substrate

Response (200):
```json
{
  "substrate": {
    "id": "string (UUID)",
    "slug": "string",
    "tier": "string",
    "status": "string",
    "createdAt": "ISO 8601",
    "updatedAt": "ISO 8601"
  }
}
```

### POST /api/v1/substrates/:slug/cancel
**Auth:** Session | **Purpose:** Schedule cancellation at period end

Response (200):
```json
{ "scheduled": true, "cancelAt": "ISO 8601 | null" }
```
Errors: 404 (not found/owned), 404 (no_active_subscription), 503 (stripe_not_configured)

### POST /api/v1/substrates/:slug/reactivate
**Auth:** Session | **Purpose:** Undo pending cancellation

Response (200):
```json
{ "reactivated": true }
```
Errors: 404 (not found/owned), 409 (substrate_not_reactivatable — terminal statuses), 404 (no_active_subscription), 503

### POST /api/v1/substrates/:slug/rotate-key
**Auth:** Session | **Purpose:** Start async key rotation job

Response (202):
```json
{ "jobId": "string", "status": "pending" }
```
Errors: 404, 409 (rotation_not_available), 429 (rate_limited)

### POST /api/v1/substrates/:slug/claim-key
**Auth:** Session | **Purpose:** Claim one-time API key after provisioning

Response — key available (200):
```json
{
  "claimed": true,
  "substrateId": "string",
  "slug": "string",
  "apiKeyPrefix": "string | null",
  "apiKey": "string",
  "warning": "Store this key securely — it will not be shown again."
}
```
Response — already claimed (200):
```json
{
  "claimed": false,
  "message": "API key has already been claimed or is not currently available."
}
```

### GET /api/v1/substrates/:slug/key-rotation/status
**Auth:** Session | **Purpose:** Poll key rotation job progress

Response — no rotation (200):
```json
{ "status": "none" }
```
Response — job exists (200):
```json
{
  "jobId": "string",
  "status": "string",
  "errorMessage": "string | null (sanitised)",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

### POST /api/v1/substrates/:slug/deprovision
**Auth:** Session | **Purpose:** Tear down substrate infrastructure

Response (200):
```json
{
  "status": "deprovisioned",
  "slug": "string",
  "message": "Substrate is being torn down. Your data will be retained for 30 days."
}
```
Errors: 404, 409 (substrate_not_deprovisionable / already terminal), 403 (active_subscription — cancel first)

### GET /api/v1/substrates/:slug/usage
**Auth:** Session | **Purpose:** Live usage metrics from substrate health endpoint

Response (200):
```json
{
  "slug": "string",
  "tier": "string",
  "status": "string",
  "atomsUsed": "number | null",
  "atomsLimit": "number (-1 = unlimited)",
  "bootstrapsUsed": "number | null",
  "bootstrapsLimit": "number (-1 = unlimited)",
  "usageUnavailable": "boolean"
}
```

---

## 5. Billing Endpoints

### GET /api/v1/billing/status
**Auth:** Session | **Optional query:** `?slug=<substrate_slug>`

Without slug: account-wide billing. With slug: substrate-scoped billing.

Response (200):
```json
{
  "tier": "string",
  "status": "active | trialing | past_due | suspended | cancelled",
  "renewsAt": "ISO 8601 | null",
  "trialEndsAt": "ISO 8601 | null",
  "lastPaymentFailed": "boolean",
  "hasStripeCustomer": "boolean",
  "usageUnavailable": "boolean",
  "tierDisplay": {
    "name": "string",
    "atomsUsed": "number",
    "atomsLimit": "number",
    "bootstrapsUsed": "number",
    "bootstrapsLimit": "number"
  }
}
```

### POST /api/v1/billing/substrate-checkout
**Auth:** Session | **Purpose:** Create Stripe checkout for a new substrate subscription

Request:
```json
{ "accountId": "string", "tier": "string (indie|pro|team)" }
```
Response (200):
```json
{
  "sessionId": "string",
  "sessionUrl": "string (Stripe Checkout URL)",
  "tier": "string",
  "amountCents": "number",
  "limits": { "maxAtoms": "number", "maxBootstrapsPerMonth": "number" }
}
```

### POST /api/v1/billing/portal
**Auth:** Session | **Purpose:** Generate Stripe customer portal URL

Response (200):
```json
{ "portalUrl": "string" }
```
Errors: 422 (no_billing_account — no Stripe customer yet)

### POST /api/checkout
**Auth:** Session | **Purpose:** Legacy browser checkout (derives accountId from session)

Response (200):
```json
{ "sessionUrl": "string" }
```

---

## 6. Legacy Endpoints (DEPRECATED — migrate away)

> These resolve substrate implicitly via "newest substrate for account".
> Website should migrate all calls to slug-scoped equivalents above.

| Legacy Endpoint | Replacement |
|---|---|
| GET /api/v1/my-substrate | GET /api/v1/substrates/:slug |
| POST /api/v1/my-substrate/cancel | POST /api/v1/substrates/:slug/cancel |
| POST /api/v1/my-substrate/reactivate | POST /api/v1/substrates/:slug/reactivate |
| POST /api/v1/my-substrate/deprovision | POST /api/v1/substrates/:slug/deprovision |
| POST /api/v1/my-substrate/claim-key | POST /api/v1/substrates/:slug/claim-key |
| POST /api/v1/my-substrate/rotate-key | POST /api/v1/substrates/:slug/rotate-key |
| GET /api/v1/my-substrate/rotate-key | GET /api/v1/substrates/:slug/key-rotation/status |

---

## 7. Capacity Endpoints (Public)

### GET /api/v1/capacity
**Auth:** None | **Rate limit:** 120/min | **Cache:** 60s

Response (200):
```json
{
  "tiers": {
    "<tier>": { "available": "boolean", "remaining": "number | null" }
  },
  "updatedAt": "ISO 8601"
}
```

### POST /api/v1/capacity/waitlist
**Auth:** None | **Rate limit:** 5/min

Request:
```json
{ "email": "string", "tier": "string" }
```
Response (200):
```json
{ "joined": true }
```

---

## 8. Internal/Infrastructure Endpoints (not used by website)

| Endpoint | Auth | Purpose |
|---|---|---|
| POST /api/v1/provision | Internal Key | Enqueue substrate provisioning |
| DELETE /api/v1/provision/:slug | Internal Key | Enqueue deprovision |
| GET /api/v1/substrate/:slug | Internal Key | Substrate status + health |
| GET /api/v1/fleet | Internal Key | Fleet overview |
| POST /api/v1/webhooks/substrate-stripe | Stripe Signature | Subscription lifecycle webhook |
| GET /api/billing/balance/:accountId | API Key | Account balance/burn rate |
| GET /api/billing/events/:accountId | API Key | Billing event log |
| POST/GET/PUT/DELETE /api/billing/caps/* | API Key | Spend cap management |
| POST /api/auth/sudo | Session | Issue sudo token |
| DELETE /api/account | Session + Sudo | Soft-delete account |

---

## 9. Website Proxy Mapping (Current → Required)

### Proxies to CREATE (new slug-scoped routes)

| Website Route | Compute Target | Method |
|---|---|---|
| /api/substrates | /api/v1/substrates | GET |
| /api/substrates/[slug] | /api/v1/substrates/:slug | GET |
| /api/substrates/[slug]/cancel | /api/v1/substrates/:slug/cancel | POST |
| /api/substrates/[slug]/reactivate | /api/v1/substrates/:slug/reactivate | POST |
| /api/substrates/[slug]/rotate-key | /api/v1/substrates/:slug/rotate-key | POST |
| /api/substrates/[slug]/claim-key | /api/v1/substrates/:slug/claim-key | POST |
| /api/substrates/[slug]/key-rotation/status | /api/v1/substrates/:slug/key-rotation/status | GET |
| /api/substrates/[slug]/deprovision | /api/v1/substrates/:slug/deprovision | POST |
| /api/substrates/[slug]/usage | /api/v1/substrates/:slug/usage | GET |
| /api/billing/status?slug=X | /api/v1/billing/status?slug=X | GET |
| /api/billing/substrate-checkout | /api/v1/billing/substrate-checkout | POST |

### Proxies to DEPRECATE (keep working for backward compat)

| Website Route | Status |
|---|---|
| /api/my-substrate/* | Legacy — remove after dashboard/admin refactor |
| /api/compute/instances/* | Legacy — replaced by substrates routes |
