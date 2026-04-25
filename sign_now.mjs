import * as ed from "./artifacts/mobile/node_modules/@noble/ed25519/index.js";
import { sha512 } from "./artifacts/mobile/node_modules/@noble/hashes/sha2.js";
import { concatBytes } from "./artifacts/mobile/node_modules/@noble/hashes/utils.js";

// Setup hashes for noble/ed25519 v3
if (ed.etc) {
    ed.etc.sha512Sync = (...m) => sha512(concatBytes(...m));
    ed.etc.sha512Async = async (...m) => sha512(concatBytes(...m));
} else {
    ed.hashes.sha512 = sha512;
}

const appId = "learningpath";
const deviceId = "78077F68-EB5F-43E2-8FC2-251B0265D524";
const issuedAt = Date.now();
const expiry = issuedAt + 1000 * 86400 * 36500; // 100 years
const msgStr = `${appId}|${issuedAt}|${expiry}|${deviceId}`;
const msg = new TextEncoder().encode(msgStr);

const skHex = "fe24bf455a4319b6334565778bdfacd8b134da1541d5f8492cf675e07b206579";
const sk = new Uint8Array(skHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

const sig = await ed.signAsync(msg, sk);
const sigB64 = Buffer.from(sig).toString("base64");

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
