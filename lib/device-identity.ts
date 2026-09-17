// Per-device identity for error reports (2026-09-11). CLIENT-ONLY (IndexedDB via Dexie).
//
// Under the SHARED single rep login the server can't tell one iPad from another, so the app mints
// its own stable UUID and stores it in Dexie (durable under the app's persist() grant — see
// DeviceRecord in lib/db for why NOT localStorage). `repName` is the OPTIONAL "B" label — unset
// today; the setter exists so a future name-capture UI is a pure front-end add with no schema/DDL.
import { getDB } from "./db";
import type { DeviceRecord } from "./db";

const SELF = "self";
const newId = () => (crypto?.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** The device's stable id, minting + persisting one on first call. Resilient: any storage failure
 *  falls back to a volatile id so error reporting still works (it just won't be stable that session). */
export async function getDeviceId(): Promise<string> {
  try {
    const db = getDB();
    const row = await db.device.get(SELF);
    if (row?.deviceId) return row.deviceId;
    const deviceId = newId();
    await db.device.put({ id: SELF, deviceId, repName: row?.repName ?? null });
    return deviceId;
  } catch {
    return "unknown";
  }
}

/** The optional rep/device name (null today — no capture UI yet). */
export async function getRepName(): Promise<string | null> {
  try {
    return (await getDB().device.get(SELF))?.repName ?? null;
  } catch {
    return null;
  }
}

/** Set (or clear) the device's rep name. The hook for the deferred "B" layer — no caller ships yet. */
export async function setRepName(name: string | null): Promise<void> {
  const db = getDB();
  const row: DeviceRecord = (await db.device.get(SELF)) ?? { id: SELF, deviceId: newId(), repName: null };
  await db.device.put({ ...row, repName: name?.trim() || null });
}
