import type { CollectionConfig } from "payload";
import { isAdmin, adminOrSelf } from "../access";

/**
 * Users — the ONE account collection for the whole app. It backs both the Payload
 * admin AND the front-end rep login (reps and admins use the SAME credentials).
 * The first user is created via /admin on first run; further reps are created by an
 * admin in /admin (no public self-registration — matches the email-based access
 * model in payload/access.ts).
 *
 * Access: only admins manage users; an editor may read/update only their own
 * account (name/password) and cannot create, delete, or view other users.
 * Admin identity is email-based (see payload/access.ts) — there is no role field
 * to edit, so no one can escalate themselves through the UI.
 *
 * Auth is tuned for FIELD REPS on iPads with spotty signal: a long 90-day token so
 * a rep logs in once (online) and stays signed in for a whole season. The session
 * is trusted offline (no re-auth without signal — the offline gate is a local
 * marker, and the real data boundaries — SSR pages + /tools/snapshot — only run
 * online). tokenExpiration is a JWT claim + cookie maxAge — NO DB migration.
 */
export const Users: CollectionConfig = {
  slug: "users",
  auth: {
    tokenExpiration: 60 * 60 * 24 * 90, // 90 days — "log in once a season" for reps
    // Lock an account for 10 min after 10 bad attempts (light brute-force defense
    // on an internal tool; reps fat-finger passwords on tablets, so not too strict).
    maxLoginAttempts: 10,
    lockTime: 10 * 60 * 1000,
    cookies: {
      sameSite: "Lax", // same-site app; Lax lets the cookie ride top-level navigations
      // Secure only in prod: localhost dev is http, where a Secure cookie won't set.
      secure: process.env.NODE_ENV === "production",
    },
  },
  access: {
    read: adminOrSelf,
    create: isAdmin,
    update: adminOrSelf,
    delete: isAdmin,
  },
  admin: { useAsTitle: "email", group: "Admin" },
  fields: [{ name: "name", type: "text" }],
};
