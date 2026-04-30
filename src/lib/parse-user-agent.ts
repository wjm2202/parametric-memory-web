/**
 * parseUserAgent — hand-rolled minimal UA → "Browser N on OS" parser.
 *
 * Used by the audit page (Sprint 7) to render "Chrome 134 on macOS"
 * instead of the raw 200-character User-Agent string.
 *
 * ## Why hand-rolled instead of ua-parser-js
 *
 *   1. Zero external dependency — no supply-chain surface for a feature
 *      that's purely cosmetic. The audit page still works perfectly
 *      with bare UA strings; this module only beautifies them.
 *   2. License clarity — ua-parser-js v2 is dual AGPL / commercial and
 *      v1 is on its way out. Avoiding the dep avoids the question.
 *   3. Code we own. UA parsing IS a maintenance treadmill (browsers
 *      ship new strings every release), but the cost of a stale
 *      table here is "Chrome 250 renders as Unknown browser" — graceful
 *      degrade, never a security issue.
 *
 * ## Coverage
 *
 * Detects the browsers and operating systems that account for the
 * overwhelming majority of real traffic. Anything else falls through to
 * "Unknown browser on Unknown OS" — which is honest and still tells the
 * user the row is real, just not categorised.
 *
 *   Browsers: Edge, Opera, Firefox, Chrome, Safari (incl. Mobile Safari),
 *             curl, Wget. Order-sensitive — see comment on the table.
 *   OSes:     iOS, Android, ChromeOS, Windows, macOS, Linux.
 *
 * ## Why a regex table, not a switch + custom logic per browser
 *
 * UA strings share substrings across browsers: Chrome's UA contains
 * "Safari", Edge's contains "Chrome", Opera's contains "Chrome", and
 * mobile Safari's contains "Mac OS X" (because iOS used to be a fork
 * of macOS). The order of checks in a regex table is the disambiguator
 * — match the most specific marker first. A switch + custom logic
 * would have to encode that order anyway, with more code.
 *
 * ## Stability across browser releases
 *
 * Major version only. "Chrome 134" today, "Chrome 250" in five years —
 * the format never changes; only the number grows. Patch versions
 * (134.0.6998.117 → 134.0.6999.42) churn weekly and would clutter
 * the audit feed; we drop them.
 */

/**
 * Public entry point. Accepts string | null | undefined; never throws;
 * returns a string the audit page can render verbatim.
 */
export function parseUserAgent(ua: string | null | undefined): string {
  if (!ua || ua.trim().length === 0) return "Unknown device";

  const browser = matchBrowser(ua);
  const os = matchOs(ua);

  if (browser === null) return `Unknown browser on ${os}`;

  const browserPart = browser.major.length > 0 ? `${browser.name} ${browser.major}` : browser.name;
  return `${browserPart} on ${os}`;
}

// ─── Browser table ─────────────────────────────────────────────────────
//
// ORDER MATTERS. Browsers chain UA tokens for backwards compatibility:
//   - Edge UA includes "Chrome/X" (it's Chromium)
//   - Opera UA includes "Chrome/X"
//   - Chrome UA includes "Safari/X" (historical AppleWebKit lineage)
//   - Mobile Safari UA includes "AppleWebKit/X" + "Mobile" + "Safari/X"
//
// So the table goes most-specific → least-specific.

const BROWSER_PATTERNS: Array<{ regex: RegExp; name: string }> = [
  // Chromium-based browsers that announce themselves explicitly. Both
  // also carry "Chrome/X" tokens, so they MUST be checked before the
  // generic Chrome row.
  { regex: /\bEdg\/(\d+)/, name: "Edge" },
  { regex: /\bOPR\/(\d+)/, name: "Opera" },

  // Firefox is unambiguous — its UA does not include "Chrome" or "Safari".
  { regex: /\bFirefox\/(\d+)/, name: "Firefox" },

  // Generic Chrome — anything Chromium that didn't match Edge / Opera above.
  { regex: /\bChrome\/(\d+)/, name: "Chrome" },

  // Safari uses `Version/<n>` for the version it wants the user to see.
  // Anchored on `Safari` token so a stray "Version/X" elsewhere doesn't
  // false-positive.
  { regex: /\bVersion\/(\d+).*Safari\b/, name: "Safari" },

  // CLI / non-browser. Useful for the audit feed because automated
  // attempts often show up here ("curl 8 on Unknown OS" → that wasn't a
  // browser at all, which is itself signal).
  { regex: /\bcurl\/(\d+)/, name: "curl" },
  { regex: /\bWget\/(\d+)/, name: "Wget" },
];

function matchBrowser(ua: string): { name: string; major: string } | null {
  for (const { regex, name } of BROWSER_PATTERNS) {
    const m = ua.match(regex);
    if (m) {
      // Capture group 1 is always the major version digit run.
      return { name, major: m[1] ?? "" };
    }
  }
  return null;
}

// ─── OS table ──────────────────────────────────────────────────────────
//
// iOS UAs contain "Mac OS X" (because iOS evolved from Darwin/macOS).
// Therefore iOS MUST be checked before macOS. ChromeOS UAs sometimes
// include "Linux", so ChromeOS must precede Linux. Windows / Android /
// macOS / Linux are mutually exclusive enough not to need ordering
// among themselves, but we keep iOS first and Linux last on principle.

const OS_PATTERNS: Array<{ regex: RegExp; name: string }> = [
  { regex: /iPhone|iPad|iPod/, name: "iOS" },
  { regex: /Android/, name: "Android" },
  { regex: /CrOS\b/, name: "ChromeOS" },
  { regex: /Windows NT/, name: "Windows" },
  { regex: /Mac OS X/, name: "macOS" },
  { regex: /\bLinux\b/, name: "Linux" },
];

function matchOs(ua: string): string {
  for (const { regex, name } of OS_PATTERNS) {
    if (regex.test(ua)) return name;
  }
  return "Unknown OS";
}
