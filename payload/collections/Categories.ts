import type { CollectionConfig } from "payload";
import { isAdmin, isLoggedIn } from "../access";

/**
 * Categories — Summit-owned taxonomy (NOT the partner's messy product_type values).
 * The normalizer maps incoming data onto these. A category owns its typed
 * AttributeDefinitions, which is what makes the catalog modular.
 */
export const Categories: CollectionConfig = {
  slug: "categories",
  access: { read: isLoggedIn, create: isAdmin, update: isAdmin, delete: isAdmin },
  admin: { useAsTitle: "name", group: "Catalog" },
  fields: [
    { name: "name", type: "text", required: true, unique: true },
    { name: "slug", type: "text", required: true, unique: true, index: true },
    { name: "partner", type: "relationship", relationTo: "partners" },
    { name: "order", type: "number", defaultValue: 0 },
    {
      name: "attributes",
      type: "join",
      collection: "attributeDefinitions",
      on: "category",
      admin: { description: "Typed attribute schema for products in this category." },
    },
  ],
};
