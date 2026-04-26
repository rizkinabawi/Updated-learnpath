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
const pkHex = Array.from(pk).map(b => b.toString(16).padStart(2, "0")).join("");

console.log("Derived Public Key (HEX):", pkHex);
console.log("System Public Key (HEX):  ", "cb1188467c03070da7da70edab724a59b77a5728183b2132a9bc4d31e4b1965e");

if (pkHex === "cb1188467c03070da7da70edab724a59b77a5728183b2132a9bc4d31e4b1965e") {
    console.log("MATCH: Keypair is valid for this system.");
} else {
    console.log("MISMATCH: This private key does NOT belong to this system's public key.");
}
