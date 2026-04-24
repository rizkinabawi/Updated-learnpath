#!/usr/bin/env node
/**
 * keygen.mjs — generate a fresh Ed25519 keypair for the bundle signing system.
 *
 * Output:
 *   - Prints the keypair to stdout (hex).
 *   - Writes the private key to `keys/private-key.hex` (gitignored).
 *   - Writes the public key  to `keys/public-key.hex`.
 *
 * After running, paste the new PUBLIC key into:
 *   utils/bundle-public-key.ts → BUNDLE_PUBLIC_KEY_HEX
 *
 * Then re-sign all existing bundles & activation keys with the new private key.
 *
 * Usage:
 *   node scripts/keygen.mjs
 */
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { concatBytes } from "@noble/hashes/utils.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

ed.hashes.sha512 = sha512;
ed.hashes.sha512Async = async (...m) => sha512(concatBytes(...m));

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEYS_DIR = join(__dirname, "..", "keys");

const toHex = (b) =>
  Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");

const sk = ed.utils.randomSecretKey();
const pk = await ed.getPublicKeyAsync(sk);
const skHex = toHex(sk);
const pkHex = toHex(pk);

mkdirSync(KEYS_DIR, { recursive: true });
writeFileSync(join(KEYS_DIR, "private-key.hex"), skHex + "\n", { mode: 0o600 });
writeFileSync(join(KEYS_DIR, "public-key.hex"), pkHex + "\n");

console.log("Generated Ed25519 keypair:");
console.log("  private (hex):", skHex);
console.log("  public  (hex):", pkHex);
console.log("");
console.log("Saved to:");
console.log("  " + join(KEYS_DIR, "private-key.hex"));
console.log("  " + join(KEYS_DIR, "public-key.hex"));
console.log("");
console.log("Next:");
console.log("  1. Replace BUNDLE_PUBLIC_KEY_HEX in utils/bundle-public-key.ts");
console.log("     with the public hex above.");
console.log("  2. Keep keys/private-key.hex SECRET — never commit it.");
