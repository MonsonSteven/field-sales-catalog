// Presentational category view — header + the interactive CatalogBrowser. Shared
// by the online SSR page and the offline shell.
import CatalogBrowser from "@/components/CatalogBrowser";
import type { CatalogItem, CategorySummary, FilterDef } from "@/lib/helpers";

export default function CategoryView({
  category,
  items,
  filters,
}: {
  category: CategorySummary;
  items: CatalogItem[];
  filters: FilterDef[];
}) {
  return (
    <>
      <div className="crumb">
        <a href="/">Home</a> / {category.name}
      </div>
      <h1 className="page-title">{category.name}</h1>
      <p className="page-sub">{category.count} products · filter, search &amp; sort</p>

      <CatalogBrowser items={items} filters={filters} categoryName={category.name} />
    </>
  );
}
