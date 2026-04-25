/**
 * master-public-key.ts
 *
 * Hardcoded Ed25519 PUBLIC key of the APP MASTER (Section 1).
 *
 * Used to verify global activation keys (`{appId, issuedAt, expiry, deviceId}`)
 * that unlock the app.
 *
 * The matching PRIVATE key MUST NEVER live in this app or repo. It only lives
 * on the operator's local machine (or HSM) and is used by the offline CLI:
 *   node scripts/security/keygen-app.mjs
 *   node scripts/security/sign-app-activation.mjs
 *
 * To rotate:
 *   1. node scripts/security/keygen-app.mjs
 *   2. Replace APP_MASTER_PUBLIC_KEY_HEX below.
 *   3. Re-issue activation keys to all users.
 *
 * NOTE: This is intentionally a *separate* key from the per-bundle creator
 * keys (Section 2). Bundles are signed by the creator's own keypair, not by
 * the app master.
 */
export const APP_MASTER_PUBLIC_KEY_HEX =
  "cb1188467c03070da7da70edab724a59b77a5728183b2132a9bc4d31e4b1965e";

/** App identity that signed activation keys must match (Section 1). */
export const APP_ID = "learningpath";
