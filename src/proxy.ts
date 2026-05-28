import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "mmpm_session";

/**
 * Proxy (Next.js 16+) — protects /admin and any future authenticated routes.
 *
 * Formerly `middleware.ts` / `export function middleware`. Renamed to
 * `proxy.ts` / `export function proxy` by the @next/codemod
 * `middleware-to-proxy` transform during the Next 16 upgrade (Phase 2 of
 * docs/SPRINT-NEXTJS-16-UPGRADE-2026-05-27.md). Functional behaviour is
 * unchanged — `proxy` runs at the same lifecycle point that `middleware`
 * did, with the same matcher and return semantics.
 *
 * Runtime note: `proxy.ts` forces the Node.js runtime (Edge is not
 * supported for the proxy semantic). This codebase doesn't make DB calls
 * from here anyway — it's a cookie-presence redirect, not a session
 * validator — so the runtime change is functionally invisible. The
 * actual session validation happens in each protected page/route when
 * it calls GET /api/auth/me (which validates against the DB).
 *
 * Security model:
 *   - Proxy: fast redirect for obviously unauthenticated users (no cookie)
 *   - Page/server component: full session validation via API call
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // ── Protected routes ──────────────────────────────────────────────────────
  const isProtected = pathname.startsWith("/admin") || pathname.startsWith("/dashboard");

  if (isProtected) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE);

    if (!sessionCookie?.value) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - /api/* (API routes handle their own auth)
     * - /auth/* (callback handler)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/|auth/).*)",
  ],
};
