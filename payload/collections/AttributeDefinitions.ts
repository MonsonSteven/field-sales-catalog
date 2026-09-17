import type { CollectionConfig } from "payload";
import { isAdmin, isLoggedIn } from "../access";

/**
 * AttributeDefinitions — the "schema as data". Each row describes ONE typed
 * attribute belonging to a category (e.g. Vanities → "Top Material", enum).
 * The frontend renders spec sheets and (later) filters generically from these,
 * so a new partner's attributes need no code change.
 *
 * The pipeline derives an initial set (data/attribute-definitions.json); editors
 * refine labels/units/filterable flags here.
 */
export const AttributeDefinitions: CollectionConfig = {
  slug: "attributeDefinitions",
  access: { read: isLoggedIn, create: isAdmin, update: isAdmin, delete: isAdmin },
  admin: { useAsTitle: "label", group: "Catalog", defaultColumns: ["label", "category", "type", "filterable"] },
  fields: [
    { name: "key", type: "text", required: true, index: true, admin: { description: "canonical snake_case, e.g. top_material" } },
    { name: "label", type: "text", required: true },
    { name: "category", type: "relationship", relationTo: "categories", required: true, index: true },
    {
      name: "type",
      type: "select",
      required: true,
      defaultValue: "text",
      options: ["text", "number", "enum", "boolean", "dimension"].map((v) => ({ label: v, value: v })),
    },
    { name: "unit", type: "text", admin: { description: "e.g. in, mph, gal", condition: (d) => d.type === "number" || d.type === "dimension" } },
    {
      name: "options",
      type: "array",
      fields: [{ name: "value", type: "text", required: true }],
      admin: { condition: (d) => d.type === "enum" },
    },
    { name: "variantDefining", type: "checkbox", defaultValue: false },
    { name: "filterable", type: "checkbox", defaultValue: false, admin: { description: "Show as a facet in catalog search (feature deferred)." } },
    { name: "order", type: "number", defaultValue: 0 },
  ],
};
