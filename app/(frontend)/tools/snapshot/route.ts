import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";
import { getSnapshot } from "@/lib/catalog";
import { isOpenAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /tools/snapshot — the offline catalog snapshot (full products + attribute
 * definitions + version). The client data layer (lib/catalog-source.ts) fetches
 * this while online, stores it in IndexedDB (Dexie), and renders from it offline.
 * The per-vendor "Download for offline" button also calls this.
 *
 * Lives under /tools/* (not /api/*) to avoid Payload's /api/[...slug] catch-all.
 *
 * AUTH: requires a valid Payload session (the front-end rep login). This is a real
 * data boundary — it returns full Summit pricing. A 401 here is expected pre-login and
 * the client surfaces it as `unauthorized` (→ the shell/guard sends the user to
 * /login); it does NOT clobber a device's already-downloaded offline copy.
 */
export async function GET(req: NextRequest) {
  const payload = await getPayload({ config });
  // Open-access demo skips the session gate; otherwise this is the real data boundary.
  if (!isOpenAccess()) {
    const { user } = await payload.auth({ headers: req.headers });
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const snapshot = await getSnapshot();
    return NextResponse.json(snapshot, {
      headers: {
        // Always revalidate: reps must get current pricing/products when online.
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "snapshot failed" }, { status: 500 });
  }
}
