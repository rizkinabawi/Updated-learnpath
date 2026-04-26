import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { concatBytes } from "@noble/hashes/utils.js";
import { fromHex, fromBase64, utf8 } from "./_lib.mjs";

// Exact Noble setup as in _lib.mjs
ed.hashes.sha512 = sha512;
ed.hashes.sha512Async = async (...m) => sha512(concatBytes(...m));

// Data from the CLI output above
const license = {
  "appId": "learningpath",
  "issuedAt": 1777168105768,
  "expiry": 1808704105768,
  "signature": "JfeCEJz50Wi/+fi+PqnnCMGIbnKw8MCjU478Cetwr/whTnEya0aspYFoekUgWdgJCwLM2HFZTQrZigMCX2vnDg=="
};

const pkHex = "cb1188467c03070da7da70edab724a59b77a5728183b2132a9bc4d31e4b1965e";
const pk = fromHex(pkHex);

// System Message Format
const msg = utf8(`${license.appId}|${license.issuedAt}|${license.expiry}|`);

const sig = fromBase64(license.signature);
const isValid = await ed.verifyAsync(sig, msg, pk);

console.log("--- CLI AUDIT RESULT ---");
console.log("Target App ID:", license.appId);
console.log("Message Formatted:", `"${license.appId}|${license.issuedAt}|${license.expiry}|"`);
console.log("Signature Validated by System Lib:", isValid);
console.log("------------------------");
