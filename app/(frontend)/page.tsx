import { getCategories, totalProducts } from "@/lib/catalog";
import { requireUser } from "@/lib/auth";
import HomeView from "@/components/views/HomeView";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requireUser();
  const [categories, total] = await Promise.all([getCategories(), totalProducts()]);

  return <HomeView categories={categories} total={total} />;
}
