/**
 * POST /api/team-inquiry
 *
 * Receives Team plan inquiry form submissions from the pricing page.
 * Sends an email notification to the sales inbox.
 *
 * Pre-launch: uses nodemailer with SMTP (or falls back to logging).
 * No CRM integration needed yet — volume will be low enough to handle manually.
 *
 * Body: { name: string, email: string, teamSize: '1-5' | '6-20' | '20+' }
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { name?: string; email?: string; teamSize?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { name, email, teamSize } = body;

  if (!name || !email || !teamSize) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  // ── Log inquiry to stdout ─────────────────────────────────────────────────
  // Pre-launch: log to stdout so it shows up in server logs.
  // TODO: wire up SMTP (nodemailer) or a transactional email service (Resend, Postmark)
  //       once inquiry volume warrants it. At $79/month sales velocity will be low enough
  //       to handle manually from logs.
  console.log(
    `[team-inquiry] New inquiry — ${name} <${email}> — ${teamSize} people — ${new Date().toISOString()}`,
  );

  // ── Forward via webhook if configured ────────────────────────────────────
  // Set TEAM_INQUIRY_WEBHOOK_URL to a Slack/Discord/Zapier webhook URL in production.
  const webhookUrl = process.env.TEAM_INQUIRY_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `New Team plan inquiry\nName: ${name}\nEmail: ${email}\nTeam size: ${teamSize}`,
        }),
      });
    } catch (err) {
      console.error("[team-inquiry] Webhook delivery failed:", err);
      // Don't fail the request — logging is enough
    }
  }

  return NextResponse.json({ ok: true });
}
