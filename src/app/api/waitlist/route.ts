import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

/** Simple email validation */
const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }

    // 1. Notify us — internal waitlist notification
    await resend.emails.send({
      from: "Parametric Memory <noreply@send.parametric-memory.dev>",
      to: ["entityone22@gmail.com"],
      subject: `[Waitlist] New signup: ${email}`,
      text: [
        "New waitlist signup",
        "",
        `Email: ${email}`,
        `Time: ${new Date().toISOString()}`,
        "",
        "Parametric Memory waitlist",
      ].join("\n"),
    });

    // 2. Confirmation to the user
    await resend.emails.send({
      from: "Parametric Memory <noreply@send.parametric-memory.dev>",
      to: [email],
      subject: "You're on the Parametric Memory waitlist",
      html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>You're on the waitlist</title>
</head>
<body style="margin:0;padding:0;background:#020617;font-family:'Outfit',system-ui,sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;padding:48px 24px;">
    <tr><td>
      <!-- Header -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:40px;">
        <tr>
          <td>
            <div style="display:inline-flex;align-items:center;gap:12px;margin-bottom:32px;">
              <!-- Logomark SVG (inline, email-safe) -->
              <img
                src="https://parametric-memory.dev/logo.svg"
                alt="Parametric Memory"
                width="32" height="32"
                style="display:block"
              />
              <span style="font-size:16px;font-weight:600;color:#ffffff;letter-spacing:-0.02em;">
                Parametric Memory
              </span>
            </div>
            <h1 style="margin:0 0 8px;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.03em;line-height:1.2;">
              You&rsquo;re on the list.
            </h1>
            <p style="margin:0;font-size:16px;color:#36aaf5;font-weight:500;">
              Persistent, Verifiable Memory for AI
            </p>
          </td>
        </tr>
      </table>

      <!-- Body -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:32px;margin-bottom:24px;">
            <p style="margin:0 0 16px;font-size:15px;color:#94a3b8;line-height:1.7;">
              We received your signup for <strong style="color:#e2e8f0;">${email}</strong>.
              Early access to Parametric Memory is being rolled out in batches — you&rsquo;ll
              hear from us when your instance is ready.
            </p>
            <p style="margin:0;font-size:15px;color:#94a3b8;line-height:1.7;">
              In the meantime, you can explore the live demo and review the docs:
            </p>
          </td>
        </tr>
      </table>

      <!-- CTAs -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
        <tr>
          <td style="padding-right:8px;">
            <a
              href="https://parametric-memory.dev/visualise"
              style="display:block;background:#0c8ee6;color:#ffffff;text-decoration:none;text-align:center;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;"
            >
              Live Demo →
            </a>
          </td>
          <td style="padding-left:8px;">
            <a
              href="https://parametric-memory.dev/pricing"
              style="display:block;background:transparent;color:#e2e8f0;text-decoration:none;text-align:center;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;border:1px solid #1e293b;"
            >
              View Pricing
            </a>
          </td>
        </tr>
      </table>

      <!-- Specs -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;border-top:1px solid #1e293b;padding-top:24px;">
        <tr>
          <td style="padding:0 0 8px;">
            <span style="font-family:monospace;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#36aaf5;">
              What you&rsquo;re getting
            </span>
          </td>
        </tr>
        <tr>
          <td style="font-family:monospace;font-size:12px;color:#475569;line-height:1.8;">
            0.045ms p50 recall &nbsp;·&nbsp; RFC 6962 Merkle proofs &nbsp;·&nbsp; 64% Markov hit rate<br>
            25+ MCP tools &nbsp;·&nbsp; Dedicated instance &nbsp;·&nbsp; Docker + nginx + Let&rsquo;s Encrypt
          </td>
        </tr>
      </table>

      <!-- Footer -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:40px;">
        <tr>
          <td style="font-size:12px;color:#334155;line-height:1.6;">
            Parametric Memory &nbsp;·&nbsp; parametric-memory.dev<br>
            You&rsquo;re receiving this because you signed up at parametric-memory.dev.
          </td>
        </tr>
      </table>

    </td></tr>
  </table>
</body>
</html>`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[waitlist] Resend error:", err);
    return NextResponse.json(
      { error: "Failed to send confirmation. Please try again." },
      { status: 500 },
    );
  }
}
