import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { concatBytes } from "@noble/hashes/utils.js";
import { fromHex, toBase64, utf8 } from "./_lib.mjs";

ed.etc.sha512Sync = (...m) => sha512(concatBytes(...m));

const skHex = "fe24bf455a4319b6334565778bdfacd8b134da1541d5f8492cf675e07b206579";
const sk = fromHex(skHex);

const appId = "learningpath";
const deviceId = ""; 
// Clean timestamps: 2024-04-26 and 2124-04-26
const issuedAt = 1714104000000;
const expiry = 4867704000000;

const msg = utf8(`${appId}|${issuedAt}|${expiry}|${deviceId}`);
const sig = await ed.signAsync(msg, sk);

const license = {
  appId,
  issuedAt,
  expiry,
  signature: toBase64(sig)
};

console.log(JSON.stringify(license, null, 2));
