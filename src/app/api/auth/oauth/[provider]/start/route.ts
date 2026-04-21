/**
 * GET /api/auth/oauth/:provider/start  (ADR-003 Phase 2 OAuth, S2T6.4)
 *
 * Purpose
 * ───────
 * Entry point to an OAuth sign-in / account-link flow. Takes a provider
 * slug on the URL, optional `intent` + `returnTo` query params, and
 * either:
 *
 *   • 404s (flag off, unknown provider, or unconfigured provider)
 *   • 400s with a plain-text message (bad `intent` value)
 *   • 302s to the provider's authorize endpoint with a single-use
 *     state cookie attached (`mmpm_oauth_state`)
 *
 * This file is deliberately thin — EVERY rejection branch, credential
 * generation, store write, and cookie-attribute decision lives in
 * `src/lib/auth/oauth-start.ts`. This handler's only responsibilities
 * are:
 *
 *   1. Pull raw values out of Next.js's request / params / searchParams.
 *   2. Hand them to `startOauthFlow(…)` as plain data.
 *   3. Translate the returned discriminated result into real HTTP:
 *      `cookies().set(…)`, `redirect(…)`, `notFound()`, or `Response`.
 *
 * The split exists because the heavy lifting is pure decision logic and
 * is unit-testable (25 tests in oauth-start.test.ts) with no Next.js
 * runtime. This wrapper only needs a handful of smoke tests to prove
 * the bindings are wired up correctly — see route.test.ts next door.
 *
 * Next.js redirect() / notFound() semantics
 * ─────────────────────────────────────────
 * Both work by throwing `NEXT_REDIRECT` / `NEXT_NOT_FOUND` sentinels
 * that Next's renderer catches and translates to a response. If you
 * call either inside a `try/catch` the catch swallows the sentinel and
 * the redirect silently becomes a 500. The magic-link callback
 * documents this pitfall (src/app/auth/callback/route.ts:19–24) — we
 * don't need a try/catch here at all because `startOauthFlow` is
 * non-throwing by design, but the rule still applies: keep
 * `redirect()` / `notFound()` calls at the top level of the handler.
 *
 * Why GET, not POST
 * ─────────────────
 * A plain `<a href="/api/auth/oauth/google/start?intent=signin">` must
 * work — it's the whole UX affordance. CSRF is mitigated by the state
 * cookie + PKCE, not by a POST + token. Side effects per request are
 * tiny (one store.put of ~200 bytes) so GET idempotence is acceptable;
 * each call mints fresh state anyway. This matches RFC 6749 §4.1.1
 * "Authorization Request" which is always a redirect-following GET.
 */
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { config } from "@/config";
import { generateFlowCredentials, oauthFlowStore } from "@/lib/auth/pkce-store";
import { startOauthFlow } from "@/lib/auth/oauth-start";
import { registry } from "@/lib/auth/providers/registry";

/**
 * Handler for the start route. Extracting raw values is the only thing
 * this function does before delegating — that's the contract with
 * `oauth-start.ts`.
 *
 * @param request  — used ONLY to read `hostname` (feeds the cookie
 *   `secure` flag decision) and the `intent` / `returnTo` query params.
 *   We deliberately don't touch headers, method, or body — any
 *   additional input would widen the decision surface beyond what
 *   `startOauthFlow` knows about.
 *
 * @param params   — Promise per Next.js 15 App Router convention.
 *   `provider` is a raw URL segment; `startOauthFlow` is responsible
 *   for validating it against the registry.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider } = await params;

  // Next.js search-params API: `.get(key)` returns `string | null`.
  // We forward both `null` (param absent) and `""` (param present,
  // empty) as-is — `startOauthFlow` treats both as "default to signin".
  const intent = request.nextUrl.searchParams.get("intent");
  const returnTo = request.nextUrl.searchParams.get("returnTo");

  const result = startOauthFlow(
    {
      registry,
      store: oauthFlowStore,
      generateCredentials: generateFlowCredentials,
      now: Date.now,
      config,
    },
    {
      providerId: provider,
      intent,
      returnTo,
      hostname: request.nextUrl.hostname,
    },
  );

  // 404 — flag off, unknown provider, or unconfigured provider. All
  // three collapse to "route does not exist" so an outside caller can't
  // probe which providers we have wired up in this environment.
  if (result.kind === "not-found") {
    notFound();
  }

  // 400 — user-facing message only. A valid UI should never send a bad
  // intent; if we see one it's either a hand-crafted URL or a stale
  // link. Plain text keeps the body small and the content-type header
  // obvious (no JSON parsing on the client).
  if (result.kind === "invalid-intent") {
    return new Response(result.message, {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // Happy path: set the single-use state cookie, then 302 to the
  // provider's authorize endpoint. The cookie ride-along is load-
  // bearing — the callback route reads `mmpm_oauth_state` and compares
  // it to the `state` query param to reject cross-session replays.
  const cookieStore = await cookies();
  cookieStore.set(result.cookie.name, result.cookie.value, {
    httpOnly: result.cookie.httpOnly,
    secure: result.cookie.secure,
    sameSite: result.cookie.sameSite,
    path: result.cookie.path,
    maxAge: result.cookie.maxAge,
  });

  // `redirect` throws NEXT_REDIRECT. This call MUST be at the top
  // level (not inside try/catch) — see module header. Nothing below
  // this line runs for the success case; TypeScript doesn't know that
  // because `redirect`'s return type is `never`, so the function's
  // implicit return is Response (satisfied by the earlier branches).
  redirect(result.authorizeUrl);
}
