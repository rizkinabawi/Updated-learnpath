const crypto = require('crypto');

const appId = "learningpath";
const deviceId = ""; // Tanpa binding
const issuedAt = Date.now();
const expiry = issuedAt + 1000 * 86400 * 36500; // 100 years
const msgStr = `${appId}|${issuedAt}|${expiry}|${deviceId}`;
const msg = Buffer.from(msgStr);

const skHex = "fe24bf455a4319b6334565778bdfacd8b134da1541d5f8492cf675e07b206579";
const seed = Buffer.from(skHex, "hex");

// Native Node.js Ed25519 Private Key Import (PKCS#8 format)
const key = crypto.createPrivateKey({
  key: Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
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

console.log(JSON.stringify(license, null, 2));
