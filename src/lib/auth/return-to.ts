/**
 * Return-to URL allow-list validator (ADR-003, Phase 2 OAuth).
 *
 * Purpose
 * ───────
 * OAuth flows let the caller specify where to land after sign-in via a
 * `returnTo` query param. Passing that value straight to `res.redirect()`
 * is a textbook open-redirect bug — an attacker sends a victim to
 *
 *   https://memory.kiwi/login?returnTo=https://evil.com/steal-session
 *
 * and after the OAuth dance the victim's browser lands on `evil.com` while
 * the URL bar still shows the legit origin of the redirect response. This
 * module is the single choke point that decides whether a `returnTo` is
 * safe to honour, and it is deliberately strict: **whitelist-only**, not
 * blacklist-of-known-bads.
 *
 * Callers MUST treat a `null` return as "this input is hostile" and fall
 * back to a server-chosen default (typically `/dashboard`). Never use the
 * raw input after a null.
 *
 * Design decisions
 * ────────────────
 * 1. **Prefix allow-list, not regex.** The allowed destinations are known
 *    at design time (`/`, `/dashboard`, `/admin`). A regex would be more
 *    flexible but every "flexible" redirect validator in the wild has been
 *    bypassed at least once. Exact prefix match is the smallest attack
 *    surface.
 * 2. **Reject, don't sanitise.** If the input is suspicious we return
 *    null. Silently rewriting a hostile value (e.g. stripping a `//`
 *    prefix) is a whole class of bypasses — the sanitiser's idea of "safe"
 *    rarely matches what the browser does.
 * 3. **Parse with `new URL(raw, dummyBase)`.** Defence in depth against
 *    absolute URLs that slip past prefix checks (`http://evil.com`,
 *    `https://evil.com`, exotic schemes). If the parsed origin differs
 *    from the base we injected, the input wasn't relative and is
 *    rejected.
 * 4. **Path-only allow-list, query/fragment pass through.** A common use
 *    case is `/dashboard?tab=billing` or `/dashboard#section`. These are
 *    safe — they don't change the origin — so we keep them after
 *    validating the pathname. The control-character screen below catches
 *    anything exotic the browser might interpret unexpectedly.
 *
 * Attack classes this rejects (each has a test)
 * ─────────────────────────────────────────────
 *   - Absolute URLs:            `http://evil.com/x`, `https://evil.com`
 *   - Protocol-relative:        `//evil.com`, `//evil.com/dashboard`
 *   - Non-HTTP schemes:         `javascript:alert(1)`, `data:text/html,…`
 *   - Backslash host tricks:    `/\evil.com`, `\\evil.com`  (some browsers
 *                               normalise `\` → `/` in Location headers)
 *   - Prefix-bypass via dash:   `/dashboard-fake`  (starts with the
 *                               allowed prefix as a substring but isn't
 *                               a path segment match)
 *   - Control chars / CRLF:     `\r\n`, `\x00`, tab — could split headers
 *                               or break downstream parsers
 *   - Wrong-type inputs:        undefined, null, number, array — caller
 *                               might pass `req.query.returnTo` which is
 *                               `string | string[] | undefined` in Next.
 *   - Empty string
 *
 * What this does NOT do
 * ─────────────────────
 *   - It does NOT URL-decode the input. If someone passes `%2Fdashboard`
 *     the pathname stays `%2Fdashboard`, which is not in the allow-list
 *     and gets rejected. That is the correct behaviour — the server that
 *     will follow this redirect (the browser) does its own decoding, and
 *     second-guessing it has historically created bypasses.
 *   - It does NOT care about HTTPS-only. Callers are responsible for
 *     setting `Secure` on cookies and for running behind TLS in prod.
 */

/**
 * The exact set of paths allowed as OAuth `returnTo` destinations. Match
 * rule is "exact, or exact-plus-slash-prefix":
 *
 *   "/"          — matches "/" exactly (root dashboard)
 *   "/dashboard" — matches "/dashboard", "/dashboard/…"
 *   "/admin"     — matches "/admin", "/admin/…"
 *
 * To add a new allowed destination:
 *   1. Add it here.
 *   2. Add a positive test case in return-to.test.ts.
 *   3. Confirm with security review — every new entry widens the
 *      redirect attack surface.
 */
export const ALLOWED_RETURN_TO_PATHS: readonly string[] = ["/", "/dashboard", "/admin"];

/**
 * Dummy base used to parse a relative input into a URL object. Any
 * origin that differs from this (e.g. the input was actually
 * `http://evil.com`) fails validation. The hostname is intentionally a
 * reserved TLD (`.test`, RFC 2606) so there is zero risk of accidentally
 * matching a real production hostname.
 */
const DUMMY_BASE = "http://returnto-validator.test";

/**
 * Characters that should never appear in a return-to URL. C0 controls
 * (0x00–0x1f), DEL (0x7f). CR/LF in particular could split headers or
 * confuse downstream parsers.
 */
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

/**
 * Validate a user-supplied `returnTo` value against the allow-list.
 * Returns the original string on success (safe to pass to `redirect()`),
 * or `null` if the value is hostile / malformed / out of the allow-list.
 *
 * The caller decides the fallback:
 *
 *   const safe = validateReturnTo(req.query.returnTo) ?? "/dashboard";
 *   return NextResponse.redirect(new URL(safe, baseUrl));
 */
export function validateReturnTo(raw: unknown): string | null {
  // Shape check — `req.query.returnTo` in Next.js can legitimately be
  // `string | string[] | undefined`. We only accept the single-string
  // form; anything else is a caller bug or a hostile array trick.
  if (typeof raw !== "string") return null;
  if (raw.length === 0) return null;

  // Must be rooted at "/". Catches absolute URLs (`http://…`) and
  // everything that doesn't start with a slash (`javascript:`, `data:`,
  // bare hostnames like `evil.com`).
  if (!raw.startsWith("/")) return null;

  // Protocol-relative URLs start with "//" and the browser treats them
  // as absolute. Reject explicitly — even though the URL parse below
  // would also catch this, a redundant check documents the intent and
  // keeps the rule visible to future readers.
  if (raw.startsWith("//")) return null;

  // Backslash tricks — browsers (Chrome, Safari) normalise `\` to `/` in
  // Location headers, so `/\evil.com` can redirect to `//evil.com`.
  // Backslash has no legitimate use in any of our allowed paths.
  if (raw.includes("\\")) return null;

  // Control characters (incl. CRLF, null, tab). CRLF injection in
  // Location headers is a classic header-smuggling primitive.
  if (CONTROL_CHARS.test(raw)) return null;

  // Defence in depth: parse the (supposedly) relative URL against a
  // dummy base. If the resulting origin doesn't match the base we
  // injected, the input wasn't actually relative — reject.
  let url: URL;
  try {
    url = new URL(raw, DUMMY_BASE);
  } catch {
    return null;
  }
  if (url.origin !== DUMMY_BASE) return null;

  // Prefix match on pathname. The rule: the allowed prefix either
  // equals the pathname exactly, or is followed by a "/" (so that
  // "/dashboard-fake" doesn't match the "/dashboard" prefix).
  const pathname = url.pathname;
  const allowed = ALLOWED_RETURN_TO_PATHS.some((prefix) => {
    if (prefix === "/") {
      // The root is a special case — only the exact string "/" matches,
      // because every other path also starts with "/".
      return pathname === "/";
    }
    return pathname === prefix || pathname.startsWith(prefix + "/");
  });
  if (!allowed) return null;

  // Return the ORIGINAL string, not `url.toString()` — the URL parser
  // would re-emit it with the dummy origin and would also normalise
  // percent-encodings in ways we don't want to bake into the response.
  return raw;
}
