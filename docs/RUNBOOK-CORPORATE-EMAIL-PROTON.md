# Runbook — Corporate Email on parametric-memory.dev (Proton)

Living document. Started 2026-10-07. Update the **Status** table and the
**Decision log** as each step lands — this file is the source of truth for how
mail on the domain is wired, and `src/email-runbook.test.ts` fails if the
website starts using an address this runbook doesn't list. `docs/` is
gitignored, so this file and that check exist only on Glen's Mac — run
`npx vitest run src/email-runbook.test.ts` locally (CI skips it).

---

## Status

| # | Step | Owner | Status | Date | Notes |
|---|---|---|---|---|---|
| 0 | Inventory addresses the site promises | Claude | ✅ Done | 2026-10-07 | See [Address inventory](#address-inventory) |
| 1 | Choose provider + plan | Glen | ✅ Done | 2026-10-07 | Proton Mail Plus, 12-month |
| 2 | Sign up + pay for Proton Mail Plus | Glen | ✅ Done | 2026-10-07 | Account `entityone22@pm.me`; plan shows 15 GB / 1 domain |
| 3 | Add domain in Proton (Settings → Domain names) | Claude | ✅ Done | 2026-10-07 | Added via browser; MX/SPF/DKIM/DMARC tabs locked until verified |
| 4 | Identify domain host / DNS provider | Claude | ✅ Done | 2026-10-07 | **DigitalOcean DNS** (ns1–3.digitalocean.com) |
| 5 | Snapshot existing DNS records (before any change) | Claude | ✅ Done | 2026-10-07 | Public lookup via dns.google; see snapshot |
| 6 | Add verification TXT → verify in Proton | Claude | ✅ Done | 2026-10-07 | Proton: "Domain verified". DMARC tab already green from existing record |
| 7 | Add MX records | Glen | 🔄 In progress | 2026-10-07 | Both added. ⚠️ `mailsec` entered at priority 10 — must be **20**. Claude's DNS edits blocked by safety check after step 6 |
| 8 | Add SPF | Glen | ✅ Done | 2026-10-07 | Verified live via dns.google; only one SPF on root |
| 9 | Add 3 DKIM CNAMEs | Glen | ✅ Done | 2026-10-07 | All 3 verified live via dns.google |
| 10 | **Edit** existing DMARC (`p=none`) to add `rua` | Claude | ⏳ Pending | | A DMARC record already exists — edit it, never add a second |
| 11 | Create `glen@` + aliases, enable catch-all | Claude | ✅ Done | 2026-10-07 | 6 addresses active; catch-all → `glen@`. Glen entered password once at first create. `glen@` set as **default** sending address |
| 12 | Test inbound + outbound + spam placement | Claude + Glen | ⏳ Pending | | See [Verification](#verification) |
| 13 | Swap site off personal Gmail → `support@` (with tests) | Claude | 🔄 Code done, not deployed | 2026-10-08 | See [Website sending](#website-sending-resend). Deploy only after step 12 passes |
| 14 | Deploy site change | Glen | ⏳ Pending | | Via normal CI/CD |
| 15 | Tighten DMARC to `p=quarantine` | Claude | ⏳ Pending | | ~2 weeks after step 10, if reports are clean |

Legend: ✅ Done · ⏳ Pending · 🔄 In progress · ⚠️ Blocked

---

## Quick reference

| Item | Value |
|---|---|
| Domain | `parametric-memory.dev` |
| Domain host / DNS provider | **DigitalOcean** — Networking → Domains → parametric-memory.dev (registrar may differ; DNS is DO) |
| Mailbox provider | Proton (Switzerland) |
| Plan | Mail Plus, 12-month billing |
| Primary mailbox | `glen@parametric-memory.dev` — default sending address (display name "Glen — Parametric Memory") |
| Proton account | `entityone22@pm.me` (counts as 1 of the 10 addresses) |
| Transactional sender (site) | Resend, `noreply@send.parametric-memory.dev` — **separate system, unchanged** |
| Billing owner | Glen (Claude never enters payment details) |

---

## How mail on the domain is split

Two independent systems, on different DNS names, so they cannot collide:

```
parametric-memory.dev            → Proton    (people: receive + send, inbox)
send.parametric-memory.dev       → Resend    (website: send-only, waitlist mail)
```

- **Proton** owns the root domain's MX, SPF, DKIM (`protonmail*._domainkey`) and DMARC.
- **Resend** owns everything under `send.` and any `resend._domainkey` record.
  This runbook never edits those.

---

## Website sending (Resend)

Decided 2026-10-08: **Resend keeps sending all automated mail; Proton is for
people.** Proton isn't designed for app-sent mail, and Resend's DNS is already
live on `send.` + `resend._domainkey`.

| Sender | Mail | From | To | Reply-To |
|---|---|---|---|---|
| `src/app/api/waitlist/route.ts` | Signup alert | `TRANSACTIONAL_FROM` | `support@` | the signer |
| `src/app/api/waitlist/route.ts` | Signup confirmation | `TRANSACTIONAL_FROM` | the signer | `support@` |
| `src/app/api/capacity-inquiry/handler.ts` | Capacity / enterprise inquiry | `TRANSACTIONAL_FROM` | `support@` | the enquirer |
| mmpm-compute `src/services/resend-email-provider.ts` | Magic links, TOTP notices, billing/balance warnings, waitlist notices | `noreply@parametric-memory.dev` | user | `support@` |
| mmpm-compute `notification-service.ts` | Capacity alerts (ops) | `noreply@parametric-memory.dev` | `ADMIN_EMAIL` env, default `glen@` | `support@` |

`TRANSACTIONAL_FROM` = `Parametric Memory <noreply@send.parametric-memory.dev>`
(`src/config/site.ts`). That subdomain has **no inbox** — its MX is Amazon
SES's bounce handler — so every send must set `replyTo`.

Changes made 2026-10-08 (all with tests):
- `SUPPORT_EMAIL` → `support@`; new `LEGAL_EMAIL` (copyright/DMCA page, LICENSE, README).
- `public/llms.txt` regenerated; `.well-known/actions.json` contact → `support@`; `package.json` author → `glen@`.
- Waitlist: `replyTo` on both mails; signer address HTML-escaped; Resend `{ error }` results now checked (previously ignored — the route reported success even when nothing sent).
- Capacity inquiries: now emailed to `support@` (previously stdout/webhook only); CSRF check on `/api/capacity-inquiry`; email rate limits (1 per enquirer / 10 min, 30 / hour total — request still succeeds and is still logged).
- Removed dead `CONTACT_EMAIL` env var (docker-compose default, `.env.example`, Lighthouse CI). **Glen:** also delete it from `.env.local` / `.env.prod` / the droplet's env when convenient — nothing reads it.
- Guard: `src/no-personal-email.test.ts` fails if a consumer mailbox appears in `src/`, `public/`, `scripts/`, `content/`, `.github/`, LICENSE, README, package.json, docker-compose or `.env.example`.

mmpm-compute changes 2026-10-08 (uncommitted, branch `stripe`):
- One shared adapter `createResendEmailProvider()` replaces the copy-pasted
  ones in `server.ts` and `capacity-worker.ts`; adds `replyTo: support@`.
  A test fails if anything else calls `resend.emails.send` or hard-codes the sender.
- Capacity-alert default recipient `entityone22@gmail.com` → `glen@`.
  **Glen:** if the droplet sets `ADMIN_EMAIL`, update it there too.
- LICENSE licensing contact → `legal@`; `package.json` author → `glen@`.
- Left alone on purpose: `E2E_TEST_EMAIL` / `DEV_LOGIN_EMAIL` / `scripts/reset-account.ts`
  default — those are Glen's real login account, not published addresses.
- Sender kept as root `noreply@` (website uses `noreply@send.`): both pass
  SPF/DKIM/DMARC via Resend; unifying would change the From on sign-in links.

**Open issue — customer data in a public file.**
`public/demo-snapshots/mmpm-research-snap.json` (served publicly; downloadable
from `/verify`) is a Merkle-sealed substrate export containing a real
customer's email + Stripe subscription facts, the founder's Gmail, internal
droplet IPs and env-var names. It can't be hand-edited without breaking its
proofs; regenerate it from a scrubbed substrate (or remove it), then drop its
entry from `KNOWN_EXCEPTIONS` in `src/no-personal-email.test.ts`.

---

## Address inventory

Every `@parametric-memory.dev` address the repo uses. Audited 2026-10-07.
`src/email-runbook.test.ts` checks that every address in `src/`, `public/`
and `content/` appears in this table — add a row here when you add one there.

| Address | Type in Proton | Where it's used | Why it must work |
|---|---|---|---|
| `glen@parametric-memory.dev` | Primary mailbox | — (personal) | Your day-to-day address |
| `support@parametric-memory.dev` | Alias | Terms, admin tier-change copy, provisioning-failed banner; becomes `SUPPORT_EMAIL` at step 13 | Customer contact |
| `privacy@parametric-memory.dev` | Alias | Privacy policy, Terms | Legal commitment (privacy requests) |
| `legal@parametric-memory.dev` | Alias | Terms, DPA, Acceptable Use Policy | Legal commitment (notices) |
| `abuse@parametric-memory.dev` | Alias | Acceptable Use Policy | Abuse reports |
| `postmaster@parametric-memory.dev` | Alias | — | Expected by mail standards (RFC 5321) |
| `hello@parametric-memory.dev` | Catch-all | Mentioned in `src/config/site.ts` comment | General enquiries |
| `licensing@parametric-memory.dev` | Catch-all | Internal marketing memo only | Future licensing enquiries |
| `dmarc@parametric-memory.dev` | Catch-all | DMARC `rua` reports (step 10) | Receives DMARC reports |
| `ci@parametric-memory.dev` | None | `.github/workflows/lighthouse.yml` dummy `CONTACT_EMAIL` | Not a real inbox; CI placeholder |
| `noreply@send.parametric-memory.dev` | None (Resend) | `src/app/api/waitlist/route.ts` | Send-only, handled by Resend |

**Address budget.** Mail Plus allows 10 addresses. The signup addresses
(`entityone22@pm.me` default + `entityone22@proton.me`) use 1 slot between them.
As built 2026-10-07: 6 domain addresses created, **4 of 10 slots still free**.
Original plan: Plan: 1 proton.me + `glen@` + 5 aliases
(`support`, `privacy`, `legal`, `abuse`, `postmaster`) = 7 used, 3 spare.
`hello@`, `licensing@` and `dmarc@` arrive via **catch-all** so they don't
consume slots. Promote one to a real alias only if you need to *send* from it.

### Personal Gmail currently exposed publicly (fixed at step 13)

| File | What |
|---|---|
| `src/config/site.ts` | `SUPPORT_EMAIL = "entityone22@gmail.com"` — drives most mailto links + JSON-LD |
| `public/llms.txt` | `Contact` line |
| `public/.well-known/actions.json` | `contact` field |
| `.env*` (server-side, not public) | `CONTACT_EMAIL` — where waitlist notifications go; optional to change |

---

## Plan choice

Chosen 2026-10-07: **Proton Mail Plus, 12-month** — ~US$3.99/mo (~US$48/yr);
checkout shows NZD. 30-day money-back guarantee.

| Plan | USD/mo (annual) | Custom domains | Addresses | Storage |
|---|---|---|---|---|
| **Mail Plus** ← chosen | 3.99 | 1 | 10 | 15 GB |
| Mail Essentials (business) | 6.99 / user | — | — | 15 GB |
| Unlimited | 9.99 | 3 | 15 | 500 GB |

Market context at decision time: plain business email ≈ US$1–3/mailbox/mo
(Zoho, Namecheap, Spacemail); suites ≈ US$7–8 (Google Workspace, Microsoft 365).
Proton costs more than budget hosts; chosen for privacy and jurisdiction.

**Known trade-offs**
- Mail Plus is marketed as a personal plan — fine for a solo founder. On first hire, move to Mail Essentials / Workspace.
- Desktop mail apps (Apple Mail) need **Proton Mail Bridge** running on the Mac. Web + mobile apps work without it.
- Data stored in Switzerland (strong privacy law, still offshore from NZ).
- Check the renewal price on the invoice — promos can renew higher.

---

## Procedure

### Step 2–3 — Proton signup and add domain (Glen)

1. Go to `https://proton.me/mail/pricing` → **Mail Plus** → **12 months** → pay.
2. In Proton: **Settings → All settings → Domain names → Add domain** → `parametric-memory.dev`.
3. Leave that wizard open on the **DNS records** screen. Proton generates values
   specific to this domain (verification code, DKIM targets) — copy them from
   there, never from this document.

### Step 5 — Snapshot DNS before changing anything (Claude)

In the domain host's DNS panel, record every existing record into the
[DNS snapshot](#dns-snapshot-before-changes) section below. This is the
rollback plan — if anything breaks, we put these back exactly.

### Steps 6–10 — DNS records to add

Names are relative to `parametric-memory.dev` (`@` = the root). Values marked
**from Proton** must be copied from Proton's wizard.

| Step | Type | Name | Value | Priority | Purpose |
|---|---|---|---|---|---|
| 6 | TXT | `@` | `protonmail-verification=e715bb7be305fb4512e0b255408c383c4f3df385` | — | Proves you own the domain — keep forever |
| 7 | MX | `@` | `mail.protonmail.ch` | 10 | Deliver mail to Proton |
| 7 | MX | `@` | `mailsec.protonmail.ch` | 20 | Backup delivery |
| 8 | TXT | `@` | `v=spf1 include:_spf.protonmail.ch ~all` | — | Who may send as the domain |
| 9 | CNAME | `protonmail._domainkey` | `protonmail.domainkey.drjfo35zwk5du6by4beb3cq5fjzl3wvipsthwxamikajfpbh3byiq.domains.proton.ch.` | — | DKIM signing key 1 |
| 9 | CNAME | `protonmail2._domainkey` | `protonmail2.domainkey.drjfo35zwk5du6by4beb3cq5fjzl3wvipsthwxamikajfpbh3byiq.domains.proton.ch.` | — | DKIM signing key 2 |
| 9 | CNAME | `protonmail3._domainkey` | `protonmail3.domainkey.drjfo35zwk5du6by4beb3cq5fjzl3wvipsthwxamikajfpbh3byiq.domains.proton.ch.` | — | DKIM signing key 3 |
| 10 | TXT (edit existing) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@parametric-memory.dev` | — | Monitor-only policy + reports |

**Rules while editing DNS**
- **One SPF record only.** If a `v=spf1` TXT already exists on `@`, merge the
  `include:` into it — never add a second. Two SPF records = SPF fails for all mail.
- **Do not touch** any record whose name contains `send` or `resend`
  (Resend / website mail), or the `A`/`AAAA`/`CNAME` records for `@` and `www`
  (the website itself).
- If old MX records exist (e.g. a host's default forwarding), remove them only
  after Glen confirms — mail splits unpredictably between providers otherwise.
- Show Glen each record before saving.
- DNS changes can take minutes to a few hours to propagate.

### Step 11 — Addresses (Claude, in Proton)

> **No forwarding needed.** Every address on one Proton account delivers to
> the same inbox — `support@`, `privacy@` etc. already land alongside `glen@`.
> Replies go out from whichever address the mail was sent to. To see which
> alias a message came in on, look at the "To" line (or add a filter/label per
> address under Settings → Filters).
>
> **Gotcha seen during setup:** the Add-address domain dropdown sometimes
> stays on `@proton.me`. Always confirm it reads `@parametric-memory.dev`
> before clicking Save.

1. **Settings → Identity and addresses → Create address** → `glen@`, then
   `support@`, `privacy@`, `legal@`, `abuse@`, `postmaster@`.
2. **Settings → Domain names → parametric-memory.dev → Catch-all** → send to `glen@`.
3. Set display name, e.g. "Glen — Parametric Memory"; `support@` as "Parametric Memory Support".

### Step 13 — Website change (Claude, then Glen deploys)

- `src/config/site.ts`: `SUPPORT_EMAIL` → `support@parametric-memory.dev`.
- `public/llms.txt` and `public/.well-known/actions.json` → same.
- Add a test: no personal Gmail address in `src/` or `public/` output.
- Run the full test suite; Glen deploys via normal CI/CD.

---

## Verification

**Inbound (step 12).** From Gmail, send one email to each of `glen@`,
`support@`, `privacy@`, `legal@`, `abuse@`, plus one to `hello@` (tests
catch-all). All six should land in the Proton inbox.

**Outbound.** From Proton as `support@`, send to the Gmail account. In Gmail:
**⋮ → Show original** and confirm `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`,
and that it landed in the inbox, not spam.

**DNS check from your Mac** (optional, confirms what the world sees).
- *Where:* Terminal on your Mac.
- *Why:* asks public DNS what records exist, independent of any dashboard.
- *Safe?* Yes — read-only lookups; changes nothing.

```bash
dig +short MX parametric-memory.dev
dig +short TXT parametric-memory.dev
dig +short TXT _dmarc.parametric-memory.dev
dig +short CNAME protonmail._domainkey.parametric-memory.dev
```

Expected: the two Proton MX hosts; exactly one `v=spf1` line; the DMARC line;
a Proton DKIM target.

**Website still sends.** Submit the waitlist form once after the DNS changes —
the Resend confirmation must still arrive (proves `send.` was untouched).

---

## Rollback

- **Mail not arriving at Proton:** check MX first; compare against the snapshot.
- **Full undo:** delete the records added in steps 6–10 and restore anything
  removed, exactly as recorded in the snapshot. Website + Resend are
  unaffected either way because their records are never edited.
- **Refund:** Proton offers 30 days money-back.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Proton says domain not verified | Verification TXT not propagated or typo | Wait 15–60 min; re-check value |
| Outbound lands in spam | DKIM not yet active / SPF missing | Check Proton's domain page shows all green |
| `SPF: PERMERROR` | Two SPF records on `@` | Merge into one |
| Waitlist confirmation stopped | A `send`/`resend` record was changed | Restore from snapshot |
| Apple Mail can't connect | Proton Mail Bridge not running | Open Bridge; use the credentials it shows |

---

## DNS snapshot (before changes)

_Captured 2026-10-07 from public DNS (dns.google). Do not edit after changes begin._
_Not captured: `www` and any other subdomains — read the full list in the DO panel before editing._

```
NS   parametric-memory.dev                  ns1/ns2/ns3.digitalocean.com      (TTL 1800)
A    parametric-memory.dev                  170.64.238.232  (web droplet)     (TTL 3600)
MX   parametric-memory.dev                  (none)
TXT  parametric-memory.dev                  "google-site-verification=lvxCdzJAQjLGRHMT7I-yiRYu-u0pdALcxtI4ZapTQfs"  KEEP
TXT  parametric-memory.dev                  (no SPF record)
TXT  _dmarc.parametric-memory.dev           "v=DMARC1; p=none;"               (TTL 3600)  → EDIT at step 10
MX   send.parametric-memory.dev             10 feedback-smtp.us-east-1.amazonses.com  (Resend) DO NOT TOUCH
TXT  send.parametric-memory.dev             "v=spf1 include:amazonses.com ~all"       (Resend) DO NOT TOUCH
TXT  resend._domainkey.parametric-memory.dev "p=MIGfMA0GCSqGSIb3…IDAQAB"              (Resend DKIM) DO NOT TOUCH
```

Implications:
- No root MX → no mail reaches the domain today; adding Proton MX can't break existing inbound.
- No root SPF → step 8 *adds* one (nothing to merge).
- DMARC exists → step 10 *edits* it.
- Resend's DKIM is on the root (`resend._domainkey`), its SPF/MX on `send.` — leave all three alone.

---

## Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-10-07 | Paid mailbox, not forwarding to Gmail | Separate corporate inbox |
| 2026-10-07 | Proton Mail Plus, 12-month | Privacy/jurisdiction; 1 domain + catch-all covers needs |
| 2026-10-07 | One mailbox + aliases + catch-all | Pay for one seat; fits the 10-address cap |
| 2026-10-07 | DMARC starts at `p=none` | Monitor before enforcing; avoid blocking legit mail |
| 2026-10-07 | Swap `SUPPORT_EMAIL` only after inbound tested | Never point customers at an unverified inbox |
| 2026-10-07 | DNS edits in DigitalOcean, not the registrar | Nameservers point to DO; registrar DNS panel would be ignored |
| 2026-10-07 | Remaining DNS records entered by Glen, not Claude | Claude's browser DNS edits were stopped by a safety check after the verification TXT; values in this runbook were read from Proton's wizard |
