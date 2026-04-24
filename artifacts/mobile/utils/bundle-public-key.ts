/**
 * bundle-public-key.ts
 *
 * Ed25519 public key used to verify bundle integrity & activation keys.
 *
 * The matching PRIVATE key MUST NEVER live in the app or repo.
 * It is stored only on the signer's local machine and used by the offline
 * CLI scripts under `scripts/` (keygen / sign-bundle / sign-activation).
 *
 * To rotate the keypair:
 *   1. Run: node scripts/keygen.mjs
 *   2. Replace BUNDLE_PUBLIC_KEY_HEX below with the new public key.
 *   3. Re-sign all bundles & activation keys with the new private key.
 */
export const BUNDLE_PUBLIC_KEY_HEX =
  "9e1612396e13510d4304ba9750900ec37fd0de7782fc8563e107c1dc54645c02";
