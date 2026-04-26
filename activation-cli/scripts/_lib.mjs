/**
 * _lib.mjs — shared CLI helpers
 */
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { concatBytes, randomBytes as nobleRandomBytes } from "@noble/hashes/utils.js";

// v3 Noble setup
try {
  if (ed.etc && Object.isExtensible(ed.etc)) {
    ed.etc.sha512Sync = (...m) => sha512(concatBytes(...m));
    ed.etc.sha512Async = async (...m) => sha512(concatBytes(...m));
  }
} catch (e) {}

export const randomBytes = (n) => nobleRandomBytes(n);
export const toHex = (b) => Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
export const fromHex = (h) => {
  const clean = h.replace(/[^0-9a-fA-F]/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
};

const B64A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export const toBase64 = (bytes) => {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64A[a >> 2]; out += B64A[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64A[((b & 15) << 2) | (c >> 6)] : "=";
    out += i + 2 < bytes.length ? B64A[c & 63] : "=";
  }
  return out;
};
export const fromBase64 = (b64) => {
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, "").replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let idx = 0, buf = 0, bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = B64A.indexOf(clean[i]);
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out[idx++] = (buf >> bits) & 0xff; }
  }
  return out.slice(0, idx);
};

// Deterministic UTF-8 (MATCHES APP)
export const utf8 = (s) => {
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) { bytes.push(0xc0 | (c >> 6)); bytes.push(0x80 | (c & 0x3f)); }
    else if (c < 0xd800 || c >= 0xe000) {
      bytes.push(0xe0 | (c >> 12)); bytes.push(0x80 | ((c >> 6) & 0x3f)); bytes.push(0x80 | (c & 0x3f));
    } else {
      i++; c = 0x10000 + (((c & 0x3ff) << 10) | (s.charCodeAt(i) & 0x3ff));
      bytes.push(0xf0 | (c >> 18)); bytes.push(0x80 | ((c >> 12) & 0x3f));
      bytes.push(0x80 | ((c >> 6) & 0x3f)); bytes.push(0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(bytes);
};

export const fromUtf8 = (b) => {
  let s = "";
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c < 0x80) s += String.fromCharCode(c);
    else if (c < 0xe0) { s += String.fromCharCode(((c & 0x1f) << 6) | (b[++i] & 0x3f)); }
    else if (c < 0xf0) { s += String.fromCharCode(((c & 0x0f) << 12) | ((b[++i] & 0x3f) << 6) | (b[++i] & 0x3f)); }
    else {
      let code = ((c & 0x07) << 18) | ((b[++i] & 0x3f) << 12) | ((b[++i] & 0x3f) << 6) | (b[++i] & 0x3f);
      s += String.fromCodePoint(code);
    }
  }
  return s;
};

export const ed25519Sign = (sk, msg) => ed.signAsync(msg, sk);
export function parseFlags(argv) {
  const out = {};
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const [k, ...rest] = a.replace(/^--/, "").split("=");
    out[k] = rest.length === 0 ? true : rest.join("=");
  }
  return out;
}

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
/** load private key */
export function loadPrivateKey(envName, filePath) {
  let hex = process.env[envName];
  if (!hex && filePath && existsSync(filePath)) hex = readFileSync(filePath, "utf8").trim();
  if (!hex) throw new Error("Private key not found.");
  return fromHex(hex);
}
