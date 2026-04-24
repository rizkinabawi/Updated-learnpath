/**
 * bundle-crypto.ts
 *
 * Pure-JS Ed25519 verification for bundle signatures and activation keys.
 * Works offline, no native modules, no backend.
 *
 * Algorithm:
 *   - hash:      SHA-256 (content) / SHA-512 (Ed25519 internal)
 *   - signature: Ed25519
 *   - canonical: deterministic JSON.stringify with recursively sorted keys
 *
 * Wire format (signed bundle JSON):
 *   {
 *     bundleId:    string,
 *     creator:     string,
 *     contentHash: hex(sha256(canonicalJson(packData))),
 *     signature:   base64(ed25519(sk, `${bundleId}|${creator}|${contentHash}`)),
 *     ...packData
 *   }
 *
 * Wire format (activation key JSON):
 *   {
 *     bundleId:  string,
 *     issuedAt:  number (ms epoch),
 *     expiry:    number (ms epoch),
 *     signature: base64(ed25519(sk, `${bundleId}|${issuedAt}|${expiry}`)),
 *   }
 */

import * as ed from "@noble/ed25519";
import { sha512, sha256 } from "@noble/hashes/sha2.js";
import { concatBytes } from "@noble/hashes/utils.js";
import { BUNDLE_PUBLIC_KEY_HEX } from "./bundle-public-key";

ed.hashes.sha512 = sha512;
ed.hashes.sha512Async = async (...m: Uint8Array[]) => sha512(concatBytes(...m));

// ─── Hex / Base64 helpers ────────────────────────────────────────────────────

export const toHex = (b: Uint8Array): string =>
  Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

export const fromHex = (h: string): Uint8Array => {
  const clean = h.replace(/[^0-9a-fA-F]/g, "");
  if (clean.length % 2 !== 0) throw new Error("hex length odd");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
};

const B64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export const toBase64 = (bytes: Uint8Array): string => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[c & 63] : "=";
  }
  return out;
};

export const fromBase64 = (b64: string): Uint8Array => {
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, "");
  const padless = clean.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((padless.length * 3) / 4));
  let outIdx = 0;
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < padless.length; i++) {
    const v = B64.indexOf(padless[i]);
    if (v < 0) throw new Error("invalid base64");
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[outIdx++] = (buf >> bits) & 0xff;
    }
  }
  return out.slice(0, outIdx);
};

// ─── Canonical JSON (deterministic, sorted keys, recursive) ──────────────────

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k]))
      .join(",") +
    "}"
  );
}

// ─── Public types ────────────────────────────────────────────────────────────

export interface BundleEnvelope {
  bundleId: string;
  creator: string;
  contentHash: string; // hex
  signature: string;   // base64
  // ...rest of bundle data lives alongside these wrapper fields
  [k: string]: unknown;
}

export interface ActivationKey {
  bundleId: string;
  issuedAt: number;
  expiry: number;
  signature: string; // base64
}

export type VerifyError =
  | "MISSING_FIELDS"
  | "BAD_HASH"
  | "BAD_SIGNATURE"
  | "EXPIRED"
  | "BUNDLE_MISMATCH"
  | "BAD_PUBLIC_KEY";

// ─── Signature verification ──────────────────────────────────────────────────

const PUBLIC_KEY = (() => {
  try {
    return fromHex(BUNDLE_PUBLIC_KEY_HEX);
  } catch {
    return null;
  }
})();

/** Returns null on success, or a typed error code on failure. */
export async function verifyBundleSignature(
  envelope: unknown
): Promise<VerifyError | null> {
  if (!PUBLIC_KEY || PUBLIC_KEY.length !== 32) return "BAD_PUBLIC_KEY";
  if (!envelope || typeof envelope !== "object") return "MISSING_FIELDS";
  const e = envelope as Partial<BundleEnvelope>;
  if (
    typeof e.bundleId !== "string" ||
    typeof e.creator !== "string" ||
    typeof e.contentHash !== "string" ||
    typeof e.signature !== "string"
  ) {
    return "MISSING_FIELDS";
  }

  // Recompute SHA-256 over canonical JSON of pack data (envelope minus wrapper).
  const packData: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(envelope as Record<string, unknown>)) {
    if (k === "bundleId" || k === "creator" || k === "contentHash" || k === "signature") {
      continue;
    }
    packData[k] = v;
  }
  const contentBytes = new TextEncoder().encode(canonicalJson(packData));
  const recomputed = toHex(sha256(contentBytes));
  if (recomputed !== e.contentHash) return "BAD_HASH";

  // Verify Ed25519 signature.
  let sig: Uint8Array;
  try {
    sig = fromBase64(e.signature);
  } catch {
    return "BAD_SIGNATURE";
  }
  if (sig.length !== 64) return "BAD_SIGNATURE";

  const msg = new TextEncoder().encode(
    `${e.bundleId}|${e.creator}|${e.contentHash}`
  );
  try {
    const ok = await ed.verifyAsync(sig, msg, PUBLIC_KEY);
    return ok ? null : "BAD_SIGNATURE";
  } catch {
    return "BAD_SIGNATURE";
  }
}

/** Verify activation key signature & expiry. Optionally enforce bundle match. */
export async function verifyActivationKey(
  key: unknown,
  expectedBundleId?: string
): Promise<VerifyError | null> {
  if (!PUBLIC_KEY || PUBLIC_KEY.length !== 32) return "BAD_PUBLIC_KEY";
  if (!key || typeof key !== "object") return "MISSING_FIELDS";
  const k = key as Partial<ActivationKey>;
  if (
    typeof k.bundleId !== "string" ||
    typeof k.issuedAt !== "number" ||
    typeof k.expiry !== "number" ||
    typeof k.signature !== "string"
  ) {
    return "MISSING_FIELDS";
  }
  if (expectedBundleId && k.bundleId !== expectedBundleId) {
    return "BUNDLE_MISMATCH";
  }

  let sig: Uint8Array;
  try {
    sig = fromBase64(k.signature);
  } catch {
    return "BAD_SIGNATURE";
  }
  if (sig.length !== 64) return "BAD_SIGNATURE";

  const msg = new TextEncoder().encode(
    `${k.bundleId}|${k.issuedAt}|${k.expiry}`
  );
  let ok = false;
  try {
    ok = await ed.verifyAsync(sig, msg, PUBLIC_KEY);
  } catch {
    return "BAD_SIGNATURE";
  }
  if (!ok) return "BAD_SIGNATURE";

  if (Date.now() > k.expiry) return "EXPIRED";

  return null;
}

/** Try to parse an activation key from raw text input (JSON or bare base64-of-JSON). */
export function parseActivationKeyInput(raw: string): ActivationKey | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Try direct JSON
  try {
    const obj = JSON.parse(trimmed);
    if (obj && typeof obj === "object" && "signature" in obj) {
      return obj as ActivationKey;
    }
  } catch {
    /* not JSON, fall through */
  }
  // Try base64-of-JSON
  try {
    const bytes = fromBase64(trimmed);
    const text = new TextDecoder().decode(bytes);
    const obj = JSON.parse(text);
    if (obj && typeof obj === "object" && "signature" in obj) {
      return obj as ActivationKey;
    }
  } catch {
    /* not base64-JSON */
  }
  return null;
}

/** Human-friendly error message in Indonesian. */
export function describeVerifyError(err: VerifyError): string {
  switch (err) {
    case "MISSING_FIELDS":
      return "Format tidak lengkap.";
    case "BAD_HASH":
      return "Bundle telah dimodifikasi (hash konten tidak cocok).";
    case "BAD_SIGNATURE":
      return "Tanda tangan tidak valid.";
    case "EXPIRED":
      return "Kunci aktivasi sudah kedaluwarsa.";
    case "BUNDLE_MISMATCH":
      return "Kunci aktivasi tidak cocok dengan bundle ini.";
    case "BAD_PUBLIC_KEY":
      return "Konfigurasi public key aplikasi rusak.";
  }
}
