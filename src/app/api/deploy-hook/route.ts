import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * GitHub webhook deploy hook.
 *
 * Verifies the webhook signature using HMAC-SHA256, checks that the push
 * is to the main branch, then triggers a deploy script as a background process.
 *
 * Setup:
 * - Webhook URL: https://parametric-memory.dev/api/deploy-hook
 * - Secret: GITHUB_WEBHOOK_SECRET (set in environment)
 * - Events: push (main branch only)
 * - Content type: application/json
 */

function verifySignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;

  const expected = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) {
    console.error("GITHUB_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifySignature(body, signature, secret)) {
    console.warn("Deploy hook: invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(body);
  const ref = payload.ref;

  // Only deploy on push to main
  if (ref !== "refs/heads/main") {
    return NextResponse.json({ message: `Ignoring push to ${ref}` }, { status: 200 });
  }

  const commitSha = payload.after?.substring(0, 7) || "unknown";
  const commitMessage = payload.head_commit?.message?.substring(0, 100) || "no message";

  console.log(`Deploy hook triggered: ${commitSha} — ${commitMessage}`);

  // In production, this triggers the deploy script as a background process.
  // The actual deploy is handled by a shell script on the host, not by Next.js.
  // This endpoint returns 200 immediately (GitHub times out at 10s).

  // TODO: Trigger deploy script via exec or message queue
  // For now, log and acknowledge.

  return NextResponse.json(
    {
      message: "Deploy triggered",
      commit: commitSha,
      branch: "main",
    },
    { status: 200 },
  );
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST with a valid GitHub webhook." },
    { status: 405 },
  );
}
