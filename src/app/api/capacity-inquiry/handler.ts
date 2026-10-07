/**
 * Shared capacity-inquiry handler.
 *
 * Used by both:
 *   - POST /api/capacity-inquiry          (the canonical endpoint)
 *   - POST /api/team-inquiry              (deprecated shim, kept 30 days for back-compat)
 *
 * Encapsulates validation, structured logging, email to support@ (via Resend),
 * and optional webhook forwarding.
 * Routes map the `HandlerResult` to an HTTP response — keeping that concern
 * in the route keeps the handler decoupled from `NextResponse`, which makes
 * it trivial to unit test directly.
 */
import { Resend } from "resend";

import { SUPPORT_EMAIL, TRANSACTIONAL_FROM } from "@/config/site";
import { isValidTierId, type TierId } from "@/config/tiers";
import { toHeaderValue } from "@/lib/email";
import { makeFixedWindowLimiter } from "@/lib/rate-limit";

export interface CapacityInquiryPayload {
  name: string;
  email: string;
  tier: TierId;
  message: string;
}

export type HandlerResult =
  | { ok: true }
  | { ok: false; status: 400; error: "missing_fields" | "invalid_tier" | "invalid_email" };

/**
 * Minimal email format sanity check. Not a full RFC 5322 parse — the goal is
 * to reject obvious bad input ("", "foo", "foo@") without blocking legitimate
 * addresses with plus-addressing, subdomains, etc.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Email abuse limits ──────────────────────────────────────────────────────
// The email only ever goes to OUR inbox (never a caller-supplied address), so
// the risk is someone flooding support@ / burning Resend quota. Both limits
// suppress the EMAIL only — the request still succeeds and stdout still logs
// every inquiry, so nothing is lost. Applies to the deprecated
// /api/team-inquiry shim too, since it delegates here.
const enquirerLimited = makeFixedWindowLimiter({ windowMs: 10 * 60_000, max: 1 });
const globalLimited = makeFixedWindowLimiter({ windowMs: 60 * 60_000, max: 30 });

/**
 * Email the inquiry to support@ with replyTo = the enquirer, so Reply in
 * Proton goes straight to them. Never throws; never fails the request.
 */
async function emailInquiry(p: CapacityInquiryPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[capacity-inquiry] RESEND_API_KEY not set — inquiry logged but not emailed");
    return;
  }
  if (enquirerLimited(p.email.toLowerCase()) || globalLimited("all")) {
    console.warn(`[capacity-inquiry] Email suppressed by rate limit — enquirer=${p.email}`);
    return;
  }
  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: TRANSACTIONAL_FROM,
      to: [SUPPORT_EMAIL],
      replyTo: p.email,
      subject: toHeaderValue(`[Capacity inquiry] ${p.tier} — ${p.name}`),
      text: [
        "New capacity inquiry from parametric-memory.dev",
        "",
        `Tier:    ${p.tier}`,
        `Name:    ${p.name}`,
        `Email:   ${p.email}`,
        `Time:    ${new Date().toISOString()}`,
        "",
        "Message:",
        p.message,
        "",
        "— Reply to this email to answer the enquirer directly.",
      ].join("\n"),
    });
    // Resend v3+ resolves { error } rather than throwing on API failures.
    if (error) console.error("[capacity-inquiry] Email not sent:", error);
  } catch (err) {
    console.error("[capacity-inquiry] Email delivery threw:", err);
  }
}

export async function handleCapacityInquiry(raw: {
  name?: string;
  email?: string;
  tier?: string;
  message?: string;
}): Promise<HandlerResult> {
  const { name, email, tier, message } = raw;

  if (!name || !email || !tier || !message) {
    return { ok: false, status: 400, error: "missing_fields" };
  }
  if (!isValidTierId(tier)) {
    return { ok: false, status: 400, error: "invalid_tier" };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, status: 400, error: "invalid_email" };
  }

  // ── Structured log to stdout (audit trail — kept even when email works) ───
  console.log(
    `[capacity-inquiry] New inquiry — tier=${tier} — ${name} <${email}> — ${new Date().toISOString()}`,
  );
  console.log(`[capacity-inquiry] Message: ${message}`);

  // ── Email support@ (best-effort) ──────────────────────────────────────────
  await emailInquiry({ name, email, tier, message });

  // ── Forward via webhook if configured ─────────────────────────────────────
  // Prefer the new env var; fall back to the old one so operator config does
  // not have to change on day of deploy.
  const webhookUrl =
    process.env.CAPACITY_INQUIRY_WEBHOOK_URL ?? process.env.TEAM_INQUIRY_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `New capacity inquiry (${tier})\nName: ${name}\nEmail: ${email}\nMessage: ${message}`,
        }),
      });
    } catch (err) {
      // Don't fail the request — stdout log is the source of truth.
      console.error("[capacity-inquiry] Webhook delivery failed:", err);
    }
  }

  return { ok: true };
}
