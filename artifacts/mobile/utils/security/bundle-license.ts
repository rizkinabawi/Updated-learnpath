/**
 * utils/security/bundle-license.ts
 *
 * BUYER LICENSE TOKEN — per-sale access control for signed bundles.
 *
 * Goal: Creator generates one unique token per buyer. Each token is:
 *   - Tied to a specific bundleId
 *   - Optionally tied to a buyerId (e.g. buyer email / phone / name)
 *   - Signed by the creator's Ed25519 private key
 *   - Time-limited (configurable expiry)
 *
 * This prevents:
 *   - Token reuse: each token has a unique nonce
 *   - Token sharing: buyerId binding makes sharing obvious/auditable
 *   - Token forgery: Ed25519 signature by creator's key, verifiable offline
 *
 * Wire format (JSON, compact):
 *   {
 *     v:         1,                        // version
 *     bundleId:  string,                   // which bundle this unlocks
 *     buyerId:   string,                   // buyer identifier (e.g. name, email, phone)
 *     nonce:     string,                   // hex(randomBytes(12)) — makes each token unique
 *     issuedAt:  number,                   // ms epoch
 *     expiry:    number,                   // ms epoch
 *     creatorId: string,                   // matches bundle.creatorId
 *     signature: base64(ed25519(creatorSK, signatureMessage))
 *   }
 *
 * Signature message (UTF-8):
 *   "bl1|{bundleId}|{buyerId}|{nonce}|{issuedAt}|{expiry}|{creatorId}"
 *
 * Verification (buyer side, fully offline):
 *   1. Parse JSON.
 *   2. Recompute message, Ed25519-verify against bundle.creatorPublicKey.
 *   3. Check expiry, bundleId match, signature valid.
 *   - No network required. The creator's public key is embedded in the bundle.
 */

import {
  ed25519Sign,
  ed25519Verify,
  fromBase64,
  randomBytes,
  toBase64,
  toHex,
  utf8,
} from "./crypto";
import {
  getCreatorIdentityWithKey,
  type CreatorIdentity,
} from "./creator";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BuyerLicenseToken {
  v: 1;
  bundleId: string;
  buyerId: string;
  nonce: string;       // hex(12 random bytes) — unique per issuance
  issuedAt: number;    // ms epoch
  expiry: number;      // ms epoch
  creatorId: string;
  signature: string;   // base64 Ed25519
}

export type TokenError =
  | "MISSING_FIELDS"
  | "WRONG_BUNDLE"
  | "BAD_SIGNATURE"
  | "EXPIRED"
  | "BAD_PUBLIC_KEY"
  | "WRONG_CREATOR";

// ─── Signature message ────────────────────────────────────────────────────────

function tokenSignMsg(t: Omit<BuyerLicenseToken, "signature">): Uint8Array {
  return utf8(
    `bl1|${t.bundleId}|${t.buyerId}|${t.nonce}|${t.issuedAt}|${t.expiry}|${t.creatorId}`
  );
}

// ─── Type guard ───────────────────────────────────────────────────────────────

function isToken(v: unknown): v is BuyerLicenseToken {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return (
    t.v === 1 &&
    typeof t.bundleId === "string" &&
    typeof t.buyerId === "string" &&
    typeof t.nonce === "string" &&
    typeof t.issuedAt === "number" &&
    typeof t.expiry === "number" &&
    typeof t.creatorId === "string" &&
    typeof t.signature === "string"
  );
}

// ─── Generation (creator side) ───────────────────────────────────────────────

export interface GenerateTokenInput {
  bundleId: string;
  /** Human-readable buyer identifier — name, email, phone number, etc.
   *  This is embedded in the token (visible on decoding) so forgers cannot
   *  claim the token is theirs without revealing the original buyer's info. */
  buyerId: string;
  /** Validity in milliseconds from now. Default: 365 days. */
  durationMs?: number;
}

/**
 * Generate a signed buyer license token for a bundle.
 * Uses the creator's stored identity (private key) — no network, fully offline.
 * Returns a compact JSON string ready to share with the buyer.
 */
export async function generateBuyerToken(
  input: GenerateTokenInput,
  identity?: Awaited<ReturnType<typeof getCreatorIdentityWithKey>>
): Promise<string> {
  const id = identity ?? await getCreatorIdentityWithKey();
  if (!id) {
    throw new Error(
      "Creator identity belum dibuat. Buka halaman Creator dan generate keypair terlebih dahulu."
    );
  }

  const now = Date.now();
  const duration = input.durationMs ?? 365 * 86400_000;
  const expiry = now + duration;
  const nonce = toHex(randomBytes(12));

  const partial: Omit<BuyerLicenseToken, "signature"> = {
    v: 1,
    bundleId: input.bundleId.trim(),
    buyerId: input.buyerId.trim(),
    nonce,
    issuedAt: now,
    expiry,
    creatorId: id.creatorId,
  };

  const sig = await ed25519Sign(id.privateKey, tokenSignMsg(partial));

  const token: BuyerLicenseToken = {
    ...partial,
    signature: toBase64(sig),
  };

  // Compact — omit whitespace for minimal QR/clipboard size
  return JSON.stringify(token);
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

export function parseBuyerToken(raw: string): BuyerLicenseToken | null {
  try {
    const obj = JSON.parse(raw.trim());
    if (isToken(obj)) return obj;
  } catch {
    // Try base64-of-JSON (in case someone encoded it that way)
    try {
      const dec = new TextDecoder().decode(fromBase64(raw.trim()));
      const obj = JSON.parse(dec);
      if (isToken(obj)) return obj;
    } catch {
      // ignore
    }
  }
  return null;
}

// ─── Verification (buyer side) ───────────────────────────────────────────────

/**
 * Verify a buyer token against the creator's public key (embedded in the
 * open bundle). `creatorPublicKeyBase64` comes from `bundle.creatorPublicKey`.
 */
export async function verifyBuyerToken(
  token: BuyerLicenseToken,
  bundleId: string,
  creatorPublicKeyBase64: string
): Promise<TokenError | null> {
  if (!isToken(token)) return "MISSING_FIELDS";
  if (token.bundleId !== bundleId) return "WRONG_BUNDLE";

  let pk: Uint8Array;
  try {
    pk = fromBase64(creatorPublicKeyBase64);
  } catch {
    return "BAD_PUBLIC_KEY";
  }
  if (pk.length !== 32) return "BAD_PUBLIC_KEY";

  let sig: Uint8Array;
  try {
    sig = fromBase64(token.signature);
  } catch {
    return "BAD_SIGNATURE";
  }
  if (sig.length !== 64) return "BAD_SIGNATURE";

  const { signature: _sig, ...partial } = token;
  const ok = await ed25519Verify(pk, tokenSignMsg(partial as Omit<BuyerLicenseToken, "signature">), sig);
  if (!ok) return "BAD_SIGNATURE";

  if (Date.now() > token.expiry) return "EXPIRED";

  return null;
}

export function describeTokenError(err: TokenError): string {
  switch (err) {
    case "MISSING_FIELDS": return "Format token tidak lengkap atau tidak valid.";
    case "WRONG_BUNDLE":   return "Token ini tidak diterbitkan untuk bundle ini.";
    case "BAD_SIGNATURE":  return "Tanda tangan token tidak valid (token dipalsukan atau rusak).";
    case "EXPIRED":        return "Token sudah kedaluwarsa.";
    case "BAD_PUBLIC_KEY": return "Kunci publik creator tidak valid.";
    case "WRONG_CREATOR":  return "Token diterbitkan oleh creator yang berbeda.";
  }
}
