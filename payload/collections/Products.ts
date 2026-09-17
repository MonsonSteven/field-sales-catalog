import type { CollectionConfig } from "payload";
import { isAdmin, isLoggedIn, isAdminFieldWrite } from "../access";

/**
 * Products — the Summit product store.
 *
 * TWO LAYERS coexist here, and keeping them apart is the whole game (see README §Sync):
 *   • SYNCED fields   — written by the ingestion pipeline, OVERWRITTEN each sync.
 *                       Includes formula pricing, RECOMPUTED from source each sync.
 *   • OVERLAY fields  — Summit-authored (priceManualOverride, categoryOverride, status),
 *                       NEVER touched by sync.
 *
 * Access control:
 *   • create/delete   — admins only (product lifecycle is sync-managed).
 *   • synced fields   — writable by admins only (field-level); sync writes them via
 *                       the local API, which bypasses access control.
 *   • overlay fields  — writable by any editor.
 * The two edit tabs mirror this split so it's obvious what an editor should touch.
 */

// Field-level: synced fields are admin-writable only (editors see them read-only).
const syncedAccess = { update: isAdminFieldWrite };

export const Products: CollectionConfig = {
  slug: "products",
  access: {
    read: isLoggedIn,
    create: isAdmin,
    update: isLoggedIn, // editors allowed, but synced fields are gated at field level
    delete: isAdmin,
  },
  admin: {
    useAsTitle: "title",
    group: "Catalog",
    defaultColumns: ["title", "category", "status", "priceManualOverride", "customerPriceStartingAt"],
    // The list-view search box only searches `useAsTitle` (title) by default — which is why
    // searching a SKU turned up nothing, and triaging a restructure meant hunting by title.
    // Include the SKU and the numeric source id (both indexed). source_sku is NOT unique after a
    // the supplier line split, so `sourceId` is the reliable way to disambiguate a published product from
    // its retired hidden twin in the admin.
    listSearchableFields: ["title", "sourceSku", "sourceId"],
  },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "🔒 Synced from Artisan Bath Co.",
          description: "Pulled from the source on every sync. Editable by admins only — editors see these read-only.",
          fields: [
            // ---- provenance ----
            { name: "partner", type: "relationship", relationTo: "partners", required: true, access: syncedAccess },
            { name: "sourceId", type: "text", index: true, admin: { readOnly: true }, access: syncedAccess },
            { name: "sourceSku", type: "text", index: true, admin: { readOnly: true }, access: syncedAccess },
            { name: "sourceHandle", type: "text", admin: { readOnly: true }, access: syncedAccess },

            // ---- core catalog fields ----
            { name: "title", type: "text", required: true, access: syncedAccess },
            { name: "slug", type: "text", index: true, access: syncedAccess },
            { name: "category", type: "relationship", relationTo: "categories", index: true, access: syncedAccess },
            { name: "descriptionHtml", type: "code", admin: { language: "html" }, access: syncedAccess },
            { name: "tags", type: "json", access: syncedAccess },

            // ---- flexible typed attribute VALUES ----
            // Governed by the owning category's AttributeDefinitions; stored as JSON so the
            // shape can vary per category with no migration.
            { name: "attributes", type: "json", access: syncedAccess },
            { name: "variants", type: "json", access: syncedAccess },

            // ---- images (synced references; mirroring handled separately) ----
            { name: "primaryImage", type: "text", access: syncedAccess },
            { name: "gallery", type: "json", access: syncedAccess },
            { name: "sourceImageCount", type: "number", admin: { readOnly: true }, access: syncedAccess },

            // ---- computed formula pricing (recomputed each sync) ----
            {
              name: "customerPriceStartingAt",
              type: "number",
              admin: { readOnly: true, description: "Formula price of the lowest variant (product-level display)." },
              access: syncedAccess,
            },
            {
              name: "pricing",
              type: "json",
              admin: { readOnly: true, description: "Full formula breakdown incl. per-variant prices and basis (dealer/retail)." },
              access: syncedAccess,
            },
          ],
        },
        {
          label: "✏️ Catalog Overlay",
          description: "Summit-authored. Never overwritten by sync — safe for editors to set.",
          fields: [
            {
              name: "priceManualOverride",
              type: "number",
              admin: { description: "Optional hand-set customer price. Overrides the formula when set." },
            },
            {
              name: "status",
              type: "select",
              defaultValue: "draft",
              options: ["draft", "published", "hidden", "needs_review"].map((v) => ({ label: v, value: v })),
              index: true,
              admin: { description: "Only 'published' products appear on the storefront." },
            },
            {
              name: "categoryOverride",
              type: "relationship",
              relationTo: "categories",
              admin: { description: "Set to correct a mis-mapped category; wins over the synced category." },
            },
          ],
        },
      ],
    },
  ],
};
