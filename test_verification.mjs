import * as ed from "./artifacts/mobile/node_modules/@noble/ed25519/index.js";
import { sha512 } from "./artifacts/mobile/node_modules/@noble/hashes/sha2.js";
import { concatBytes } from "./artifacts/mobile/node_modules/@noble/hashes/utils.js";

// Safe setup for noble/ed25519 v3
try {
    if (ed.etc) {
        Object.assign(ed.etc, {
            sha512Sync: (...m) => sha512(concatBytes(...m)),
            sha512Async: async (...m) => sha512(concatBytes(...m)),
        });
    }
} catch (e) {}

const skHex = "fe24bf455a4319b6334565778bdfacd8b134da1541d5f8492cf675e07b206579";
const sk = new Uint8Array(skHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
const pk = await ed.getPublicKeyAsync(sk);

// Logic from app-license.ts:
const license = {
  appId: "learningpath",
  issuedAt: Date.now(),
  expiry: Date.now() + 1000 * 86400 * 365, // 1 year
  deviceId: ""
};

const msgStr = `${license.appId}|${license.issuedAt}|${license.expiry}|${license.deviceId ?? ""}`;
const msg = new TextEncoder().encode(msgStr);

const sig = await ed.signAsync(msg, sk);
const sigB64 = Buffer.from(sig).toString("base64");

// Verification Check
const ok = await ed.verifyAsync(sig, msg, pk);

console.log("--- TEST RESULTS ---");
console.log("Message Signed: ", msgStr);
console.log("Signature Valid:", ok);
console.log("--------------------");

if (ok) {
    console.log(JSON.stringify({ ...license, signature: sigB64 }, null, 2));
}
