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

const appId = "learningpath";
const deviceId = ""; // No binding
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

process.stdout.write(JSON.stringify(license, null, 2));
