import * as ed from "@noble/ed25519";

// Constants from the project
const APP_ID = "learningpath";
const PUBLIC_KEY_HEX = "cb1188467c03070da7da70edab724a59b77a5728183b2132a9bc4d31e4b1965e";
const PK = Buffer.from(PUBLIC_KEY_HEX, "hex");

// Key provided by the user
const USER_KEY_B64 = "AgEAAAGdyaUtNAAAAZ3tsbE0AIWDKWty3r1KAQzR5Ij43VQ85OkNZ2gRoSSVnrpIusmDSP9R4YZKO+ZJYvED7to6HF+vjz8ammfqBeH8reUvNQs=";

function fromBase64(b64) {
  return Buffer.from(b64, "base64");
}

function toBase64(bin) {
  return Buffer.from(bin).toString("base64");
}

function utf8(str) {
  return new TextEncoder().encode(str);
}

function unpackLicenseV2(bin) {
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const version = bin[0];
  const mode = bin[1] === 1 ? "trial" : "full";
  const issuedAt = Number(view.getBigUint64(2));
  const expiry = Number(view.getBigUint64(10));
  const dLen = bin[18];
  const deviceId = dLen > 0 ? new TextDecoder().decode(bin.slice(19, 19 + dLen)) : "";
  const signature = bin.slice(bin.length - 64);
  
  return { version, mode, issuedAt, expiry, deviceId, signature: toBase64(signature) };
}

async function test() {
  console.log("--- Testing User Provided Key ---");
  console.log("Key:", USER_KEY_B64);
  
  try {
    const bin = fromBase64(USER_KEY_B64);
    const unpacked = unpackLicenseV2(bin);
    
    console.log("\nUnpacked Data:");
    console.log("- Version:", unpacked.version);
    console.log("- Mode:", unpacked.mode);
    console.log("- Issued At:", new Date(unpacked.issuedAt).toISOString(), `(${unpacked.issuedAt})`);
    console.log("- Expiry:", new Date(unpacked.expiry).toISOString(), `(${unpacked.expiry})`);
    console.log("- Device ID:", unpacked.deviceId || "(empty)");
    
    const msg = utf8(`${APP_ID}|${unpacked.issuedAt}|${unpacked.expiry}|${unpacked.deviceId}|${unpacked.mode}`);
    const sig = fromBase64(unpacked.signature);
    
    const ok = await ed.verifyAsync(sig, msg, PK);
    
    console.log("\nVerification Result:", ok ? "✅ VALID" : "❌ INVALID");
    
    if (ok) {
      const now = Date.now();
      if (now > unpacked.expiry) {
        console.log("Status: ⚠️ EXPIRED");
      } else {
        const daysLeft = Math.ceil((unpacked.expiry - now) / (1000 * 60 * 60 * 24));
        console.log(`Status: ACTIVE (${daysLeft} days remaining)`);
      }
    }
  } catch (e) {
    console.error("\nError processing key:", e.message);
  }
}

test();
