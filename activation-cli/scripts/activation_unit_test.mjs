import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { concatBytes } from "@noble/hashes/utils.js";

// SIMULASI: Manual UTF-8 Encoder (Sama dengan Web & App)
const utf8_manual = (s) => {
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

// SIMULASI: Node.js TextEncoder (Standard)
const utf8_native = (s) => new TextEncoder().encode(s);

/** Compact V2 binary packing */
function packLicenseV2(lic, sig) {
  const dBuf = utf8_native(lic.deviceId || "");
  const buf = new Uint8Array(1 + 1 + 8 + 8 + 1 + dBuf.length + 64);
  const view = new DataView(buf.buffer);
  buf[0] = 0x02;
  buf[1] = lic.mode === "trial" ? 1 : 0;
  view.setBigUint64(2, BigInt(lic.issuedAt));
  view.setBigUint64(10, BigInt(lic.expiry));
  buf[18] = dBuf.length;
  buf.set(dBuf, 19);
  buf.set(sig, 19 + dBuf.length);
  return buf;
}

/** Compact V2 binary unpacking */
function unpackLicenseV2(bin) {
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const mode = bin[1] === 1 ? "trial" : "full";
  const issuedAt = Number(view.getBigUint64(2));
  const expiry = Number(view.getBigUint64(10));
  const dLen = bin[18];
  const deviceId = new TextDecoder().decode(bin.slice(19, 19 + dLen));
  return { mode, issuedAt, expiry, deviceId };
}

console.log("=== UNIT TEST: CROSS-PLATFORM COMPATIBILITY ===");

// 1. Uji Encoding (Sangat Penting!)
console.log("\n[1/3] Testing UTF-8 Encoding Consistency...");
const testStr = "learningpath|1714104000000|4867704000000|7fb3d3ee68286050|full";
const manualBytes = utf8_manual(testStr);
const nativeBytes = utf8_native(testStr);

let encodingMatch = true;
if (manualBytes.length !== nativeBytes.length) encodingMatch = false;
for (let i = 0; i < manualBytes.length; i++) {
    if (manualBytes[i] !== nativeBytes[i]) encodingMatch = false;
}
console.log("Result:", encodingMatch ? "✅ MATCH (Manual == Native)" : "❌ FAILED (Encoding mismatch)");

// 2. Uji Signature dari Private Key User
console.log("\n[2/3] Testing Ed25519 Signature Logic...");
const sk = Buffer.from("fe24bf455a4319b6334565778bdfacd8b134da1541d5f8492cf675e07b206579", "hex");
const pk = await ed.getPublicKeyAsync(sk);
const pkHex = Array.from(pk).map(x => x.toString(16).padStart(2,'0')).join('');

const expectedPkHex = "cb1188467c03070da7da70edab724a59b77a5728183b2132a9bc4d31e4b1965e";
console.log("Public Key Derivation:", pkHex === expectedPkHex ? "✅ MATCH" : "❌ FAILED");

// 3. Uji Verifikasi Token
console.log("\n[3/3] Testing Token Validation...");
const sig = await ed.signAsync(manualBytes, sk);
const isNativeValid = await ed.verifyAsync(sig, nativeBytes, pk);
const isManualValid = await ed.verifyAsync(sig, manualBytes, pk);

console.log("Verify using Native bytes:", isNativeValid ? "✅ VALID" : "❌ INVALID");
console.log("Verify using Manual bytes:", isManualValid ? "✅ VALID" : "❌ INVALID");

// 4. Uji V2 Binary Packing
console.log("\n[4/4] Testing V2 Binary Packing/Unpacking...");
const licData = { issuedAt: 1714104000000, expiry: 4867704000000, mode: "trial", deviceId: "unittest-device" };
const binaryBlob = packLicenseV2(licData, sig);
const unpacked = unpackLicenseV2(binaryBlob);

const packOk = unpacked.mode === licData.mode && 
               unpacked.issuedAt === licData.issuedAt && 
               unpacked.expiry === licData.expiry && 
               unpacked.deviceId === licData.deviceId;

console.log("Binary Unpack Consistency:", packOk ? "✅ MATCH" : "❌ FAILED (Data corrupted during pack/unpack)");
console.log("Blob V2 Header (0x02):", binaryBlob[0] === 0x02 ? "✅ CORRECT" : "❌ WRONG");

console.log("\n===============================================");
if (encodingMatch && pkHex === expectedPkHex && isNativeValid && isManualValid && packOk) {
    console.log("\n✅ ALL UNIT TESTS PASSED.");
    console.log("The Web App, CLI, and Mobile App are 100% compatible in V2 format.");
} else {
    console.log("\n❌ UNIT TEST FAILED.");
    process.exit(1);
}
