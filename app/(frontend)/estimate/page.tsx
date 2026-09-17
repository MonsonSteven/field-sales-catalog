import { requireUser } from "@/lib/auth";
import EstimateView from "@/components/views/EstimateView";

// The Product Estimate review/edit screen (online). Login-gated like the rest of the
// catalog. Renders the client EstimateView, which reads the on-device store — so the
// same view also works offline via the /~app shell (see app/(frontend)/~app/page.tsx).
export const dynamic = "force-dynamic";

export default async function EstimatePage() {
  await requireUser();
  return <EstimateView />;
}
