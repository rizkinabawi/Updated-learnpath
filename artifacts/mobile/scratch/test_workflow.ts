/**
 * test_workflow.ts
 *
 * Simulates the full Creator -> Buyer workflow to verify cryptographic integrity.
 */

// We'll use absolute paths or relative to the script location
import { createSignedBundle, unlockBundle } from "../utils/security/bundle";
import { generateBuyerToken, parseBuyerToken, verifyBuyerToken } from "../utils/security/bundle-license";
import { ensureCreatorIdentity, getCreatorIdentityWithKey } from "../utils/security/creator";

async function runTest() {
  console.log("--- START WORKFLOW TEST ---");

  try {
    // 1. Initialise Creator Identity (Ed25519 Keypair)
    console.log("[1] Initialising Creator Identity...");
    await ensureCreatorIdentity();
    const identity = await getCreatorIdentityWithKey();
    if (!identity) throw new Error("Identity not found");
    console.log("    Creator ID:", identity.creatorId);

    // 2. Create a Bundle
    console.log("[2] Creating Bundle...");
    const bundleInput = {
      bundleId: "test-bundle-001",
      password: "secretpassword123",
      content: {
        cards: [{ q: "What is 2+2?", a: "4" }],
        media: {},
        coursePack: { name: "Test Course" }
      }
    };
    const signedBundle = await createSignedBundle(bundleInput);
    console.log("    Bundle Created. Signature length:", signedBundle.signature.length);

    // 3. Generate Buyer Token
    console.log("[3] Generating Buyer Token...");
    const tokenJson = await generateBuyerToken(
      { bundleId: "test-bundle-001", buyerId: "buyer@example.com", days: 30 },
      identity
    );
    console.log("    Token JSON:", tokenJson.slice(0, 50) + "...");

    // 4. Verification Flow (Buyer Side)
    console.log("[4] Buyer Verification Flow...");
    
    // a. Parse Token
    const parsedToken = parseBuyerToken(tokenJson);
    if (!parsedToken) throw new Error("Failed to parse token");
    console.log("    TokenParsed: OK");

    // b. Verify Token against Bundle Meta
    const tokenErr = await verifyBuyerToken(
      parsedToken, 
      signedBundle.bundleId, 
      signedBundle.creatorPublicKey
    );
    if (tokenErr) throw new Error(`Token invalid: ${tokenErr}`);
    console.log("    TokenVerification: OK");

    // c. Unlock Bundle with Password
    const unlockRes = await unlockBundle(signedBundle, "secretpassword123");
    if (!unlockRes.ok) throw new Error(`Unlock failed: ${unlockRes.error}`);
    console.log("    Unlock: OK");
    console.log("    Content recovered:", JSON.stringify(unlockRes.result.content).slice(0, 50) + "...");

    console.log("\n--- TEST SUCCESSFUL ---");
  } catch (err) {
    console.error("\n--- TEST FAILED ---");
    console.error(err);
  }
}

runTest();
