# Parametric Memory — Legal Compliance Sprint Plan
**Created:** 5 April 2026
**Jurisdiction:** New Zealand (primary) · GDPR · CCPA · AU Privacy Act · EU AI Act

---

## What's Already Done (This Session)

| Deliverable | Status | URL |
|-------------|--------|-----|
| Privacy Policy | ✅ Live in codebase | `/privacy` |
| Terms of Service | ✅ Live in codebase | `/terms` |
| Acceptable Use Policy | ✅ Live in codebase | `/aup` |
| Data Processing Agreement | ✅ Live in codebase | `/dpa` |
| `MMPM_COMPUTE_URL` → prod (`memory.kiwi`) | ✅ Done | `docker-compose.yml` + `.env.local` |

---

## Critical Jurisdiction Note

A NZ-sole jurisdiction clause **is NOT enforceable** against EU, UK, US, or Australian consumers — those jurisdictions have mandatory laws that override contract terms. The documents implement a **bifurcated approach**:

- **B2B/commercial customers** → NZ courts, UNCITRAL arbitration in Auckland (enforceable)
- **Consumer customers** → NZ law governs, but home-country courts retain jurisdiction as required by mandatory local law (legally sound and enforceable)

This is the correct and enforceable approach, validated by EU Unfair Terms Directive, UK Consumer Rights Act 2015, CCPA/CPRA, and Australian Consumer Law research.

---

## Sprint 1 — DEPLOY & WIRE UP (Priority: BLOCKER, ~2 days)

Everything needed before accepting any new paid customers.

### 1.1 Deploy Legal Pages to Production
- [ ] Run `cicd-web-deploy` to ship the four new legal pages to parametric-memory.dev
- [ ] Verify all four routes resolve: `/terms`, `/privacy`, `/aup`, `/dpa`
- [ ] Verify mobile rendering of tables and disclaimer boxes

### 1.2 Add Legal Links to Site Footer & Navbar
- [ ] Add `/terms`, `/privacy`, `/aup` to site footer
- [ ] Add `/privacy` link to the `SiteNavbar` component
- [ ] Ensure links are visible without scrolling on mobile

### 1.3 Signup Clickwrap — CRITICAL
The signup page already has:
```tsx
<p>By continuing you agree to our Terms and Privacy Policy.</p>
```
This is **not sufficient** — it needs to be a checkbox, not passive text.

**Required change to `/src/app/signup/page.tsx`:**
```tsx
// Add before the submit button:
<label className="flex items-start gap-3">
  <input
    type="checkbox"
    required
    className="mt-0.5 h-4 w-4 rounded border-white/20"
  />
  <span className="text-xs text-white/50">
    I agree to the{' '}
    <Link href="/terms" className="text-white/70 underline">Terms of Service</Link>
    {' '}and{' '}
    <Link href="/privacy" className="text-white/70 underline">Privacy Policy</Link>,
    including the AI memory accuracy disclaimers.
  </span>
</label>
```
- [ ] Implement clickwrap checkbox on signup form (required, cannot submit without)
- [ ] Log consent timestamp server-side (store `agreed_to_terms_at` in the DB)

### 1.4 Checkout / Pricing Page Billing Disclosures
The pricing page must display before payment:
- [ ] Add visible recurring charge disclosure: "Billed monthly. Renews automatically. Cancel anytime."
- [ ] Add cancellation terms: "Cancel in dashboard settings. Data retained 30 days after cancellation."
- [ ] Add refund policy: "Full refund within 7 days of first purchase."
- [ ] Link to `/terms#5` (Payment section) from pricing page

### 1.5 Add Legal Pages to Sitemap
- [ ] Add `/terms`, `/privacy`, `/aup`, `/dpa` to `sitemap.ts`

---

## Sprint 2 — DATA RIGHTS DASHBOARD (Priority: HIGH, ~1 week)

Required under GDPR Art. 15-22, CCPA, NZ Privacy Act 2020, and Australian APPs.

### 2.1 "Your Data" Page (`/dashboard/your-data` or `/privacy/my-data`)
A self-service portal showing users what data Parametric Memory holds about them.

**Must include:**
- [ ] Account info section: email, account creation date, plan, substrate slug
- [ ] Memory atom count and storage usage (link to visualiser)
- [ ] Sub-processor list with links: Stripe, DigitalOcean, Resend
- [ ] Data export button: generates and downloads JSON of all account data + atom metadata
- [ ] Data deletion button: initiates deletion flow with 30-day confirmation window
- [ ] Link to `/privacy` for full policy

**API endpoints needed:**
- [ ] `GET /api/my-data/export` — returns JSON bundle of all user data
- [ ] `POST /api/my-data/delete-request` — initiates deletion, sends confirmation email

### 2.2 Account Deletion Flow
- [ ] Add "Delete Account" button in dashboard settings (currently missing)
- [ ] Implement 2-step confirmation: "Type DELETE to confirm"
- [ ] Send confirmation email: "Your deletion request has been received. Your data will be removed within 30 days."
- [ ] Backend: soft-delete immediately, hard-delete from backups within 90 days
- [ ] Log deletion timestamp for compliance audit trail

### 2.3 DSAR (Data Subject Access Request) Email Handler
- [ ] Set up `privacy@parametric-memory.dev` inbox (or alias to your main email)
- [ ] Create email template for acknowledging DSAR within 5 days
- [ ] Create internal process doc: how to fulfill DSAR within 20 days (NZ), 30 days (GDPR), 45 days (CCPA)

---

## Sprint 3 — COOKIE CONSENT (Priority: LOW — RESOLVED)

PostHog has been removed. The site now uses only essential cookies (`mmpm_session`, `mmpm_redirect`).
No analytics or tracking cookies are set, so no cookie consent banner is required under GDPR/ePrivacy.
This sprint is effectively complete.

---

## Sprint 4 — EU AI ACT TRANSPARENCY (Priority: MEDIUM, Deadline: August 2026)

Required under EU AI Act Articles 13 & 50, effective August 2, 2026.

### 4.1 AI Transparency Disclosure in UI
- [ ] Add persistent disclosure banner in the dashboard/substrate viewer:
  > "Memory outputs are AI-generated using probabilistic reconstruction (Markov-Merkle). Outputs may be inaccurate, inferred, or incomplete. Verify critical outputs independently."
- [ ] Add "ⓘ AI-generated" badge on atom retrieval results

### 4.2 Technical Documentation Page
- [ ] Create `/docs/ai-transparency` page covering:
  - Intended purpose of MMPM
  - How Markov-Merkle reconstruction works (plain language)
  - Known limitations (accuracy, hallucination risk, inference bias)
  - What MMPM is NOT designed for (medical, legal, financial decisions)
  - How downstream deployers should disclose MMPM to their end users (template text provided)

### 4.3 Deployer Disclosure Template
For enterprise/API customers who embed MMPM in their own products:
- [ ] Add to DPA and docs: template disclosure text they can use with their users
  > "This service uses Parametric Memory for persistent AI context retention. Memory outputs are AI-reconstructed and subject to probabilistic inaccuracy. See [Parametric Memory Privacy & Limitations] for details."

### 4.4 Consider EU Representative Appointment
- [ ] Research cost and process for appointing an EU Article 27 GDPR representative (required if you have significant EU users but no EU establishment)
- [ ] Consider a service like DataRep or similar (~€500/year)
- [ ] If EU customers are significant, this is mandatory under GDPR Art. 27

---

## Sprint 5 — LEGAL REVIEW (Priority: HIGH, ~1 week, external)

This should happen in parallel with Sprint 2-3.

### 5.1 Engage NZ/UK SaaS Lawyer
- [ ] Engage a New Zealand-based tech/SaaS lawyer to review:
  - Privacy Policy (ensure NZ Privacy Act 2020 IPP compliance)
  - Terms of Service (consumer guarantee carve-outs, FTA compliance)
  - DPA (GDPR Article 28 compliance, SCCs)
- [ ] Budget: NZ$3,000–8,000 for document review package
- [ ] Recommended: Buddle Findlay, Minter Ellison, or a boutique tech law firm in Auckland

### 5.2 Register Legal Entity Properly
- [ ] Confirm "Parametric Memory Limited" is properly registered with Companies Office NZ
- [ ] Ensure registered address is current
- [ ] Add registered address to all legal documents (currently `[NZ REGISTERED ADDRESS]` placeholder)

### 5.3 Set Up Legal Email Addresses
- [ ] `privacy@parametric-memory.dev` — privacy requests, DSAR
- [ ] `legal@parametric-memory.dev` — DPA executions, legal notices
- [ ] `abuse@parametric-memory.dev` — AUP violation reports
- [ ] `support@parametric-memory.dev` — general (may already exist)

---

## Sprint 6 — BILLING COMPLIANCE (Priority: MEDIUM, ~3 days)

### 6.1 Stripe Renewal Email Configuration
- [ ] Configure Stripe to send renewal reminder emails 7 days before each charge
- [ ] Renewal email must include: charge date, amount, plan name, cancellation link

### 6.2 Stripe Customer Portal
- [ ] Enable Stripe Customer Portal for self-service subscription management
- [ ] Link to portal from dashboard: "Manage Billing"
- [ ] Ensure cancellation is accessible within 2 clicks from dashboard

### 6.3 Invoice Access
- [ ] Verify users can access invoice history via Stripe portal or dashboard
- [ ] Add "Billing History" link in dashboard settings

---

## Sprint 7 — INCIDENT RESPONSE & AUDIT (Priority: LOW, ongoing)

### 7.1 Data Breach Response Plan
- [ ] Create internal incident response playbook:
  - Who to notify (Privacy Commissioner NZ: privacy.org.nz/report-a-concern/)
  - 72-hour notification timeline to customers
  - Evidence preservation procedure
  - Communication templates for affected users
- [ ] Store playbook in internal wiki/ops docs

### 7.2 Compliance Audit Trail
- [ ] Ensure `agreed_to_terms_at` timestamp is stored for all new signups (Sprint 1.3)
- [ ] Ensure DSAR/deletion requests are logged with timestamps
- [ ] Retain logs for 5 years (FTC/GDPR audit requirement)

### 7.3 Sub-processor Review (Annual)
- [ ] Schedule annual review of sub-processor list
- [ ] Verify DPAs are current for all sub-processors
- [ ] Update `/dpa` page if sub-processors change (30-day notice to customers required)

---

## Regulatory Deadline Calendar

| Deadline | Requirement | Risk (Non-Compliance) |
|----------|-------------|----------------------|
| **NOW (Blocker)** | Deploy legal pages, clickwrap signup | Unenforceable ToS; regulatory exposure |
| **Within 30 days** | Data rights dashboard, DSAR email setup | GDPR/CCPA enforcement risk |
| **Within 90 days** | Cookie consent banner, legal review | GDPR ePrivacy violation |
| **Within 6 months** | EU Representative appointment (if significant EU users) | GDPR Art. 27 violation |
| **August 2, 2026** | EU AI Act: AI transparency disclosure in UI, technical docs | Up to €15M or 4% revenue |
| **Annually** | Sub-processor review, privacy policy review, compliance audit | Regulatory drift |

---

## What You Do NOT Need (Clarifications)

- **HIPAA compliance** — Not needed unless you explicitly target healthcare customers. Don't market to health sector without a separate compliance review.
- **SOC 2 certification** — Not legally required; optional trust-builder for enterprise sales. ~$20-40K. Consider for Enterprise tier.
- **Separate UK Privacy Policy** — Not needed. NZ has UK adequacy; your bifurcated ToS covers UK consumers. One policy is fine.
- **Full GDPR DPA auto-execution at signup** — Your DPA page + "incorporated by reference" clause in ToS is legally sufficient for most B2B customers. Enterprise customers will want a signed copy — use the page as the template.

---

## Files Created This Session

| File | Purpose |
|------|---------|
| `src/app/privacy/page.tsx` | Privacy Policy — Next.js page |
| `src/app/terms/page.tsx` | Terms of Service — Next.js page |
| `src/app/aup/page.tsx` | Acceptable Use Policy — Next.js page |
| `src/app/dpa/page.tsx` | Data Processing Agreement — Next.js page |
| `docker-compose.yml` | Added `MMPM_COMPUTE_URL` env var pointing to `memory.kiwi` |
| `COMPLIANCE-SPRINT-PLAN.md` | This file |
