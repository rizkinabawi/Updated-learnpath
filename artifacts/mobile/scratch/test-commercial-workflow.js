/**
 * COMPLETE COMMERCIAL WORKFLOW UNIT TEST (OFFLINE)
 * Audit Goal: Verify that a Creator can issue a token that a Buyer can verify.
 */

const crypto = require('crypto');

// --- MOCK CRYPTO WRAPPERS (Simulating ed25519) ---
function mockSign(privateKey, message) {
    // In real app, this uses Ed25519. Here we use HMAC to simulate "signing"
    return crypto.createHmac('sha256', privateKey).update(message).digest('base64');
}

function mockVerify(publicKey, message, signature) {
    // In real app, this uses Ed25519 verify.
    const expected = crypto.createHmac('sha256', publicKey).update(message).digest('base64');
    return expected === signature;
}

// --- TEST CASE CONFIGURATION ---
const CREATOR_SK = "creator-private-key-12345"; // Mock SK
const CREATOR_PK = "creator-private-key-12345"; // Mock PK (In Ed25519 these are unique, here they match for simple mockup)
const BUNDLE_ID  = "biology-advanced-v1";
const BUYER_NAME = "Rizki Nabawi";

console.log("--- STARTING COMMERCIAL WORKFLOW TEST ---");

// STEP 1: Creator Issues a Token
function generateBuyerToken(bundleId, buyerId, sk) {
    const issuedAt = Date.now();
    const expiry = issuedAt + (365 * 86400000); // 1 Year
    const nonce = "random-nonce-xyz";
    const creatorId = "creator-id-abc";
    
    // Message Format: bl1|{bundleId}|{buyerId}|{nonce}|{issuedAt}|{expiry}|{creatorId}
    const msg = `bl1|${bundleId}|${buyerId}|${nonce}|${issuedAt}|${expiry}|${creatorId}`;
    console.log(`\n[Creator] Generating token for ${buyerId}...`);
    
    const signature = mockSign(sk, msg);
    
    return {
        v: 1,
        bundleId,
        buyerId,
        nonce,
        issuedAt,
        expiry,
        creatorId,
        signature
    };
}

const tokenJson = generateBuyerToken(BUNDLE_ID, BUYER_NAME, CREATOR_SK);
console.log("[Creator] Token Generated:", JSON.stringify(tokenJson, null, 2));


// STEP 2: Buyer Verifies the Token
function verifyBuyerToken(token, expectedBundleId, pk) {
    console.log(`\n[Buyer] Verifying token for bundle "${expectedBundleId}"...`);
    
    if (token.bundleId !== expectedBundleId) return { ok: false, err: "WRONG_BUNDLE" };
    if (token.expiry < Date.now()) return { ok: false, err: "EXPIRED" };
    
    const msg = `bl1|${token.bundleId}|${token.buyerId}|${token.nonce}|${token.issuedAt}|${token.expiry}|${token.creatorId}`;
    const isValid = mockVerify(pk, msg, token.signature);
    
    return isValid ? { ok: true } : { ok: false, err: "BAD_SIGNATURE" };
}

// Case A: Success
const resultA = verifyBuyerToken(tokenJson, BUNDLE_ID, CREATOR_PK);
console.log(`Result A (Target Match): ${resultA.ok ? "✅ SUCCESS" : "❌ FAILED: " + resultA.err}`);

// Case B: Wrong Bundle (Attacking user tries to use Token A for Bundle B)
const resultB = verifyBuyerToken(tokenJson, "other-bundle-999", CREATOR_PK);
console.log(`Result B (Wrong Bundle Attack): ${!resultB.ok && resultB.err === "WRONG_BUNDLE" ? "✅ BLOCKED" : "❌ PROTECT FAILED"}`);

// Case C: Forged Signature (User tries to change buyerId)
const forgedToken = { ...tokenJson, buyerId: "Attacker Name" };
const resultC = verifyBuyerToken(forgedToken, BUNDLE_ID, CREATOR_PK);
console.log(`Result C (Forgery Attack): ${!resultC.ok && resultC.err === "BAD_SIGNATURE" ? "✅ BLOCKED" : "❌ PROTECT FAILED"}`);

console.log("\n--- TEST SUMMARY ---");
if (resultA.ok && resultB.err === "WRONG_BUNDLE" && resultC.err === "BAD_SIGNATURE") {
    console.log("🏆 ALL SECURITY CASES PASSED.");
} else {
    console.log("🚨 SECURITY VULNERABILITY DETECTED.");
}
