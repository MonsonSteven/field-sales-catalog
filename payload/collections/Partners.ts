import type { CollectionConfig } from "payload";
import { isAdmin, isLoggedIn } from "../access";

/**
 * Partners — first-class so adding a supplier (roofing, windows, …) is data entry.
 * Each partner declares how its data is sourced; the ingestion pipeline picks the
 * matching adapter.
 */
export const Partners: CollectionConfig = {
  slug: "partners",
  access: { read: isLoggedIn, create: isAdmin, update: isAdmin, delete: isAdmin },
  admin: { useAsTitle: "name", group: "Catalog" },
  fields: [
    { name: "name", type: "text", required: true, unique: true },
    { name: "slug", type: "text", required: true, unique: true, index: true },
    {
      name: "sourceType",
      type: "select",
      required: true,
      defaultValue: "shopify_json",
      options: [
        { label: "Shopify products.json", value: "shopify_json" },
        { label: "CSV export", value: "csv" },
        { label: "EDI feed", value: "edi" },
        { label: "Manual entry", value: "manual" },
      ],
    },
    { name: "sourceBase", type: "text", admin: { description: "e.g. https://artisanbath.example" } },
    {
      name: "imageUsageApproved",
      type: "checkbox",
      defaultValue: false,
      admin: { description: "Written OK to use this partner's product imagery on Summit's site." },
    },
  ],
};
