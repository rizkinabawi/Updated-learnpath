/**
 * security/crypto.ts
 *
 * Cryptographic primitives shared by the offline secure system.
 *
 *   - Ed25519 (signature)        — via @noble/ed25519
 *   - SHA-256 / SHA-512 (digest) — via @noble/hashes
 *   - AES-256-GCM (cipher)       — via @noble/ciphers
 *   - Hex / Base64 codecs
 *   - Deterministic canonical JSON (recursively sorted keys)
 *   - SHA256(password) key derivation
 *   - Dynamic time-windowed unlock token (Section 7)
 *
 * Pure JS, no native modules. Works in Expo & Node CLI.
 */

import * as ed from "@noble/ed25519";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { concatBytes, randomBytes as nobleRandomBytes } from "@noble/hashes/utils.js";
import { gcm } from "@noble/ciphers/aes.js";

// ─── Noble Ed25519 v3 Wiring ────────────────────────────────────────────────
// In v3, we must provide SHA-512 into ed.etc
ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(concatBytes(...m));
ed.etc.sha512Async = async (...m: Uint8Array[]) => sha512(concatBytes(...m));

// ─── Random bytes ────────────────────────────────────────────────────────────

export function randomBytes(n: number): Uint8Array {
  // nobleRandomBytes will use crypto.getRandomValues if available.
  // In RN/Expo Go, this is usually handled by the engine or polyfilled.
  return nobleRandomBytes(n);
}

// ─── UTF-8 (Robust with Fallback) ───────────────────────────────────────────

let TE: { encode: (s: string) => Uint8Array };
let TD: { decode: (b: Uint8Array) => string };

try {
  TE = new TextEncoder();
  TD = new TextDecoder();
} catch {
  // Basic UTF-8 implementation for environments without TextEncoder/Decoder (some older RN engines)
  TE = {
    encode: (s: string) => {
      const out = new Uint8Array(s.length * 3);
      let p = 0;
      for (let i = 0; i < s.length; i++) {
        let c = s.charCodeAt(i);
        if (c < 128) out[p++] = c;
        else if (c < 2048) {
          out[p++] = (c >> 6) | 192;
          out[p++] = (c & 63) | 128;
        } else {
          out[p++] = (c >> 12) | 224;
          out[p++] = ((c >> 6) & 63) | 128;
          out[p++] = (c & 63) | 128;
        }
      }
      return out.subarray(0, p);
    }
  };
  TD = {
    decode: (b: Uint8Array) => {
      let out = "";
      let i = 0;
      while (i < b.length) {
        const c = b[i++];
        if (c < 128) out += String.fromCharCode(c);
        else if (c > 191 && c < 224) out += String.fromCharCode(((c & 31) << 6) | (b[i++] & 63));
        else out += String.fromCharCode(((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63));
      }
      return out;
    }
  };
}

export const utf8 = (s: string) => TE.encode(s);
export const fromUtf8 = (b: Uint8Array) => TD.decode(b);

// ─── Hex codec ───────────────────────────────────────────────────────────────

export function toHex(b: Uint8Array): string {
  let out = "";
  for (let i = 0; i < b.length; i++) out += b[i].toString(16).padStart(2, "0");
  return out;
}

export function fromHex(h: string): Uint8Array {
  const clean = h.replace(/[^0-9a-fA-F]/g, "");
  if (clean.length % 2 !== 0) throw new Error("hex length odd");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

// ─── Base64 codec (no Buffer dependency, works in RN) ───────────────────────

const B64A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64A[a >> 2];
    out += B64A[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64A[((b & 15) << 2) | (c >> 6)] : "=";
    out += i + 2 < bytes.length ? B64A[c & 63] : "=";
  }
  return out;
}

export function fromBase64(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, "");
  const padless = clean.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((padless.length * 3) / 4));
  let idx = 0;
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < padless.length; i++) {
    const v = B64A.indexOf(padless[i]);
    if (v < 0) throw new Error("invalid base64");
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[idx++] = (buf >> bits) & 0xff;
    }
  }
  return out.slice(0, idx);
}

// ─── Canonical JSON (deterministic, recursively sorted keys) ────────────────

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") +
    "}"
  );
}

// ─── SHA-256 helpers ─────────────────────────────────────────────────────────

export function sha256Bytes(b: Uint8Array): Uint8Array {
  return sha256(b);
}

export function sha256Hex(b: Uint8Array): string {
  return toHex(sha256(b));
}

/** SHA-256 of a UTF-8 string. */
export function sha256OfString(s: string): string {
  return sha256Hex(utf8(s));
}

// ─── Ed25519 ─────────────────────────────────────────────────────────────────

export async function generateEd25519Keypair(): Promise<{
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}> {
  const sk = ed.utils.randomSecretKey();
  const pk = await ed.getPublicKeyAsync(sk);
  return { privateKey: sk, publicKey: pk };
}

export async function ed25519Sign(
  privateKey: Uint8Array,
  message: Uint8Array
): Promise<Uint8Array> {
  return ed.signAsync(message, privateKey);
}

export async function ed25519Verify(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
): Promise<boolean> {
  if (publicKey.length !== 32 || signature.length !== 64) return false;
  try {
    return await ed.verifyAsync(signature, message, publicKey);
  } catch {
    return false;
  }
}

// ─── Password handling (Sections 5 & 6) ─────────────────────────────────────

/**
 * Encryption key = SHA-256(password). Returns 32 bytes for AES-256.
 * NOTE: the spec mandates this exact derivation. We do not add salt because
 * the spec requires deterministic derivation for offline operation.
 */
export function deriveEncryptionKey(password: string): Uint8Array {
  return sha256(utf8(password));
}

/** Stored password hash (Section 6). Hex SHA-256. */
export function hashPassword(password: string): string {
  return sha256OfString(password);
}

// ─── Dynamic unlock token (Section 7) ────────────────────────────────────────

/**
 * timeWindow = floor(currentTimeSeconds / 3600)
 * token      = SHA-256(password + bundleId + timeWindow)
 *
 * The validator accepts the current ±1 window (≈ ±1 hour drift).
 */
export function generateUnlockToken(
  password: string,
  bundleId: string,
  nowMs: number = Date.now()
): string {
  const window = Math.floor(nowMs / 1000 / 3600);
  return sha256OfString(`${password}${bundleId}${window}`);
}

export function validateUnlockToken(
  token: string,
  password: string,
  bundleId: string,
  nowMs: number = Date.now()
): boolean {
  const window = Math.floor(nowMs / 1000 / 3600);
  for (const w of [window - 1, window, window + 1]) {
    const expected = sha256OfString(`${password}${bundleId}${w}`);
    if (constantTimeEqual(expected, token)) return true;
  }
  return false;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── AES-256-GCM (Section 5) ─────────────────────────────────────────────────

/**
 * Encrypts plaintext with key (32 bytes). Returns base64-encoded payload
 * containing a fresh 12-byte IV concatenated with the ciphertext+tag.
 *
 * Wire format (binary, then base64):  IV(12) || ciphertext || tag(16)
 */
export function aesEncrypt(key: Uint8Array, plaintext: Uint8Array): string {
  if (key.length !== 32) throw new Error("AES-256 requires a 32-byte key");
  const iv = randomBytes(12);
  const cipher = gcm(key, iv);
  const ct = cipher.encrypt(plaintext);
  const blob = new Uint8Array(iv.length + ct.length);
  blob.set(iv, 0);
  blob.set(ct, iv.length);
  return toBase64(blob);
}

/**
 * Decrypts a base64 payload produced by aesEncrypt(). Throws on auth failure
 * (wrong key, tampered ciphertext, truncated payload, etc).
 */
export function aesDecrypt(key: Uint8Array, payloadB64: string): Uint8Array {
  if (key.length !== 32) throw new Error("AES-256 requires a 32-byte key");
  const blob = fromBase64(payloadB64);
  if (blob.length < 12 + 16) throw new Error("ciphertext too short");
  const iv = blob.subarray(0, 12);
  const ct = blob.subarray(12);
  const cipher = gcm(key, iv);
  return cipher.decrypt(ct);
}

/** Convenience: encrypt arbitrary JSON value with a password. */
export function encryptJsonWithPassword(value: unknown, password: string): string {
  const key = deriveEncryptionKey(password);
  const plaintext = utf8(canonicalJson(value));
  return aesEncrypt(key, plaintext);
}

/** Convenience: decrypt JSON produced by encryptJsonWithPassword. */
export function decryptJsonWithPassword<T = unknown>(
  payloadB64: string,
  password: string
): T {
  const key = deriveEncryptionKey(password);
  const plaintext = aesDecrypt(key, payloadB64);
  return JSON.parse(fromUtf8(plaintext)) as T;
}
