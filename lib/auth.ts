import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@payload-config";

/**
 * Server-side auth for the front-end (SSR catalog pages + data routes).
 *
 * This is the REAL security boundary. The SSR catalog pages read their data through
 * Payload's LOCAL API (lib/catalog.ts), which bypasses collection access control —
 * so without a guard here they'd render Summit pricing to anyone. The edge middleware
 * only checks that a session COOKIE is present (fast UX redirect); this validates
 * the session for real (signature + expiry) via payload.auth.
 */

/** A synthetic viewer used when the portfolio demo runs in open-access mode
 *  (DEMO_OPEN_ACCESS=true) — so anyone can browse without a login, while the real
 *  auth path below stays intact and is used whenever the flag is off. */
export const isOpenAccess = () => process.env.DEMO_OPEN_ACCESS === "true";
const DEMO_USER = { id: "demo", email: "demo@summithome.example", role: "editor" } as const;

/** The logged-in user for this request, or null. Validates the Payload session. */
export async function getUser() {
  if (isOpenAccess()) return DEMO_USER;
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await headers() });
  return user ?? null;
}

/**
 * Require a logged-in user or redirect to /login (preserving where they were headed,
 * via the x-pathname header the middleware sets). Call at the top of any protected
 * SSR page. Handles the "cookie present but invalid/expired" case the edge
 * middleware can't (it never validates the token).
 */
export async function requireUser() {
  const user = await getUser();
  if (user) return user;
  const h = await headers();
  const path = h.get("x-pathname");
  redirect(path ? `/login?redirect=${encodeURIComponent(path)}` : "/login");
}
