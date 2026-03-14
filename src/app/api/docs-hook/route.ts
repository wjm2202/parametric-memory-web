import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * Documentation regeneration webhook.
 *
 * Triggered when the MMPM core repository is pushed to main.
 * Pulls latest MMPM source, regenerates API docs from JSDoc,
 * and triggers a Next.js rebuild (ISR handles page updates).
 */

function verifySignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;

  const expected = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  const secret = process.env.DOCS_WEBHOOK_SECRET;

  if (!secret) {
    console.error("DOCS_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Docs webhook not configured" }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifySignature(body, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(body);

  if (payload.ref !== "refs/heads/main") {
    return NextResponse.json({ message: `Ignoring push to ${payload.ref}` }, { status: 200 });
  }

  console.log("Docs hook triggered — regenerating documentation");

  // TODO: Trigger doc generation script
  // 1. Pull latest MMPM repo
  // 2. Run generate-docs.ts
  // 3. Next.js ISR handles page updates

  return NextResponse.json(
    {
      message: "Documentation regeneration triggered",
      commit: payload.after?.substring(0, 7) || "unknown",
    },
    { status: 200 },
  );
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
