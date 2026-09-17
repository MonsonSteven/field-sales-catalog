import type { Access, FieldAccess } from "payload";

/**
 * Access control for the Payload admin + REST API.
 *
 * Admins are identified by EMAIL (via ADMIN_EMAILS, comma-separated) rather than a
 * roles column — so there's no schema migration and, crucially, no UI path for a
 * user to escalate their own privileges. Everyone else who can log in is an
 * "editor". Defaults to the founder's email so there is never an admin lockout.
 *
 * NOTE: the storefront and the sync engine use Payload's LOCAL API, which bypasses
 * access control (overrideAccess defaults to true) — so these rules govern the
 * admin UI + REST API only, and never block the public catalog or a sync.
 */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "admin@summithome.example")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** True when the user's email is on the admin allowlist. Exported for admin-gated route handlers
 *  (e.g. /tools/errors) that authenticate via payload.auth and need the same admin test. */
export const emailIsAdmin = (user: unknown): boolean => {
  const email = (user as { email?: string } | null | undefined)?.email;
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
};

/** Collection access — admins only. */
export const isAdmin: Access = ({ req: { user } }) => emailIsAdmin(user);

/** Collection access — any authenticated user (admin or editor). */
export const isLoggedIn: Access = ({ req: { user } }) => Boolean(user);

/** Collection access — admins see everything; others are scoped to their own doc. */
export const adminOrSelf: Access = ({ req: { user } }) => {
  if (emailIsAdmin(user)) return true;
  if (user) return { id: { equals: user.id } };
  return false;
};

/** Field access — only admins may write this field; editors see it read-only. */
export const isAdminFieldWrite: FieldAccess = ({ req: { user } }) => emailIsAdmin(user);
