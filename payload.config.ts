import path from "path";
import { fileURLToPath } from "url";
import { buildConfig } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { nodemailerAdapter } from "@payloadcms/email-nodemailer";

import { Users } from "./payload/collections/Users";
import { Partners } from "./payload/collections/Partners";
import { Categories } from "./payload/collections/Categories";
import { AttributeDefinitions } from "./payload/collections/AttributeDefinitions";
import { Products } from "./payload/collections/Products";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: { titleSuffix: "· Summit Catalog Admin" },
    components: {
      beforeDashboard: [
        // "Sync now" button intentionally removed (2026-07-29): sync is demoted to a
        // deliberate re-import tool (POST /tools/sync, or runSync in a guarded route)
        // rather than a casual one-click op — Artisan Bath Co. rarely changes and a sync now
        // carries side effects (price recompute) that shouldn't be a stray click away.
        // The engine (lib/sync.ts) is kept for dealer-sheet refreshes / new partners.
        "/components/admin/MirrorButton#MirrorButton",
      ],
    },
  },
  collections: [Users, Partners, Categories, AttributeDefinitions, Products],
  editor: lexicalEditor(),
  // Transactional email (admin password reset, user invites). Env-driven SMTP so
  // any provider works — recommend Summit's existing M365 / Google Workspace SMTP
  // (authenticated send from a real mailbox, no new DNS/SPF needed for low-volume
  // internal mail). With no SMTP_HOST set (e.g. local dev), Payload falls back to
  // logging emails to the console.
  email: process.env.SMTP_HOST
    ? nodemailerAdapter({
        defaultFromAddress: process.env.EMAIL_FROM || "no-reply@summithome.example",
        defaultFromName: process.env.EMAIL_FROM_NAME || "Summit Catalog",
        transportOptions: {
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_PORT === "465", // implicit TLS on 465; STARTTLS otherwise
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        },
      })
    : undefined,
  secret: process.env.PAYLOAD_SECRET || "",
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
  db: postgresAdapter({
    // Schema auto-push is OFF by default: prod is DDL-less (least-priv role) and
    // local dev shares the prod Neon DB, so an unguarded push would mutate prod.
    // Enable it ONLY in a dev session whose DATABASE_URI points at an ISOLATED
    // Neon dev branch, via PAYLOAD_DB_PUSH=true. See SCHEMA-CHANGES.md for the
    // full schema-change runbook.
    push: process.env.PAYLOAD_DB_PUSH === "true",
    pool: {
      connectionString: process.env.DATABASE_URI || "",
      // Headroom for the sync engine's bounded-concurrency writes (CONCURRENCY=12
      // in lib/sync.ts) plus normal request traffic. Well within Neon's limits.
      max: 20,
    },
  }),
});
