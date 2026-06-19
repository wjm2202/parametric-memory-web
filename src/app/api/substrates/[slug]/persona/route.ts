/**
 * PATCH /api/substrates/:slug/persona  (R10 slice 6 — "name your substrate")
 *
 * Slug-scoped BFF proxying to compute's
 *   PATCH /api/v1/substrates/:slug/persona (createSetPersonaHandler).
 * Sets or clears the customer-chosen substrate display name. Send
 * `{ name: string }` to set, or `{ name: null }` / `{ name: "" }` to clear.
 * Compute trims, length-caps (<= 80), persists to substrates.persona_name, and
 * mirrors best-effort to the Stripe subscription metadata.
 *
 * CSRF: mutating route → Origin check via verifyCsrfOrigin (matches /cancel).
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { computeProxy, authHeaders } from "@/lib/compute-proxy";
import { verifyCsrfOrigin } from "@/lib/csrf";

const SESSION_COOKIE = "mmpm_session";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const csrfError = verifyCsrfOrigin(request);
  if (csrfError) return csrfError;

  const { slug } = await params;
  if (!slug) {
    return NextResponse.json({ error: "slug_required" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Forward the name. Accept a missing/invalid body as a clear (name: null),
  // letting compute's validator be the single source of truth on the value.
  let name: string | null = null;
  try {
    const parsed = await request.json();
    if (typeof parsed?.name === "string") name = parsed.name;
  } catch {
    // no/invalid body → clear
  }

  const { response } = await computeProxy(`api/v1/substrates/${encodeURIComponent(slug)}/persona`, {
    method: "PATCH",
    headers: authHeaders(sessionToken),
    body: { name },
    label: "substrates/persona",
    inbound: request,
  });

  return response;
}
