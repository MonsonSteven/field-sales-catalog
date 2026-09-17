// Pure policy: should the app auto-start the full offline download right now?
//
// Extracted from the OfflineDownload component so it is unit-testable without a DOM
// — the project's established pattern for policy that must be proven (cf.
// lib/mirror-loop.ts split out of the server-only sync, lib/catalog-shared.ts).
//
// WHY THIS EXISTS. Reps are non-technical and will not tap "Download for offline"
// on their own, so a device that was only ever browsed online shows broken "?" image
// boxes the moment it loses signal in a customer's home (verified on-device 2026-08-17).
// The fix is to trigger the existing downloadForOffline() machinery automatically.
//
// THE HONEST LIMIT — read before "fixing" the wifi gate. iOS Safari (the actual rep
// device) does NOT implement the Network Information API, so `connection` is null there
// and we genuinely CANNOT distinguish wifi from cellular. There is no reliable
// cross-browser wifi test. Given reps prep on office wifi and most rep iPads are
// wifi-only, we auto-download whenever online and only STAND DOWN when the browser
// gives us a positive signal that the link is metered or slow (Save-Data, a 2g
// effectiveType, or an explicit non-wifi connection type). On iOS this reduces to
// "auto-download whenever online" — the deliberate, accepted behavior for the pilot.

export interface ConnectionLike {
  saveData?: boolean;
  effectiveType?: string; // "slow-2g" | "2g" | "3g" | "4g" (Chromium)
  type?: string; // "wifi" | "cellular" | "ethernet" | "unknown" | … (spec; rarely exposed)
}

export interface AutoDownloadInputs {
  online: boolean;
  /** Whole catalog (data + every image) already cached on this device. */
  complete: boolean;
  /** navigator.connection, or null where unsupported (notably iOS Safari). */
  connection?: ConnectionLike | null;
}

/**
 * True when the app should kick off the full offline download unprompted. Conservative
 * by omission: any positive metered/slow signal stands us down, but the ABSENCE of a
 * signal (iOS, where connection is null) does NOT — that is the case the feature exists
 * for. Callers still guard with a once-per-session latch so this fires at most once.
 */
export function shouldAutoDownload({ online, complete, connection }: AutoDownloadInputs): boolean {
  if (!online) return false; // nothing to fetch with no signal
  if (complete) return false; // already fully offline-ready — don't re-scan needlessly
  const c = connection;
  if (c) {
    if (c.saveData) return false; // user explicitly asked to conserve data
    if (c.effectiveType === "2g" || c.effectiveType === "slow-2g") return false; // too slow / likely metered
    if (c.type && c.type !== "wifi" && c.type !== "ethernet" && c.type !== "unknown") return false; // e.g. cellular
  }
  return true; // online + incomplete + no metered/slow signal (incl. iOS, connection == null)
}
