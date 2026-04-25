const crypto = require('crypto');

const appId = "learningpath";
const deviceId = "78077F68-EB5F-43E2-8FC2-251B0265D524";
const issuedAt = Date.now();
const expiry = issuedAt + 1000 * 86400 * 36500; // 100 years
const msgStr = `${appId}|${issuedAt}|${expiry}|${deviceId}`;
const msg = Buffer.from(msgStr);

const skHex = "fe24bf455a4319b6334565778bdfacd8b134da1541d5f8492cf675e07b206579";
const seed = Buffer.from(skHex, "hex");

// To use native Node.js Ed25519 with a raw seed, 
// we must use crypto.createPrivateKey with the specific 'ed25519' type.
const privateKey = crypto.createPrivateKey({
  key: seed,
  format: 'der',
  type: 'pkcs8',
  // This is the tricky part. Node expects PKCS#8.
  // BUT: Node 12+ supports creating from raw bytes if formatted correctly.
});

// Actually, there's a simpler way in Node 16+:
const key = crypto.createPrivateKey({
  key: Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"), // PKCS#8 header for Ed25519
    seed
  ]),
  format: 'der',
  type: 'pkcs8'
});

const sig = crypto.sign(null, msg, key);
const sigB64 = sig.toString("base64");

const license = {
  appId,
  issuedAt,
  expiry,
  deviceId,
  signature: sigB64
};

console.log("--- ACTIVATION KEY ---");
console.log(JSON.stringify(license, null, 2));
console.log("----------------------");
