import { 
  ed25519Sign, 
  toBase64, 
  fromBase64, 
  utf8 
} from "c:/Users/rizki/Documents/Updated-learnpath/activation-cli/scripts/_lib.mjs";
import * as ed from "@noble/ed25519";

const appId = "learningpath";
const mode = "trial";
const issuedAt = 1714131853000;
const expiry = 1716723853000;
const deviceId = "test-device-123";

const sk = new Uint8Array(32).fill(0x01); // deterministic key for test
const pk = await ed.getPublicKeyAsync(sk);

console.log("Master Public Key:", Buffer.from(pk).toString('hex'));

// 1. SIGNING (Synchronized Format)
const msgStr = `${appId}|${issuedAt}|${expiry}|${deviceId}|${mode}`;
const msg = utf8(msgStr);
const sig = await ed.signAsync(msg, sk);
const signature = toBase64(sig);

console.log("\nGenerated Signature:", signature);

// 2. V2 PACKING (Synchronized Logic)
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

const license = { appId, mode, issuedAt, expiry, deviceId, signature };
const blob = packLicenseV2(license, sig);
console.log("\nV2 Binary Blob:", blob);

// 3. V2 UNPACKING
function unpackLicenseV2(bin) {
  const view = new DataView(bin.buffer);
  const mode = bin[1] === 1 ? "trial" : "full";
  const issuedAt = Number(view.getBigUint64(2));
  const expiry = Number(view.getBigUint64(10));
  const dLen = bin[18];
  const deviceId = dLen > 0 ? new TextDecoder().decode(bin.slice(19, 19 + dLen)) : "";
  const sig = bin.slice(bin.length - 64);
  return { appId: "learningpath", mode, issuedAt, expiry, deviceId, signature: toBase64(sig) };
}

const unpacked = unpackLicenseV2(fromBase64(blob));
console.log("\nUnpacked License:", JSON.stringify(unpacked, null, 2));

// 4. VERIFICATION
const vMsg = utf8(`${unpacked.appId}|${unpacked.issuedAt}|${unpacked.expiry}|${unpacked.deviceId}|${unpacked.mode}`);
const ok = await ed.verifyAsync(fromBase64(unpacked.signature), vMsg, pk);

console.log("\nVerification Result:", ok ? "✅ SUCCESS" : "❌ FAILED");

if (ok) {
  console.log("\n--- TEST PASSED: ALL SYSTEMS ARE SYNCED ---");
} else {
  console.log("\n--- TEST FAILED: SYNC MISMATCH ---");
  process.exit(1);
}
