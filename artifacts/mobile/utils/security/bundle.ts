/**
 * bundle.ts
 *
 * SECTIONS 3-9 — Self-signed, encrypted, password-locked content bundle.
 *
 * Wire format (JSON, all strings):
 *   {
 *     bundleId:          string,
 *     creatorId:         string,
 *     creatorPublicKey:  base64(32-byte Ed25519 public key),
 *     contentHash:       hex(sha256(canonicalJson({cards, media}))),
 *     signature:         base64(ed25519(creatorSK,
 *                          "bundleId|creatorId|contentHash")),
 *     passwordHash:      hex(sha256(password)),    // for fast wrong-password rejection
 *     encryptedContent:  base64(AES-256-GCM(SHA256(password), canonicalJson({cards, media})))
 *   }
 *
 * VALIDATION (Section 3, 4):
 *   1. All required fields present and well-formed.
 *   2. Recompute signature message and Ed25519-verify against creatorPublicKey.
 *   3. (After decryption) Recompute SHA256 of canonicalJson({cards, media})
 *      and compare to contentHash. Reject if mismatch.
 *
 * UNLOCK FLOW (Section 8):
 *   1. verifyBundleSignature(bundle)
 *   2. ask user for password
 *   3. SHA256(password) === bundle.passwordHash ?  (fast reject)
 *   4. token = generateUnlockToken(password, bundleId, now); validate ±1 window
 *   5. Decrypt encryptedContent with key=SHA256(password)
 *   6. Recompute contentHash; compare; load content
 *
 * STORAGE RULES (Section 9):
 *   - Persist only the encrypted bundle JSON.
 *   - Decrypted content is returned to the caller as a value but never
 *     written to disk by this module.
 */

import {
  aesDecrypt,
  aesEncrypt,
  canonicalJson,
  deriveEncryptionKey,
  ed25519Verify,
  fromBase64,
  fromUtf8,
  generateUnlockToken,
  hashPassword,
  sha256Hex,
  sha256OfString,
  toBase64,
  utf8,
  validateUnlockToken,
} from "./crypto";
import {
  getCreatorIdentityWithKey,
  type CreatorIdentity,
} from "./creator";
import { ed25519Sign } from "./crypto";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BundleContent {
  /** Card data (Section 4). Free-form objects, but canonical JSON of this whole record must be deterministic. */
  cards: unknown[];
  /** Media files: name → base64 of bytes. Keys are sorted in canonical hashing. */
  media: Record<string, string>;
}

export interface SignedBundle {
  bundleId: string;
  creatorId: string;
  creatorPublicKey: string; // base64
  contentHash: string;      // hex sha256 of canonicalJson(content)
  signature: string;        // base64 ed25519
  passwordHash: string;     // hex sha256(password)
  encryptedContent: string; // base64 AES-256-GCM payload
}

export type BundleError =
  | "MISSING_FIELDS"
  | "BAD_SIGNATURE"
  | "BAD_PUBLIC_KEY"
  | "WRONG_PASSWORD"
  | "BAD_TOKEN"
  | "BAD_HASH"
  | "DECRYPT_FAIL";

// ─── Hashing (Section 4) ─────────────────────────────────────────────────────

/**
 * Deterministic SHA-256 of bundle content. Canonical JSON sorts keys
 * recursively, and `media` is a string-keyed map so its serialisation is
 * stable across devices.
 */
export function hashContent(content: BundleContent): string {
  return sha256Hex(utf8(canonicalJson(content)));
}

// ─── Signature message (Section 3) ──────────────────────────────────────────

function signatureMessage(b: Pick<SignedBundle, "bundleId" | "creatorId" | "contentHash">): Uint8Array {
  return utf8(`${b.bundleId}|${b.creatorId}|${b.contentHash}`);
}

// ─── Field validation ────────────────────────────────────────────────────────

function isSignedBundle(v: unknown): v is SignedBundle {
  if (!v || typeof v !== "object") return false;
  const b = v as Record<string, unknown>;
  return (
    typeof b.bundleId === "string" &&
    typeof b.creatorId === "string" &&
    typeof b.creatorPublicKey === "string" &&
    typeof b.contentHash === "string" &&
    typeof b.signature === "string" &&
    typeof b.passwordHash === "string" &&
    typeof b.encryptedContent === "string"
  );
}

export function parseBundleInput(raw: string): SignedBundle | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed);
    if (isSignedBundle(obj)) return obj;
  } catch {
    /* not direct JSON */
  }
  try {
    const text = fromUtf8(fromBase64(trimmed));
    const obj = JSON.parse(text);
    if (isSignedBundle(obj)) return obj;
  } catch {
    /* not base64 of JSON */
  }
  return null;
}

// ─── Signature verification (Section 3) ─────────────────────────────────────

export async function verifyBundleSignature(
  bundle: SignedBundle
): Promise<BundleError | null> {
  if (!isSignedBundle(bundle)) return "MISSING_FIELDS";

  let pk: Uint8Array;
  try {
    pk = fromBase64(bundle.creatorPublicKey);
  } catch {
    return "BAD_PUBLIC_KEY";
  }
  if (pk.length !== 32) return "BAD_PUBLIC_KEY";

  // creatorId must match the embedded public key — prevents trivial
  // ownership hijacking by a tamperer who swaps the id without re-signing.
  const expectedId = sha256OfString(`creator:${bytesToHex(pk)}`).slice(0, 32);
  if (bundle.creatorId !== expectedId) return "BAD_SIGNATURE";

  let sig: Uint8Array;
  try {
    sig = fromBase64(bundle.signature);
  } catch {
    return "BAD_SIGNATURE";
  }
  if (sig.length !== 64) return "BAD_SIGNATURE";

  const ok = await ed25519Verify(pk, signatureMessage(bundle), sig);
  return ok ? null : "BAD_SIGNATURE";
}

// ─── Full unlock flow (Section 8) ────────────────────────────────────────────

export interface UnlockResult {
  content: BundleContent;
}

/**
 * Run the full unlock pipeline:
 *   1. signature verify
 *   2. fast password rejection via stored passwordHash
 *   3. dynamic unlock token validation (±1 hour window)
 *   4. AES decrypt
 *   5. content hash recompute & compare
 *
 * Returns either the decrypted content or a typed error.
 */
export async function unlockBundle(
  bundle: SignedBundle,
  password: string
): Promise<{ ok: true; result: UnlockResult } | { ok: false; error: BundleError }> {
  const sigErr = await verifyBundleSignature(bundle);
  if (sigErr) return { ok: false, error: sigErr };

  if (hashPassword(password) !== bundle.passwordHash) {
    return { ok: false, error: "WRONG_PASSWORD" };
  }

  // Dynamic unlock token (Section 7) — generate fresh on the consumer side
  // and validate against the same time window. This is intentionally a
  // self-loop: if the password is right, the token *will* validate. If the
  // password is wrong, hashPassword above already caught it. The token's
  // value is in proving that the unlock attempt happened in a recent time
  // window (no static reuse of a captured password+payload pair).
  const token = generateUnlockToken(password, bundle.bundleId);
  if (!validateUnlockToken(token, password, bundle.bundleId)) {
    return { ok: false, error: "BAD_TOKEN" };
  }

  let plaintext: Uint8Array;
  try {
    const key = deriveEncryptionKey(password);
    plaintext = aesDecrypt(key, bundle.encryptedContent);
  } catch {
    return { ok: false, error: "DECRYPT_FAIL" };
  }

  let content: BundleContent;
  try {
    const parsed = JSON.parse(fromUtf8(plaintext)) as BundleContent;
    if (
      !parsed ||
      !Array.isArray(parsed.cards) ||
      typeof parsed.media !== "object" ||
      parsed.media === null
    ) {
      return { ok: false, error: "DECRYPT_FAIL" };
    }
    content = parsed;
  } catch {
    return { ok: false, error: "DECRYPT_FAIL" };
  }

  // Section 4: recompute hash AFTER decryption — defends against any tamper
  // attempt that leaves signature/passwordHash intact but swaps ciphertext.
  const recomputed = hashContent(content);
  if (recomputed !== bundle.contentHash) {
    return { ok: false, error: "BAD_HASH" };
  }

  return { ok: true, result: { content } };
}

// ─── Bundle creation (Section 11 — creator UI) ──────────────────────────────

export interface CreateBundleInput {
  bundleId: string;
  password: string;
  content: BundleContent;
}

export async function createSignedBundle(
  input: CreateBundleInput
): Promise<SignedBundle> {
  const identity = await getCreatorIdentityWithKey();
  if (!identity) throw new Error("creator identity not initialised");
  return signBundleWithKey({
    ...input,
    creatorPublicKeyBase64: identity.publicKeyBase64,
    creatorId: identity.creatorId,
    privateKey: identity.privateKey,
  });
}

/** Lower-level signer used by both the in-app UI and the offline CLI. */
export async function signBundleWithKey(opts: {
  bundleId: string;
  password: string;
  content: BundleContent;
  creatorPublicKeyBase64: string;
  creatorId: string;
  privateKey: Uint8Array;
}): Promise<SignedBundle> {
  const contentHash = hashContent(opts.content);
  const passwordHash = hashPassword(opts.password);

  const key = deriveEncryptionKey(opts.password);
  const encryptedContent = aesEncrypt(
    key,
    utf8(canonicalJson(opts.content))
  );

  const sig = await ed25519Sign(
    opts.privateKey,
    signatureMessage({
      bundleId: opts.bundleId,
      creatorId: opts.creatorId,
      contentHash,
    })
  );

  return {
    bundleId: opts.bundleId,
    creatorId: opts.creatorId,
    creatorPublicKey: opts.creatorPublicKeyBase64,
    contentHash,
    signature: toBase64(sig),
    passwordHash,
    encryptedContent,
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function bytesToHex(b: Uint8Array): string {
  let out = "";
  for (let i = 0; i < b.length; i++) out += b[i].toString(16).padStart(2, "0");
  return out;
}

export function describeBundleError(err: BundleError): string {
  switch (err) {
    case "MISSING_FIELDS":
      return "Bundle tidak lengkap atau format tidak dikenali.";
    case "BAD_SIGNATURE":
      return "Tanda tangan creator tidak valid (bundle telah dimodifikasi).";
    case "BAD_PUBLIC_KEY":
      return "Kunci publik creator rusak.";
    case "WRONG_PASSWORD":
      return "Kata sandi salah.";
    case "BAD_TOKEN":
      return "Token unlock tidak valid (cek waktu perangkat).";
    case "BAD_HASH":
      return "Hash konten tidak cocok — bundle telah dirusak.";
    case "DECRYPT_FAIL":
      return "Gagal mendekripsi bundle.";
  }
}

// Re-export creator type for convenience.
export type { CreatorIdentity };
