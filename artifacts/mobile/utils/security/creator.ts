/**
 * creator.ts
 *
 * SECTION 2 — Per-user creator identity.
 *
 * Each user can become a creator. On first activation, an Ed25519 keypair is
 * generated locally and persisted to expo-secure-store. The creator's PUBLIC
 * key is embedded into every bundle they sign, allowing offline verification
 * by any consumer.
 *
 * The PRIVATE key never leaves the device.
 *
 * IDs:
 *   - creatorId  — a stable, opaque hex string derived from the public key.
 *                  This is what bundles reference. Two devices that share the
 *                  same public key (= same creator) produce the same id.
 */

import {
  ed25519Sign,
  generateEd25519Keypair,
  sha256OfString,
  toHex,
  fromHex,
} from "./crypto";
import { secureGet, secureSet, secureDelete } from "./secure-storage";

const KEY_PRIVATE = "lp.security.creator.sk";
const KEY_PUBLIC = "lp.security.creator.pk";

export interface CreatorIdentity {
  creatorId: string;        // hex digest of public key
  publicKeyHex: string;     // 32-byte Ed25519 public key (hex)
  publicKeyBase64: string;  // same key, base64 (used inside bundle)
}

export interface CreatorIdentityWithKey extends CreatorIdentity {
  privateKey: Uint8Array;   // 32 bytes
}

function deriveCreatorId(publicKeyHex: string): string {
  // 16-byte truncated SHA-256 of the public key — short enough for UI, still
  // collision-resistant for offline use.
  return sha256OfString(`creator:${publicKeyHex}`).slice(0, 32);
}

/** True iff a creator keypair already exists on this device. */
export async function hasCreatorIdentity(): Promise<boolean> {
  const sk = await secureGet(KEY_PRIVATE);
  return !!sk && sk.length > 0;
}

/** Read the public-facing identity (no private key). */
export async function getCreatorIdentity(): Promise<CreatorIdentity | null> {
  const pkHex = await secureGet(KEY_PUBLIC);
  if (!pkHex) return null;
  return {
    creatorId: deriveCreatorId(pkHex),
    publicKeyHex: pkHex,
    publicKeyBase64: hexToBase64(pkHex),
  };
}

/**
 * Read the full identity including private key. Used internally for signing.
 * NEVER expose the returned private key beyond this module's callers.
 */
export async function getCreatorIdentityWithKey(): Promise<CreatorIdentityWithKey | null> {
  const [skHex, pkHex] = await Promise.all([
    secureGet(KEY_PRIVATE),
    secureGet(KEY_PUBLIC),
  ]);
  if (!skHex || !pkHex) return null;
  return {
    creatorId: deriveCreatorId(pkHex),
    publicKeyHex: pkHex,
    publicKeyBase64: hexToBase64(pkHex),
    privateKey: fromHex(skHex),
  };
}

/**
 * Generate a fresh creator keypair and persist it. If one already exists,
 * returns the existing identity unchanged.
 */
export async function ensureCreatorIdentity(): Promise<CreatorIdentity> {
  const existing = await getCreatorIdentity();
  if (existing) return existing;

  const { privateKey, publicKey } = await generateEd25519Keypair();
  const skHex = toHex(privateKey);
  const pkHex = toHex(publicKey);

  await Promise.all([
    secureSet(KEY_PRIVATE, skHex),
    secureSet(KEY_PUBLIC, pkHex),
  ]);

  return {
    creatorId: deriveCreatorId(pkHex),
    publicKeyHex: pkHex,
    publicKeyBase64: hexToBase64(pkHex),
  };
}

/**
 * Forcibly regenerate the creator keypair (destructive — old bundles signed
 * with the previous key are still verifiable by consumers because the public
 * key is embedded in each bundle, but THIS device can no longer sign as the
 * old creator).
 */
export async function regenerateCreatorIdentity(): Promise<CreatorIdentity> {
  await Promise.all([
    secureDelete(KEY_PRIVATE),
    secureDelete(KEY_PUBLIC),
  ]);
  return ensureCreatorIdentity();
}

/** Sign an arbitrary message with this device's creator private key. */
export async function signAsCreator(message: Uint8Array): Promise<Uint8Array> {
  const id = await getCreatorIdentityWithKey();
  if (!id) throw new Error("creator identity not initialised");
  return ed25519Sign(id.privateKey, message);
}

// ─── helper: hex → base64 (avoids the round-trip through bytes in callers) ──

function hexToBase64(h: string): string {
  const bytes = fromHex(h);
  // inline tiny base64 encode — kept local to avoid importing toBase64 in case
  // of treeshake quirks.
  const A =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += A[a >> 2];
    out += A[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? A[((b & 15) << 2) | (c >> 6)] : "=";
    out += i + 2 < bytes.length ? A[c & 63] : "=";
  }
  return out;
}
