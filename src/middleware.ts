import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "mmpm_session";

/**
 * Edge middleware — protects /admin and any future authenticated routes.
 *
 * Note: Edge runtime cannot make DB calls, so this is a cookie presence check
 * only. The actual session validation happens in each protected page/route
 * when it calls GET /api/auth/me (which validates against the DB).
 *
 * This is the correct security model:
 *   - Middleware: fast redirect for obviously unauthenticated users (no cookie)
 *   - Page/server component: full session validation via API call
 */
export function middleware(request: NextRequest): NextResponse {
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
