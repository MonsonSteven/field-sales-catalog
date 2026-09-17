import { searchAllItems } from "@/lib/catalog";
import { requireUser } from "@/lib/auth";
import SearchView from "@/components/views/SearchView";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();
  const results = q ? await searchAllItems(q) : [];
  return <SearchView q={q} results={results} />;
}
