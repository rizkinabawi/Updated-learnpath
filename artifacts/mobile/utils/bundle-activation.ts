/**
 * bundle-activation.ts
 *
 * Persistent state for the bundle activation system:
 *   - unlocked bundle IDs (with bound device + activation timestamp)
 *   - per-install device ID (best-effort device binding, TOFU model)
 *
 * Storage backend: expo-secure-store (iOS Keychain / Android Keystore).
 * Falls back to AsyncStorage on platforms where secure-store is unavailable
 * (e.g. web), so the same API works everywhere.
 */

import * as SecureStore from "expo-secure-store";
import * as Application from "expo-application";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const KEY_UNLOCKED = "lp.bundle.unlocked";
const KEY_DEVICE_ID = "lp.bundle.deviceId";

interface UnlockEntry {
  bundleId: string;
  deviceId: string;     // device this entry is bound to
  unlockedAt: number;   // ms epoch
  expiry: number;       // ms epoch (copied from activation key)
}

interface UnlockedStore {
  entries: UnlockEntry[];
}

// ─── Storage backend abstraction ─────────────────────────────────────────────

const secureAvailable = Platform.OS === "ios" || Platform.OS === "android";

async function storeGet(key: string): Promise<string | null> {
  if (secureAvailable) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  }
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function storeSet(key: string, value: string): Promise<void> {
  if (secureAvailable) {
    try {
      await SecureStore.setItemAsync(key, value);
      return;
    } catch {
      /* fall through to AsyncStorage */
    }
  }
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    /* swallow */
  }
}

// ─── Device ID (best-effort, persisted) ──────────────────────────────────────

let cachedDeviceId: string | null = null;

/**
 * Returns a stable device ID:
 *   - Android: ANDROID_ID (Settings.Secure.ANDROID_ID)
 *   - iOS:     identifierForVendor
 *   - Web/fallback: random uuid persisted in secure storage
 *
 * The result is cached in secure storage on first call so it survives even if
 * the underlying platform value changes (best-effort device binding).
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  const stored = await storeGet(KEY_DEVICE_ID);
  if (stored && stored.length > 0) {
    cachedDeviceId = stored;
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

  if (!derived || derived.length === 0) {
    // Random UUID v4 fallback (web / unsupported)
    derived = randomUuid();
  }

  cachedDeviceId = derived;
  await storeSet(KEY_DEVICE_ID, derived);
  return derived;
}

function randomUuid(): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ─── Unlock store (read/write) ───────────────────────────────────────────────

async function readStore(): Promise<UnlockedStore> {
  const raw = await storeGet(KEY_UNLOCKED);
  if (!raw) return { entries: [] };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.entries)) {
      return { entries: parsed.entries.filter(isUnlockEntry) };
    }
  } catch {
    /* corrupted, reset */
  }
  return { entries: [] };
}

function isUnlockEntry(v: unknown): v is UnlockEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.bundleId === "string" &&
    typeof e.deviceId === "string" &&
    typeof e.unlockedAt === "number" &&
    typeof e.expiry === "number"
  );
}

async function writeStore(store: UnlockedStore): Promise<void> {
  await storeSet(KEY_UNLOCKED, JSON.stringify(store));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** True iff the bundle is unlocked on the current device and not expired. */
export async function isBundleUnlocked(bundleId: string): Promise<boolean> {
  const [store, deviceId] = await Promise.all([readStore(), getDeviceId()]);
  const entry = store.entries.find((e) => e.bundleId === bundleId);
  if (!entry) return false;
  if (entry.deviceId !== deviceId) return false; // device-binding violation
  if (Date.now() > entry.expiry) return false;
  return true;
}

/** Persist a successful activation. Idempotent — replaces any existing entry for the same bundleId. */
export async function recordUnlock(
  bundleId: string,
  expiry: number
): Promise<void> {
  const [store, deviceId] = await Promise.all([readStore(), getDeviceId()]);
  const filtered = store.entries.filter((e) => e.bundleId !== bundleId);
  filtered.push({
    bundleId,
    deviceId,
    unlockedAt: Date.now(),
    expiry,
  });
  await writeStore({ entries: filtered });
}

/** List all currently unlocked bundles for this device (debug / settings UI). */
export async function listUnlockedBundles(): Promise<UnlockEntry[]> {
  const [store, deviceId] = await Promise.all([readStore(), getDeviceId()]);
  return store.entries.filter(
    (e) => e.deviceId === deviceId && Date.now() <= e.expiry
  );
}

/** Remove an unlock (e.g. user deactivates a bundle). */
export async function revokeUnlock(bundleId: string): Promise<void> {
  const store = await readStore();
  await writeStore({
    entries: store.entries.filter((e) => e.bundleId !== bundleId),
  });
}

/** Wipe all activation state (e.g. logout / factory reset). */
export async function clearAllActivations(): Promise<void> {
  await writeStore({ entries: [] });
}
