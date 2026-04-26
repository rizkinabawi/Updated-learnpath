/**
 * security/crypto.ts
 *
 * Cryptographic primitives shared by the offline secure system.
 */

import * as ed from "@noble/ed25519";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { concatBytes, randomBytes as nobleRandomBytes } from "@noble/hashes/utils.js";
import { gcm } from "@noble/ciphers/aes.js";

// ─── Global Crypto Shim ──────────────────────────────────────────────────────
let ExpoCrypto: any = null;
try {
  ExpoCrypto = require("expo-crypto");
  if (typeof global.crypto === "undefined" && ExpoCrypto?.getRandomBytes) {
    (global as any).crypto = {
      getRandomValues: (arr: any) => {
        const bytes = ExpoCrypto.getRandomBytes(arr.length);
        for (let i = 0; i < arr.length; i++) arr[i] = bytes[i];
        return arr;
      },
    };
  }
} catch (e) {}

// Noble v2/v3 compatibility
try {
  // In v3 ed.etc is often frozen, we must be careful
  if (ed.etc && Object.isExtensible(ed.etc)) {
    Object.assign(ed.etc, {
      sha512Sync: (...m: Uint8Array[]) => sha512(concatBytes(...m)),
      sha512Async: async (...m: Uint8Array[]) => sha512(concatBytes(...m)),
    });
  }
  const edAny = ed as any;
  if (!edAny.hashes) edAny.hashes = {};
  edAny.hashes.sha512 = sha512;
  edAny.hashes.sha512Async = async (...m: Uint8Array[]) => sha512(concatBytes(...m));
} catch (e) {}

export function randomBytes(n: number): Uint8Array {
  if (ExpoCrypto?.getRandomBytes) {
    try { return ExpoCrypto.getRandomBytes(n); } catch {}
  }
  return nobleRandomBytes(n);
}

// ─── Deterministic UTF-8 ───
// We use a manual encoder to ensure byte-for-byte identity across Node, Browser, and React Native.
export const utf8 = (s: string): Uint8Array => {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6));
      bytes.push(0x80 | (c & 0x3f));
    } else if (c < 0xd800 || c >= 0xe000) {
      bytes.push(0xe0 | (c >> 12));
      bytes.push(0x80 | ((c >> 6) & 0x3f));
      bytes.push(0x80 | (c & 0x3f));
    } else {
      i++;
      c = 0x10000 + (((c & 0x3ff) << 10) | (s.charCodeAt(i) & 0x3ff));
      bytes.push(0xf0 | (c >> 18));
      bytes.push(0x80 | ((c >> 12) & 0x3f));
      bytes.push(0x80 | ((c >> 6) & 0x3f));
      bytes.push(0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(bytes);
};

export const fromUtf8 = (b: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c < 0x80) s += String.fromCharCode(c);
    else if (c < 0xe0) {
      s += String.fromCharCode(((c & 0x1f) << 6) | (b[++i] & 0x3f));
    } else if (c < 0xf0) {
      s += String.fromCharCode(((c & 0x0f) << 12) | ((b[++i] & 0x3f) << 6) | (b[++i] & 0x3f));
    } else {
      let code = ((c & 0x07) << 18) | ((b[++i] & 0x3f) << 12) | ((b[++i] & 0x3f) << 6) | (b[++i] & 0x3f);
      s += String.fromCodePoint(code);
    }
  }
  return s;
};

// ─── Hex / Base64 / JSON ───
export function toHex(b: Uint8Array): string {
  let out = "";
  for (let i = 0; i < b.length; i++) out += b[i].toString(16).padStart(2, "0");
  return out;
}
export function fromHex(h: string): Uint8Array {
  const clean = h.replace(/[^0-9a-fA-F]/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

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
  let idx = 0, buf = 0, bits = 0;
  for (let i = 0; i < padless.length; i++) {
    const v = B64A.indexOf(padless[i]);
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; out[idx++] = (buf >> bits) & 0xff; }
  }
  return out.slice(0, idx);
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}

export function sha256Bytes(b: Uint8Array): Uint8Array { return sha256(b); }
export function sha256Hex(b: Uint8Array): string { return toHex(sha256(b)); }
export function sha256OfString(s: string): string { return sha256Hex(utf8(s)); }

export async function generateEd25519Keypair(): Promise<{ privateKey: Uint8Array; publicKey: Uint8Array; }> {
  const sk = randomBytes(32);
  const pk = await ed.getPublicKeyAsync(sk);
  return { privateKey: sk, publicKey: pk };
}
export async function ed25519Sign(privateKey: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  return ed.signAsync(message, privateKey);
}
export async function ed25519Verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): Promise<boolean> {
  if (publicKey.length !== 32 || signature.length !== 64) return false;
  try { return await ed.verifyAsync(signature, message, publicKey); } catch { return false; }
}

export function deriveEncryptionKey(password: string): Uint8Array { return sha256(utf8(password)); }
export function hashPassword(password: string): string { return sha256OfString(password); }

export function generateUnlockToken(password: string, bundleId: string, nowMs: number = Date.now()): string {
  const window = Math.floor(nowMs / 1000 / 3600);
  return sha256OfString(`${password}${bundleId}${window}`);
}
export function validateUnlockToken(token: string, password: string, bundleId: string, nowMs: number = Date.now()): boolean {
  const window = Math.floor(nowMs / 1000 / 3600);
  for (const w of [window - 1, window, window + 1]) {
    if (sha256OfString(`${password}${bundleId}${w}`) === token) return true;
  }
  return false;
}

export function aesEncrypt(key: Uint8Array, plaintext: Uint8Array): string {
  const iv = randomBytes(12);
  const ct = gcm(key, iv).encrypt(plaintext);
  const blob = new Uint8Array(iv.length + ct.length);
  blob.set(iv, 0); blob.set(ct, iv.length);
  return toBase64(blob);
}
export function aesDecrypt(key: Uint8Array, payloadB64: string): Uint8Array {
  const blob = fromBase64(payloadB64);
  const iv = blob.subarray(0, 12);
  const ct = blob.subarray(12);
  return gcm(key, iv).decrypt(ct);
}
export function encryptJsonWithPassword(value: unknown, password: string): string {
  return aesEncrypt(deriveEncryptionKey(password), utf8(canonicalJson(value)));
}
export function decryptJsonWithPassword<T = unknown>(payloadB64: string, password: string): T {
  return JSON.parse(fromUtf8(aesDecrypt(deriveEncryptionKey(password), payloadB64))) as T;
}
