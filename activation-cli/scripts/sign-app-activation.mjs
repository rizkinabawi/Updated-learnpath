#!/usr/bin/env node
/**
 * sign-app-activation.mjs — issue a global APP ACTIVATION KEY (Section 1).
 *
 * Output JSON the end-user pastes into the in-app activation screen:
 *   {
 *     appId, mode, issuedAt, expiry, deviceId?, signature
 *   }
 *
 * Signed message = `${appId}|${issuedAt}|${expiry}|${deviceId ?? ""}|${mode}`
 *
 * Private key source (in priority order):
 *   1. $APP_MASTER_PRIVATE_KEY env var (hex)
 *   2. ./keys/security/app-master-private.hex
 *
 * Usage:
 *   node scripts/security/sign-app-activation.mjs --appId=learningpath \
 *        [--mode=full|trial] [--days=30] [--deviceId=abcdef] [--out=activation-key.json]
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
const mode = flags.mode === "trial" ? "trial" : "full";
const defaultDays = mode === "trial" ? 30 : 365;
const days = Number(flags.days || defaultDays);
const deviceId = flags.deviceId ? String(flags.deviceId) : "";
const outPath = flags.out ? String(flags.out) : null;

const sk = loadPrivateKey(
  "APP_MASTER_PRIVATE_KEY",
  join(ROOT, "keys", "security", "app-master-private.hex")
);

const issuedAt = Date.now();
const expiry = issuedAt + days * 24 * 60 * 60 * 1000;
const msg = utf8(`${appId}|${issuedAt}|${expiry}|${deviceId}|${mode}`);
const sig = await ed25519Sign(sk, msg);

const license = {
  appId,
  mode,
  issuedAt,
  expiry,
  ...(deviceId ? { deviceId } : {}),
  signature: toBase64(sig),
};

/** 
 * Packs into compact V2 format:
 * [0]: 0x02
 * [1]: 0=full, 1=trial
 * [2..9]: issuedAt
 * [10..17]: expiry
 * [18]: deviceIdLen
 * [19..19+len]: deviceId
 * [last 64]: signature
 */
function packLicenseV2(lic, sig) {
  const dBuf = utf8(lic.deviceId || "");
  const buf = new Uint8Array(1 + 1 + 8 + 8 + 1 + dBuf.length + 64);
  const view = new DataView(buf.buffer);
  
  buf[0] = 0x02;
  buf[1] = lic.mode === "trial" ? 1 : 0;
  view.setBigUint64(2, BigInt(lic.issuedAt));
  view.setBigUint64(10, BigInt(lic.expiry));
  buf[18] = dBuf.length;
  buf.set(dBuf, 19);
  buf.set(sig, 19 + dBuf.length);
  
  return toBase64(buf);
}

const v2Blob = packLicenseV2(license, sig);
const json = JSON.stringify(license, null, 2);

if (outPath) {
  writeFileSync(outPath, v2Blob + "\n");
  console.log("V2 Activation blob written:", outPath);
} else {
  console.log("\n--- BINARY ACTIVATION BLOB (V2) ---");
  console.log(v2Blob);
  console.log("-----------------------------------\n");
}

console.log("");
console.log("  appId    :", appId);
console.log("  mode     :", mode.toUpperCase());
console.log("  issuedAt :", new Date(issuedAt).toISOString());
console.log("  expiry   :", new Date(expiry).toISOString(), `(${days} days)`);
console.log("  deviceId :", deviceId || "<unbound>");
