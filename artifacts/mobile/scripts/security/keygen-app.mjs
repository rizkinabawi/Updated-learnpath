#!/usr/bin/env node
/**
 * keygen-app.mjs — generate the APP MASTER Ed25519 keypair (Section 1).
 *
 * Output:
 *   - keys/security/app-master-private.hex  (chmod 600)
 *   - keys/security/app-master-public.hex
 *
 * After running, paste the public hex into:
 *   utils/security/master-public-key.ts → APP_MASTER_PUBLIC_KEY_HEX
 *
 * The private key NEVER leaves your local machine.
 *
 * Usage:
 *   node scripts/security/keygen-app.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ed25519GetPublicKey,
  ed25519RandomSecret,
  toHex,
} from "./_lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "keys", "security");

const sk = ed25519RandomSecret();
const pk = await ed25519GetPublicKey(sk);

mkdirSync(OUT_DIR, { recursive: true });
const skPath = join(OUT_DIR, "app-master-private.hex");
const pkPath = join(OUT_DIR, "app-master-public.hex");
writeFileSync(skPath, toHex(sk) + "\n", { mode: 0o600 });
writeFileSync(pkPath, toHex(pk) + "\n");

console.log("APP MASTER KEYPAIR (Section 1)");
console.log("------------------------------");
console.log("  private (hex):", toHex(sk));
console.log("  public  (hex):", toHex(pk));
console.log("");
console.log("Saved to:");
console.log("  " + skPath, "(SECRET — keep offline, chmod 600)");
console.log("  " + pkPath);
console.log("");
console.log("Next:");
console.log(
  "  • Replace APP_MASTER_PUBLIC_KEY_HEX in utils/security/master-public-key.ts"
);
console.log(
  "  • Re-issue activation keys with: node scripts/security/sign-app-activation.mjs"
);
