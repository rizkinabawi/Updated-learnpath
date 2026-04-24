/**
 * _lib.mjs — shared CLI helpers (Ed25519 setup, hex/base64, canonical JSON,
 * AES-256-GCM, dynamic unlock token). Pure JS, no native modules.
 *
 * Mirrors `artifacts/mobile/utils/security/crypto.ts` exactly so the in-app
 * verifier and the offline CLI agree byte-for-byte.
 */
import * as ed from "@noble/ed25519";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { concatBytes, randomBytes as nobleRandomBytes } from "@noble/hashes/utils.js";
import { gcm } from "@noble/ciphers/aes.js";

ed.hashes.sha512 = sha512;
ed.hashes.sha512Async = async (...m) => sha512(concatBytes(...m));

export const randomBytes = (n) => nobleRandomBytes(n);

export const toHex = (b) =>
  Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");

export const fromHex = (h) => {
  const clean = String(h).replace(/[^0-9a-fA-F]/g, "");
  if (clean.length % 2 !== 0) throw new Error("hex length odd");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
};

export const toBase64 = (b) => Buffer.from(b).toString("base64");
export const fromBase64 = (s) => new Uint8Array(Buffer.from(s, "base64"));

export const utf8 = (s) => new TextEncoder().encode(s);

export function canonicalJson(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(v[k])).join(",") + "}";
}

export const sha256Hex = (b) => toHex(sha256(b));
export const sha256OfString = (s) => sha256Hex(utf8(s));

export const ed25519Sign = (sk, msg) => ed.signAsync(msg, sk);
export const ed25519GetPublicKey = (sk) => ed.getPublicKeyAsync(sk);
export const ed25519RandomSecret = () => ed.utils.randomSecretKey();

export function deriveEncryptionKey(password) {
  return sha256(utf8(password));
}

export function hashPassword(password) {
  return sha256OfString(password);
}

export function aesEncrypt(key, plaintext) {
  if (key.length !== 32) throw new Error("AES-256 requires a 32-byte key");
  const iv = randomBytes(12);
  const cipher = gcm(key, iv);
  const ct = cipher.encrypt(plaintext);
  const blob = new Uint8Array(iv.length + ct.length);
  blob.set(iv, 0);
  blob.set(ct, iv.length);
  return toBase64(blob);
}

export function aesDecrypt(key, payloadB64) {
  const blob = fromBase64(payloadB64);
  const iv = blob.subarray(0, 12);
  const ct = blob.subarray(12);
  const cipher = gcm(key, iv);
  return cipher.decrypt(ct);
}

/** Dynamic unlock token: SHA256(password + bundleId + timeWindow). */
export function generateUnlockToken(password, bundleId, nowMs = Date.now()) {
  const window = Math.floor(nowMs / 1000 / 3600);
  return sha256OfString(`${password}${bundleId}${window}`);
}

/** creatorId = first 32 hex chars of sha256("creator:" + publicKeyHex). */
export function deriveCreatorId(publicKeyHex) {
  return sha256OfString(`creator:${publicKeyHex}`).slice(0, 32);
}

// ─── tiny argv parser ────────────────────────────────────────────────────────
export function parseFlags(argv) {
  const out = {};
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const [k, ...rest] = a.replace(/^--/, "").split("=");
    out[k] = rest.length === 0 ? true : rest.join("=");
  }
  return out;
}

// ─── load private key (env > file) ───────────────────────────────────────────
import { readFileSync, existsSync } from "node:fs";
export function loadPrivateKey(envName, filePath) {
  let hex = process.env[envName];
  if (!hex && filePath && existsSync(filePath)) {
    hex = readFileSync(filePath, "utf8").trim();
  }
  if (!hex) {
    throw new Error(
      `Private key not found. Set $${envName} or place hex at ${filePath}`
    );
  }
  const sk = fromHex(hex);
  if (sk.length !== 32) throw new Error("private key must be 32 bytes");
  return sk;
}
