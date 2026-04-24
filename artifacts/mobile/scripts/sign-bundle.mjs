#!/usr/bin/env node
/**
 * sign-bundle.mjs — sign a CoursePack JSON file with the bundle private key.
 *
 * Reads:  the input pack JSON
 * Writes: a NEW JSON with the wrapper fields prepended:
 *           { bundleId, creator, contentHash, signature, ...packData }
 *
 * The contentHash is SHA-256 of canonicalJson(packData) where packData is
 * the input file with any pre-existing wrapper fields stripped.
 *
 * Private key source:
 *   1. $BUNDLE_PRIVATE_KEY env var (hex), OR
 *   2. ./keys/private-key.hex
 *
 * Usage:
 *   node scripts/sign-bundle.mjs <input.json> --bundleId=my-bundle --creator="Alice" [--out=signed.json]
 */
import * as ed from "@noble/ed25519";
import { sha512, sha256 } from "@noble/hashes/sha2.js";
import { concatBytes } from "@noble/hashes/utils.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

ed.hashes.sha512 = sha512;
ed.hashes.sha512Async = async (...m) => sha512(concatBytes(...m));

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── arg parsing ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const flags = Object.fromEntries(
  args
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, ...rest] = a.replace(/^--/, "").split("=");
      return [k, rest.join("=") || true];
    })
);

if (positional.length === 0 || !flags.bundleId || !flags.creator) {
  console.error(
    "Usage: node scripts/sign-bundle.mjs <input.json> --bundleId=<id> --creator=<name> [--out=<path>]"
  );
  process.exit(2);
}

const inputPath = positional[0];
const outputPath =
  flags.out || join(dirname(inputPath), "signed-" + basename(inputPath));
const bundleId = String(flags.bundleId);
const creator = String(flags.creator);

// ── load private key ─────────────────────────────────────────────────────────
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

// ── load + strip pack ────────────────────────────────────────────────────────
const raw = JSON.parse(readFileSync(inputPath, "utf8"));
const STRIP = new Set(["bundleId", "creator", "contentHash", "signature"]);
const packData = {};
for (const [k, v] of Object.entries(raw)) {
  if (!STRIP.has(k)) packData[k] = v;
}

// ── canonical JSON (sorted keys, recursive) ──────────────────────────────────
function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}

const toHex = (b) =>
  Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");

const contentBytes = new TextEncoder().encode(canonical(packData));
const contentHash = toHex(sha256(contentBytes));

const sigMsg = new TextEncoder().encode(`${bundleId}|${creator}|${contentHash}`);
const sig = await ed.signAsync(sigMsg, sk);
const signatureB64 = Buffer.from(sig).toString("base64");

const signed = { bundleId, creator, contentHash, signature: signatureB64, ...packData };

writeFileSync(outputPath, JSON.stringify(signed, null, 2));

console.log("Signed bundle written:");
console.log("  in : " + inputPath);
console.log("  out: " + outputPath);
console.log("  bundleId   :", bundleId);
console.log("  creator    :", creator);
console.log("  contentHash:", contentHash);
console.log("  signature  :", signatureB64);
