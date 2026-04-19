/**
 * Shared capacity-inquiry handler.
 *
 * Used by both:
 *   - POST /api/capacity-inquiry          (the canonical endpoint)
 *   - POST /api/team-inquiry              (deprecated shim, kept 30 days for back-compat)
 *
 * Encapsulates validation, structured logging, and optional webhook forwarding.
 * Routes map the `HandlerResult` to an HTTP response — keeping that concern
 * in the route keeps the handler decoupled from `NextResponse`, which makes
 * it trivial to unit test directly.
 */
import { isValidTierId, type TierId } from "@/config/tiers";

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

  // ── Structured log to stdout (pre-launch email substitute) ────────────────
  console.log(
    `[capacity-inquiry] New inquiry — tier=${tier} — ${name} <${email}> — ${new Date().toISOString()}`,
  );
  console.log(`[capacity-inquiry] Message: ${message}`);

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
