#!/usr/bin/env node
/**
 * keygen-creator.mjs — generate a CREATOR Ed25519 keypair (Section 2).
 *
 * Each creator keeps their own private key. The public key is embedded into
 * every bundle they sign so consumers can verify offline.
 *
 * Output:
 *   - keys/security/creator-<id>-private.hex   (chmod 600)
 *   - keys/security/creator-<id>-public.hex
 *   - keys/security/creator-<id>.json          (full identity blob)
 *
 * Usage:
 *   node scripts/security/keygen-creator.mjs [--name=alice]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  deriveCreatorId,
  ed25519GetPublicKey,
  ed25519RandomSecret,
  parseFlags,
  toBase64,
  toHex,
} from "./_lib.mjs";

const flags = parseFlags(process.argv.slice(2));
const name = flags.name ? String(flags.name) : null;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "keys", "security");

const sk = ed25519RandomSecret();
const pk = await ed25519GetPublicKey(sk);
const skHex = toHex(sk);
const pkHex = toHex(pk);
const pkB64 = toBase64(pk);
const creatorId = deriveCreatorId(pkHex);

mkdirSync(OUT_DIR, { recursive: true });
const skPath = join(OUT_DIR, `creator-${creatorId}-private.hex`);
const pkPath = join(OUT_DIR, `creator-${creatorId}-public.hex`);
const blobPath = join(OUT_DIR, `creator-${creatorId}.json`);

writeFileSync(skPath, skHex + "\n", { mode: 0o600 });
writeFileSync(pkPath, pkHex + "\n");
writeFileSync(
  blobPath,
  JSON.stringify(
    { creatorId, name: name ?? null, publicKeyHex: pkHex, publicKeyBase64: pkB64 },
    null,
    2
  ) + "\n"
);

console.log("CREATOR KEYPAIR (Section 2)");
console.log("---------------------------");
console.log("  creatorId         :", creatorId);
if (name) console.log("  name              :", name);
console.log("  privateKey   (hex):", skHex);
console.log("  publicKey    (hex):", pkHex);
console.log("  publicKey    (b64):", pkB64);
console.log("");
console.log("Saved to:");
console.log("  " + skPath, "(SECRET)");
console.log("  " + pkPath);
console.log("  " + blobPath);
console.log("");
console.log(
  "Use this creator key with: node scripts/security/sign-bundle.mjs --creatorKey=" +
    skPath
);
