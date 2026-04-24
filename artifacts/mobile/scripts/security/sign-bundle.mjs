#!/usr/bin/env node
/**
 * sign-bundle.mjs — produce a signed + encrypted bundle (Sections 3-9).
 *
 * Reads:  a JSON file containing the raw content { cards: [...], media: {...} }
 * Writes: a SignedBundle JSON file ready to ship to consumers.
 *
 * Wire format:
 *   {
 *     bundleId, creatorId, creatorPublicKey,
 *     contentHash, signature,
 *     passwordHash, encryptedContent
 *   }
 *
 * Private key source:
 *   --creatorKey=<path-to-private-hex>   (preferred)
 *   $CREATOR_PRIVATE_KEY env var (hex)
 *
 * Usage:
 *   node scripts/security/sign-bundle.mjs <input.json> \
 *        --bundleId=demo-bundle \
 *        --password=hunter2 \
 *        --creatorKey=keys/security/creator-XXXX-private.hex \
 *        [--out=bundle.json]
 *
 * Input file shape:
 *   {
 *     "cards": [ { "q": "...", "a": "..." }, ... ],
 *     "media": { "img1.png": "<base64 of bytes>", ... }
 *   }
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aesEncrypt,
  canonicalJson,
  deriveCreatorId,
  deriveEncryptionKey,
  ed25519GetPublicKey,
  ed25519Sign,
  fromHex,
  hashPassword,
  parseFlags,
  sha256OfString,
  toBase64,
  toHex,
  utf8,
} from "./_lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const flags = parseFlags(args);

if (
  positional.length === 0 ||
  !flags.bundleId ||
  !flags.password
) {
  console.error(
    "Usage: node scripts/security/sign-bundle.mjs <input.json> " +
      "--bundleId=<id> --password=<pw> [--creatorKey=<path>] [--out=<path>]"
  );
  process.exit(2);
}

const inputPath = positional[0];
const outputPath =
  (flags.out && String(flags.out)) ||
  join(dirname(inputPath), "signed-" + basename(inputPath));
const bundleId = String(flags.bundleId);
const password = String(flags.password);

// ─── load creator private key ───────────────────────────────────────────────
let skHex = process.env.CREATOR_PRIVATE_KEY;
if (flags.creatorKey) {
  const p = String(flags.creatorKey);
  if (!existsSync(p)) {
    console.error("Creator key not found:", p);
    process.exit(2);
  }
  skHex = readFileSync(p, "utf8").trim();
}
if (!skHex) {
  console.error(
    "Creator private key required. Pass --creatorKey=<file> or $CREATOR_PRIVATE_KEY."
  );
  process.exit(2);
}
const sk = fromHex(skHex);
if (sk.length !== 32) {
  console.error("Creator private key must be 32 bytes (64 hex chars).");
  process.exit(2);
}
const pk = await ed25519GetPublicKey(sk);
const pkHex = toHex(pk);
const pkB64 = toBase64(pk);
const creatorId = deriveCreatorId(pkHex);

// ─── load + normalise content ───────────────────────────────────────────────
const raw = JSON.parse(readFileSync(inputPath, "utf8"));
if (!raw || !Array.isArray(raw.cards) || typeof raw.media !== "object" || raw.media === null) {
  console.error(
    'Input must be {"cards":[...], "media":{filename:base64,...}}'
  );
  process.exit(2);
}
const content = { cards: raw.cards, media: raw.media };

// ─── content hash (Section 4) ───────────────────────────────────────────────
const canonical = canonicalJson(content);
const contentHash = sha256OfString(canonical);

// ─── encryption (Section 5) ─────────────────────────────────────────────────
const key = deriveEncryptionKey(password);
const encryptedContent = aesEncrypt(key, utf8(canonical));

// ─── password hash (Section 6) ──────────────────────────────────────────────
const passwordHash = hashPassword(password);

// ─── signature (Section 3) ──────────────────────────────────────────────────
const sigMsg = utf8(`${bundleId}|${creatorId}|${contentHash}`);
const sig = await ed25519Sign(sk, sigMsg);

const bundle = {
  bundleId,
  creatorId,
  creatorPublicKey: pkB64,
  contentHash,
  signature: toBase64(sig),
  passwordHash,
  encryptedContent,
};

writeFileSync(outputPath, JSON.stringify(bundle, null, 2) + "\n");

console.log("Signed bundle written:");
console.log("  in : " + inputPath);
console.log("  out: " + outputPath);
console.log("  bundleId         :", bundleId);
console.log("  creatorId        :", creatorId);
console.log("  creatorPublicKey :", pkB64);
console.log("  contentHash      :", contentHash);
console.log("  signature        :", bundle.signature);
console.log("  passwordHash     :", passwordHash);
console.log("  encryptedContent :", encryptedContent.slice(0, 32) + "…");
