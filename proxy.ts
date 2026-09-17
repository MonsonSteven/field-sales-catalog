import { NextRequest, NextResponse } from "next/server";

/**
 * Edge auth gate — a FAST UX redirect, not the security boundary.
 * (Next 16 `proxy` file convention — renamed from `middleware.ts`; behaviour is unchanged.)
 *
 * It only checks that the Payload session COOKIE is present (edge runtime can't run
 * Payload/pg to validate it). Real validation happens where the data actually lives:
 *   • SSR catalog pages  → lib/auth.ts requireUser() (payload.auth)
 *   • /tools/snapshot    → payload.auth in the route
 *   • Payload REST /api  → collection access (isLoggedIn) enforced by Payload
 * So a forged/empty cookie gets someone the login-less shell but never any data.
 *
 * Exempt (never redirected):
 *   /login            the sign-in page itself
 *   /~app             the offline PWA shell (must open with no valid server session;
 *                     its data came from an authed /tools/snapshot while online)
 *   /api              Payload REST + auth endpoints (login must be reachable)
 *   /admin            Payload admin (has its own login UI)
 *   /tools            self-authenticating JSON routes (return 401, must not 302→HTML)
 *   *.ext             static files (sw.js, manifest.webmanifest, icons, fonts, …)
 *
 * The matching itself lives in lib/public-paths.ts so it can be tested without next/server.
 * It resolves percent-encoding before matching (a `/%7Eapp` request used to bounce the
 * OFFLINE SHELL to a login page it cannot load) while refusing any decode that changes the
 * path's segment structure — see that file for the security reasoning.
 */

import { isPublicPath, isFile } from "@/lib/public-paths";

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Forward the current path so requireUser() can build an accurate return-to link.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname + search);
  const proceed = () => NextResponse.next({ request: { headers: requestHeaders } });

  // Portfolio demo: open access — no login wall. The auth code below still exists
  // (and works when this flag is off) so the real security boundary is on display.
  if (process.env.DEMO_OPEN_ACCESS === "true") return proceed();

  if (isPublicPath(pathname) || isFile(pathname)) return proceed();

  // Protected catalog page: require a session cookie, else bounce to login.
  if (!req.cookies.get("payload-token")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?redirect=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return proceed();
}

export const config = {
  // Run on everything except Next's internal build assets (those are always public
  // and high-volume). The function above handles the finer-grained exemptions.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
