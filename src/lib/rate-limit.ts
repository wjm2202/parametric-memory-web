/**
 * In-process fixed-window rate limiting for API routes.
 *
 * Generalises the per-IP limiter first written inline in
 * `src/app/api/verify/fetch-snapshot/route.ts`. In-process only (per server
 * instance) — it is the application-layer backstop, NOT the primary control.
 * Pair it with an EDGE limit (nginx `limit_req` / Cloudflare) in production,
 * because (a) it resets on deploy/restart and (b) it can't see across instances.
 *
 * `clientIp` reads the leftmost X-Forwarded-For, which is spoofable by a direct
 * caller — another reason the edge limit is the real ceiling. For abuse that
 * costs us money on every hit (sending email, provisioning), this in-process
 * cap still meaningfully raises the bar for a casual scripted attacker.
 */
import type { NextRequest } from "next/server";

/** Best-effort real client IP from proxy headers. */
export function clientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

type Bucket = { count: number; resetAt: number };

/**
 * Build a fixed-window limiter. Returns a function that takes a key (IP, email,
 * …) and returns `true` when that key is OVER the limit for the current window.
 *
 *   const limited = makeFixedWindowLimiter({ windowMs: 60_000, max: 5 });
 *   if (limited(ip)) return 429;
 */
export function makeFixedWindowLimiter(opts: { windowMs: number; max: number }) {
  const { windowMs, max } = opts;
  const hits = new Map<string, Bucket>();
  return function limited(key: string): boolean {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now >= entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      // Opportunistic cleanup so the map can't grow unbounded under attack.
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
      }
      return false;
    }
    entry.count += 1;
    return entry.count > max;
  };
}
