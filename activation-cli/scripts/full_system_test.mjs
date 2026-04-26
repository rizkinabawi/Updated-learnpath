import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { concatBytes } from "@noble/hashes/utils.js";
import { fromHex, toBase64, fromBase64, utf8 } from "./_lib.mjs";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 1. LOAD SYSTEM PUBLIC KEY (from mobile app source)
const publicKeyPath = join(__dirname, "../../artifacts/mobile/utils/security/master-public-key.ts");
const pubKeyFile = readFileSync(publicKeyPath, "utf8");
const pubKeyMatch = pubKeyFile.match(/APP_MASTER_PUBLIC_KEY_HEX\s*=\s*"([a-f0-9]+)"/i);
const SYSTEM_PUB_KEY_HEX = pubKeyMatch[1];
const SYSTEM_PUB_KEY = fromHex(SYSTEM_PUB_KEY_HEX);

// 2. LOAD YOUR PRIVATE KEY
const skHex = "fe24bf455a4319b6334565778bdfacd8b134da1541d5f8492cf675e07b206579";
const sk = fromHex(skHex);

// 3. DERIVE PUBLIC KEY FROM PRIVATE KEY (To ensure they match)
const derivedPubKey = await ed.getPublicKeyAsync(sk);
const derivedPubKeyHex = Array.from(derivedPubKey).map(x => x.toString(16).padStart(2,'0')).join('');

console.log("=== STEP 1: KEYPAIR AUDIT ===");
console.log("System PubKey (App):", SYSTEM_PUB_KEY_HEX);
console.log("Derived PubKey (Me):", derivedPubKeyHex);
const keysMatch = SYSTEM_PUB_KEY_HEX === derivedPubKeyHex;
console.log("Keys Match?        :", keysMatch ? "✅ YES" : "❌ NO (CRITICAL ISSUE)");

if (!keysMatch) process.exit(1);

// 4. SIMULATE FULL VERIFICATION LOGIC (Identical to app-license.ts)
async function simulateAppVerify(license, hardwareId) {
  const msg = utf8(`${license.appId}|${license.issuedAt}|${license.expiry}|${license.deviceId ?? ""}`);
  const sig = fromBase64(license.signature); 
  
  const ok = await ed.verifyAsync(sig, msg, SYSTEM_PUB_KEY);
  if (!ok) return "BAD_SIGNATURE";
  if (Date.now() > license.expiry) return "EXPIRED";
  if (license.deviceId && license.deviceId !== hardwareId) return "DEVICE_MISMATCH";
  return "VALID";
}

// 5. TEST SCENARIOS
console.log("\n=== STEP 2: SCENARIO TESTING ===");

// Scenario A: Standard 100yr Token (No Binding)
const nowA = Date.now();
const expA = nowA + 1000 * 86400 * 36500;
const tokenA = {
  appId: "learningpath",
  issuedAt: nowA,
  expiry: expA,
  signature: toBase64(await ed.signAsync(utf8(`learningpath|${nowA}|${expA}|`), sk))
};
const resA = await simulateAppVerify(tokenA, "any-device-id");
console.log("Scenario A (Unbound) :", resA === "VALID" ? "✅ PASSED" : "❌ FAILED ("+resA+")");

// Scenario B: Device Bound Token (Correct Device)
const myDevice = "7fb3d3ee68286050";
const iaB = Date.now();
const exB = iaB + 100000;
const msgB = utf8(`learningpath|${iaB}|${exB}|${myDevice}`);
const tokenB = {
  appId: "learningpath",
  issuedAt: iaB,
  expiry: exB,
  deviceId: myDevice,
  signature: toBase64(await ed.signAsync(msgB, sk))
};
const resB = await simulateAppVerify(tokenB, myDevice);
console.log("Scenario B (Bound OK):", resB === "VALID" ? "✅ PASSED" : "❌ FAILED ("+resB+")");

// Scenario C: Device Bound Token (Wrong Device)
const resC = await simulateAppVerify(tokenB, "DIFFERENT_HARDWARE_ID");
console.log("Scenario C (Mismatch):", resC === "DEVICE_MISMATCH" ? "✅ PASSED (Correctly rejected)" : "❌ FAILED ("+resC+")");

// Scenario D: Expired Token
const tokenD = { ...tokenA, expiry: Date.now() - 1000 };
const resD = await simulateAppVerify(tokenD, "any");
console.log("Scenario D (Expired) :", resD === "EXPIRED" ? "✅ PASSED (Correctly rejected)" : "❌ FAILED ("+resD+")");

console.log("\n=== WORKFLOW TEST COMPLETED ===");
if (keysMatch && resA === "VALID" && resB === "VALID" && resC === "DEVICE_MISMATCH") {
  console.log("RESULT: SYSTEM IS FULLY SYNCHRONIZED AND SECURE.");
}
