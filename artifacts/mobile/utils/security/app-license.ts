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
  toBase64,
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

export type LicenseMode = "trial" | "full";

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

/** 
 * Enhanced license parsing. 
 * Supports:
 * 1. Direct JSON (Legacy)
 * 2. Base64 encoded JSON
 * 3. Compact Binary Blob (V2) - Starts with 0x02
 */
export function parseLicenseInput(raw: string): AppLicense | null {
  const trimmed = raw.trim().replace(/\s+/g, "");
  if (!trimmed) return null;

  // Try Binary Blob (V2)
  try {
    const bin = fromBase64(trimmed);
    if (bin[0] === 0x02) {
      return unpackLicenseV2(bin);
    }
  } catch { /* not binary */ }

  // Try direct JSON
  try {
    const obj = JSON.parse(trimmed);
    if (isLicense(obj)) return obj;
  } catch { /* not JSON */ }

  // Try Base64 JSON
  try {
    const text = fromUtf8(fromBase64(trimmed));
    const obj = JSON.parse(text);
    if (isLicense(obj)) return obj;
  } catch { /* not base64 JSON */ }

  return null;
}

/** 
 * Unpacks the compact binary format:
 * [0]: version (0x02)
 * [1]: mode (0=full, 1=trial)
 * [2..9]: issuedAt (uint64 be)
 * [10..17]: expiry (uint64 be)
 * [18]: deviceIdLen
 * [19..19+len]: deviceId (utf8)
 * [last 64]: signature
 */
function unpackLicenseV2(bin: Uint8Array): AppLicense | null {
  if (bin.length < 1 + 1 + 8 + 8 + 1 + 64) return null;
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  
  const mode: LicenseMode = bin[1] === 1 ? "trial" : "full";
  // JS numbers are ok for timestamps (53-bit int)
  const issuedAt = Number(view.getBigUint64(2));
  const expiry = Number(view.getBigUint64(10));
  
  const dLen = bin[18];
  const deviceId = dLen > 0 ? fromUtf8(bin.slice(19, 19 + dLen)) : "";
  
  const sigOffset = bin.length - 64;
  const signature = toBase64(bin.slice(sigOffset));
  
  return {
    appId: APP_ID, // V2 binary format assumes correct appId for compactness
    mode,
    issuedAt,
    expiry,
    deviceId: deviceId || undefined,
    signature
  };
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
    `${license.appId}|${license.issuedAt}|${license.expiry}|${license.deviceId ?? ""}|${license.mode ?? "full"}`
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
  // Temporarily disabled per user request: Open Access Mode
  return true;
}

/** Get current license info plus trial status. */
export async function getLicenseDetails() {
  // Return a dummy 'Permanent Premium' license for Open Access Mode
  return {
    appId: APP_ID,
    mode: "full",
    issuedAt: Date.now(),
    expiry: Date.now() + 1000 * 60 * 60 * 24 * 365 * 10, // 10 years
    isExpired: false,
    daysLeft: 3650,
    isTrial: false,
    nearExpiry: false,
    signature: "OPEN_ACCESS"
  };
}

/** Utility to check if a feature is allowed. */
export async function isFeatureAllowed(feature: "anki" | "bundle" | "pip"): Promise<boolean> {
  // All features allowed in Open Access Mode
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
