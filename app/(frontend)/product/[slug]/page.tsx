import { notFound, redirect } from "next/navigation";
import { getProductBySlug, getProductBySourceId, getAttrDefs, getAllProducts, getDataFreshness } from "@/lib/catalog";
import { buildConfigurator } from "@/lib/catalog-shared";
import { requireUser } from "@/lib/auth";
import ProductView from "@/components/views/ProductView";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sid?: string }>;
}) {
  await requireUser();
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) {
    // Slug miss — an estimate line whose product the supplier renamed (its handle changed). Recover it by the
    // stable source id the line carries (?sid=) and send the rep to the product's current URL.
    const { sid } = await searchParams;
    if (sid) {
      const moved = await getProductBySourceId(sid);
      if (moved) redirect(`/product/${moved.slug}`);
    }
    notFound();
  }

  const [defs, all, dataAsOf] = await Promise.all([
    getAttrDefs(product.category),
    getAllProducts(),
    getDataFreshness(),
  ]);
  const configurator = buildConfigurator(product, all);
  return <ProductView product={product} defs={defs} configurator={configurator} dataAsOf={dataAsOf} />;
}
