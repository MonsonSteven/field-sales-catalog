import { notFound } from "next/navigation";
import { getCategoryBySlug, getCatalogItemsByCategorySlug, getFilterDefs, getAllProducts } from "@/lib/catalog";
import { computeBrowseGroups, applyBrowseGroups } from "@/lib/catalog-shared";
import { requireUser } from "@/lib/auth";
import CategoryView from "@/components/views/CategoryView";

export const dynamic = "force-dynamic";

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  // Collapse split size-ladder families into one tile each (see computeBrowseGroups). Groups are
  // derived from the FULL product set — the same set + engine the product page navigates with —
  // then applied to this category's slim items. getAllProducts() is request-cached.
  const items = await getCatalogItemsByCategorySlug(slug);
  const grouped = applyBrowseGroups(items, computeBrowseGroups(await getAllProducts()));
  // filters AFTER grouping: getFilterDefs uses items to drop dead filters, and the collapsed
  // tiles carry the UNION of their members' attributes, so no live filter is lost.
  const filters = await getFilterDefs(category.name, grouped);

  return <CategoryView category={category} items={grouped} filters={filters} />;
}
