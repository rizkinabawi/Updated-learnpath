/**
 * app-license.ts
 *
 * SECTION 1 — Global app activation lock.
 *
 * Activation key wire format (signed by the APP MASTER private key):
 *   {
 *     appId:     string,           // must equal APP_ID
 *     issuedAt:  number (ms epoch),
 *     expiry:    number (ms epoch),
 *     deviceId?: string,           // optional device binding
 *     signature: base64(ed25519(APP_MASTER_SK, "appId|issuedAt|expiry|deviceId"))
 *   }
 *
 * Verification:
 *   1. Parse JSON / base64.
 *   2. Ed25519-verify signature against APP_MASTER_PUBLIC_KEY_HEX.
 *   3. Expiry check (Date.now() ≤ expiry).
 *   4. If `deviceId` present, must equal getDeviceId().
 *   5. appId must equal APP_ID.
 *
 * On success:
 *   - Persist the verified key in expo-secure-store.
 *   - App is unlocked permanently (until the key expires or storage is wiped).
 */

import {
  ed25519Verify,
  fromBase64,
  fromHex,
  fromUtf8,
  utf8,
} from "./crypto";
import { APP_ID, APP_MASTER_PUBLIC_KEY_HEX } from "./master-public-key";
import { secureGet, secureSet, secureDelete } from "./secure-storage";
import { getDeviceId } from "./device";

const STORE_KEY = "lp.security.appLicense";

export interface AppLicense {
  appId: string;
  issuedAt: number;
  expiry: number;
  deviceId?: string;
  mode?: "trial" | "full"; // New: distinguish types
  signature: string; // base64
}

export type LicenseError =
  | "MISSING_FIELDS"
  | "WRONG_APP"
  | "BAD_SIGNATURE"
  | "EXPIRED"
  | "DEVICE_MISMATCH"
  | "BAD_PUBLIC_KEY";

const APP_MASTER_PUBLIC_KEY = (() => {
  try {
    return fromHex(APP_MASTER_PUBLIC_KEY_HEX);
  } catch {
    return null;
  }
})();

function isLicense(v: unknown): v is AppLicense {
  if (!v || typeof v !== "object") return false;
  const k = v as Record<string, unknown>;
  return (
    typeof k.appId === "string" &&
    typeof k.issuedAt === "number" &&
    typeof k.expiry === "number" &&
    typeof k.signature === "string" &&
    (k.deviceId === undefined || typeof k.deviceId === "string") &&
    (k.mode === undefined || k.mode === "trial" || k.mode === "full")
  );
}

/** Try to parse a license from raw text (JSON or base64-of-JSON). */
export function parseLicenseInput(raw: string): AppLicense | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed);
    if (isLicense(obj)) return obj;
  } catch {
    /* not direct JSON */
  }
  try {
    const text = fromUtf8(fromBase64(trimmed));
    const obj = JSON.parse(text);
    if (isLicense(obj)) return obj;
  } catch {
    /* not base64 of JSON */
  }
  return null;
}

/** Verify an activation key. Returns null on success, or a typed error code. */
export async function verifyLicense(
  license: AppLicense
): Promise<LicenseError | null> {
  if (!APP_MASTER_PUBLIC_KEY || APP_MASTER_PUBLIC_KEY.length !== 32) {
    return "BAD_PUBLIC_KEY";
  }
  if (license.appId !== APP_ID) return "WRONG_APP";

  let sig: Uint8Array;
  try {
    sig = fromBase64(license.signature);
  } catch {
    return "BAD_SIGNATURE";
  }
  if (sig.length !== 64) return "BAD_SIGNATURE";

  const msg = utf8(
    `${license.appId}|${license.issuedAt}|${license.expiry}|${license.deviceId ?? ""}`
  );
  const ok = await ed25519Verify(APP_MASTER_PUBLIC_KEY, msg, sig);
  if (!ok) return "BAD_SIGNATURE";

  if (Date.now() > license.expiry) return "EXPIRED";

  if (license.deviceId) {
    const current = await getDeviceId();
    if (current !== license.deviceId) return "DEVICE_MISMATCH";
  }

  return null;
}

/** Persist a verified license (caller must have already called verifyLicense). */
export async function storeLicense(license: AppLicense): Promise<void> {
  await secureSet(STORE_KEY, JSON.stringify(license));
}

/** Read the stored license, if any. Returns null on miss / corruption. */
export async function readStoredLicense(): Promise<AppLicense | null> {
  const raw = await secureGet(STORE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (isLicense(parsed)) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Boot-time check: returns true iff the persisted license still passes full
 * verification (signature + expiry + device binding).
 */
export async function isAppActivated(): Promise<boolean> {
  const stored = await readStoredLicense();
  if (!stored) return false;
  const err = await verifyLicense(stored);
  return err === null;
}

/** Get current license info plus trial status. */
export async function getLicenseDetails() {
  const stored = await readStoredLicense();
  if (!stored) return null;
  const isExpired = Date.now() > stored.expiry;
  const mode = stored.mode || "full";
  const daysLeft = Math.ceil((stored.expiry - Date.now()) / (1000 * 60 * 60 * 24));
  
  return {
    ...stored,
    isExpired,
    mode,
    daysLeft,
    isTrial: mode === "trial",
    nearExpiry: daysLeft <= 7 && daysLeft > 0
  };
}

/** Utility to check if a feature is allowed. */
export async function isFeatureAllowed(feature: "anki" | "bundle" | "pip"): Promise<boolean> {
  const details = await getLicenseDetails();
  if (!details || details.isExpired) return false;
  if (details.mode === "trial") {
    // Specifically block these in trial
    return false;
  }
  return true;
}

/** Error message helper. */
export function describeLicenseError(err: LicenseError): string {
  switch (err) {
    case "MISSING_FIELDS":
      return "Format kunci aktivasi tidak lengkap.";
    case "WRONG_APP":
      return "Kunci aktivasi tidak diterbitkan untuk aplikasi ini.";
    case "BAD_SIGNATURE":
      return "Tanda tangan kunci aktivasi tidak valid.";
    case "EXPIRED":
      return "Kunci aktivasi sudah kedaluwarsa.";
    case "DEVICE_MISMATCH":
      return "Kunci aktivasi terikat ke perangkat lain.";
    case "BAD_PUBLIC_KEY":
      return "Konfigurasi kunci publik aplikasi rusak.";
  }
}
