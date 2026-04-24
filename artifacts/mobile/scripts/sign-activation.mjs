#!/usr/bin/env node
/**
 * sign-activation.mjs — issue an activation key for a specific bundleId.
 *
 * Output: a JSON document the end-user pastes into the bundle activation
 * screen of the LearningPath app:
 *
 *   { bundleId, issuedAt, expiry, signature }
 *
 * Private key source:
 *   1. $BUNDLE_PRIVATE_KEY env var (hex), OR
 *   2. ./keys/private-key.hex
 *
 * Usage:
 *   node scripts/sign-activation.mjs --bundleId=my-bundle [--days=365] [--out=key.json]
 */
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { concatBytes } from "@noble/hashes/utils.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

ed.hashes.sha512 = sha512;
ed.hashes.sha512Async = async (...m) => sha512(concatBytes(...m));

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const args = process.argv.slice(2);
const flags = Object.fromEntries(
  args
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, ...rest] = a.replace(/^--/, "").split("=");
      return [k, rest.join("=") || true];
    })
);

if (!flags.bundleId) {
  console.error(
    "Usage: node scripts/sign-activation.mjs --bundleId=<id> [--days=365] [--out=<path>]"
  );
  process.exit(2);
}

const bundleId = String(flags.bundleId);
const days = Number(flags.days || 365);
const outputPath = flags.out || null;

let skHex = process.env.BUNDLE_PRIVATE_KEY;
if (!skHex) {
  const keyPath = join(ROOT, "keys", "private-key.hex");
  if (!existsSync(keyPath)) {
    console.error(
      "Private key not found. Run `node scripts/keygen.mjs` first or set $BUNDLE_PRIVATE_KEY."
    );
    process.exit(2);
  }
  skHex = readFileSync(keyPath, "utf8").trim();
}
const sk = Uint8Array.from(skHex.match(/.{2}/g).map((x) => parseInt(x, 16)));
if (sk.length !== 32) {
  console.error("Private key must be 32 bytes (64 hex chars).");
  process.exit(2);
}

const issuedAt = Date.now();
const expiry = issuedAt + days * 24 * 60 * 60 * 1000;
const msg = new TextEncoder().encode(`${bundleId}|${issuedAt}|${expiry}`);
const sig = await ed.signAsync(msg, sk);
const signatureB64 = Buffer.from(sig).toString("base64");

const key = { bundleId, issuedAt, expiry, signature: signatureB64 };
const json = JSON.stringify(key, null, 2);

if (outputPath) {
  writeFileSync(outputPath, json);
  console.log("Activation key written:", outputPath);
} else {
  console.log(json);
}

console.log("");
console.log("  bundleId :", bundleId);
console.log("  issuedAt :", new Date(issuedAt).toISOString());
console.log("  expiry   :", new Date(expiry).toISOString(), `(${days} days)`);
