/**
 * device.ts
 *
 * Stable per-install device identifier used for binding activation keys
 * (Section 1: optional `deviceId` field) and creator identity.
 *
 *   - Android: ANDROID_ID
 *   - iOS:     identifierForVendor
 *   - Other:   random UUIDv4 persisted on first call
 *
 * The first-seen value is cached in secure storage so it survives even if
 * the OS-level identifier rotates (best-effort device binding under TOFU).
 */

import * as Application from "expo-application";
import { Platform } from "react-native";
import { secureGet, secureSet } from "./secure-storage";
import { randomBytes, toHex } from "./crypto";

const KEY_DEVICE_ID = "lp.security.deviceId";

let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  const stored = await secureGet(KEY_DEVICE_ID);
  if (stored && stored.length > 0) {
    cached = stored;
    return stored;
  }

  let derived: string | null = null;
  try {
    if (Platform.OS === "android") {
      derived = Application.getAndroidId() ?? null;
    } else if (Platform.OS === "ios") {
      derived = await Application.getIosIdForVendorAsync();
    }
  } catch {
    derived = null;
  }

  if (!derived || derived.length === 0) derived = randomUuid();

  cached = derived;
  await secureSet(KEY_DEVICE_ID, derived);
  return derived;
}

function randomUuid(): string {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40; // v4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10
  const h = toHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
