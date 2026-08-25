"use client";

/**
 * useSession — client-side session detection for STATIC public pages.
 *
 * Why this exists (SEO final fix, 2026-08-24):
 *   Every public page used to call `cookies()` server-side purely to compute
 *   an `isLoggedIn` boolean for the navbar chip. That one call forced dynamic
 *   per-request SSR across the ENTIRE public site (home, pricing, docs, blog,
 *   videos, legal), which meant:
 *     - Googlebot paid full SSR latency on every crawl, and any app hang was
 *       served directly to the crawler (GSC showed 15 sitemap URLs the
 *       scheduler refused to even crawl);
 *     - no page could be statically generated at build time.
 *   The session cookie is httpOnly (correct — it's a credential), so the
 *   client cannot read it directly. Instead this hook asks the existing
 *   auth proxy `GET /api/auth/me` once per browser session and caches the
 *   answer at module scope, letting every public page render fully static.
 *
 * Semantics:
 *   - Crawlers and anonymous users: no fetch result → logged-out chrome
 *     ("Sign In"), which is exactly what static HTML shows. Zero flash.
 *   - Logged-in users: chrome upgrades to the account chip when /api/auth/me
 *     resolves (~one round trip after hydration).
 *   - 401 → definitively logged out. Network error / 5xx → treated as logged
 *     out for THIS render but NOT cached, so a transient outage doesn't stick
 *     for the whole SPA session.
 *   - Login and sign-out both perform full-page redirects, which reset module
 *     state — the cache can never go stale across an auth transition.
 *
 * The result is shared through a module-level cache + in-flight promise so N
 * components on one page produce at most ONE request per browser session.
 */

import { useEffect, useState } from "react";

export interface SessionState {
  loggedIn: boolean;
  email: string | null;
}

export interface UseSessionResult extends SessionState {
  /** True once /api/auth/me has resolved (or a cached result exists). */
  resolved: boolean;
}

const LOGGED_OUT: SessionState = { loggedIn: false, email: null };

let cached: SessionState | null = null;
let inflight: Promise<SessionState> | null = null;

async function fetchSession(): Promise<SessionState> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (res.status === 401) {
      // Definitive: no valid session. Safe to cache.
      cached = LOGGED_OUT;
      return LOGGED_OUT;
    }
    if (!res.ok) {
      // Compute down (503 etc.) — can't know. Do NOT cache; retry on next mount.
      return LOGGED_OUT;
    }
    const data = (await res.json()) as { email?: string };
    const state: SessionState = { loggedIn: true, email: data?.email ?? null };
    cached = state;
    return state;
  } catch {
    // Network error — do NOT cache.
    return LOGGED_OUT;
  } finally {
    inflight = null;
  }
}

export function useSession(): UseSessionResult {
  const [state, setState] = useState<SessionState>(() => cached ?? LOGGED_OUT);
  const [resolved, setResolved] = useState<boolean>(() => cached !== null);

  useEffect(() => {
    let alive = true;
    const apply = (s: SessionState) => {
      if (!alive) return;
      setState(s);
      setResolved(true);
    };
    if (cached) {
      // A later mount after login-state was cached — sync via a microtask so
      // the effect body itself performs no synchronous setState (react-hooks/
      // set-state-in-effect; avoids cascading renders).
      void Promise.resolve(cached).then(apply);
    } else {
      inflight ??= fetchSession();
      void inflight.then(apply);
    }
    return () => {
      alive = false;
    };
  }, []);

  return { ...state, resolved };
}

/** Test-only: clear the module cache between test cases. */
export function __resetSessionCacheForTests(): void {
  cached = null;
  inflight = null;
}
