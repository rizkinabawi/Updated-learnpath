#!/usr/bin/env node
/**
 * sign-app-activation.mjs — issue a global APP ACTIVATION KEY (Section 1).
 *
 * Output JSON the end-user pastes into the in-app activation screen:
 *   {
 *     appId, issuedAt, expiry, deviceId?, signature
 *   }
 *
 * Signed message = `${appId}|${issuedAt}|${expiry}|${deviceId ?? ""}`
 *
 * Private key source (in priority order):
 *   1. $APP_MASTER_PRIVATE_KEY env var (hex)
 *   2. ./keys/security/app-master-private.hex
 *
 * Usage:
 *   node scripts/security/sign-app-activation.mjs --appId=learningpath \
 *        [--days=365] [--deviceId=abcdef] [--out=activation-key.json]
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ed25519Sign,
  loadPrivateKey,
  parseFlags,
  toBase64,
  utf8,
} from "./_lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flags = parseFlags(process.argv.slice(2));

const appId = flags.appId ? String(flags.appId) : "learningpath";
const days = Number(flags.days || 365);
const deviceId = flags.deviceId ? String(flags.deviceId) : "";
const outPath = flags.out ? String(flags.out) : null;

const sk = loadPrivateKey(
  "APP_MASTER_PRIVATE_KEY",
  join(ROOT, "keys", "security", "app-master-private.hex")
);

const issuedAt = Date.now();
const expiry = issuedAt + days * 24 * 60 * 60 * 1000;
const msg = utf8(`${appId}|${issuedAt}|${expiry}|${deviceId}`);
const sig = await ed25519Sign(sk, msg);

const license = {
  appId,
  issuedAt,
  expiry,
  ...(deviceId ? { deviceId } : {}),
  signature: toBase64(sig),
};

const json = JSON.stringify(license, null, 2);
if (outPath) {
  writeFileSync(outPath, json + "\n");
  console.log("Activation key written:", outPath);
} else {
  console.log(json);
}

console.log("");
console.log("  appId    :", appId);
console.log("  issuedAt :", new Date(issuedAt).toISOString());
console.log("  expiry   :", new Date(expiry).toISOString(), `(${days} days)`);
console.log("  deviceId :", deviceId || "<unbound>");
