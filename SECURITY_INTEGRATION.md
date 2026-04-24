# Offline Secure Bundle System — Integration Guide

This document describes the offline secure system added to the LearningPath
mobile app. It implements the full 15-section spec with no backend, no network
calls, and no third-party crypto SaaS — only `@noble/ed25519`,
`@noble/hashes`, and `@noble/ciphers`.

> Everything is fully offline. The app never contacts a server to validate a
> license, verify a creator, or unlock a bundle.

---

## 1. File map

### In-app modules (consumer side)
| File | Spec section | Purpose |
| --- | --- | --- |
| `artifacts/mobile/utils/security/crypto.ts` | 12, 13 | hex/base64, canonical JSON, SHA-256, Ed25519, AES-256-GCM, dynamic unlock token, password hash |
| `artifacts/mobile/utils/security/master-public-key.ts` | 1 | Hard-coded app master Ed25519 public key (hex) |
| `artifacts/mobile/utils/security/secure-storage.ts` | — | `expo-secure-store` on native, `AsyncStorage` fallback on web |
| `artifacts/mobile/utils/security/device.ts` | 1 | Stable device ID (Expo `Application` API + persisted random fallback) |
| `artifacts/mobile/utils/security/app-license.ts` | **1** | Activation-key parsing, signature verification, expiry & deviceId checks, persistence |
| `artifacts/mobile/utils/security/creator.ts` | **2** | Per-user creator Ed25519 keypair, generated and stored on-device |
| `artifacts/mobile/utils/security/bundle.ts` | **3–9** | Self-signed encrypted bundle: build → contentHash → encrypt → sign, and inverse: parse → verify signature → unlock token → decrypt |

### UI screens
| File | Spec section | Purpose |
| --- | --- | --- |
| `artifacts/mobile/app/activate.tsx` | 11 | App-level lock screen — paste activation key, see device ID |
| `artifacts/mobile/app/_layout.tsx` (gated) | 1, 11 | Hard gate: app cannot render until `isAppActivated()` is true |
| `artifacts/mobile/app/creator/index.tsx` | 11 | Become a creator, view/copy creator ID & public key |
| `artifacts/mobile/app/creator/create-bundle.tsx` | 11 | Build cards → password → sign + encrypt → export JSON |
| `artifacts/mobile/app/bundle/open.tsx` | 8, 11 | Paste a bundle → verify signature → password → decrypt → preview |

### Offline CLI tools
| File | Spec section | Purpose |
| --- | --- | --- |
| `artifacts/mobile/scripts/security/keygen-app.mjs` | **10** | Generate the app master keypair (one-time, by you) |
| `artifacts/mobile/scripts/security/keygen-creator.mjs` | 10 | Generate a creator keypair offline |
| `artifacts/mobile/scripts/security/sign-app-activation.mjs` | 10 | Sign an activation key for a specific user/device |
| `artifacts/mobile/scripts/security/sign-bundle.mjs` | 10 | Build, encrypt, and sign a bundle from JSON content + creator priv key |

### Demo files
| File | Purpose |
| --- | --- |
| `examples/activation-key.json` | A demo activation key (unbound device, valid 10 years) |
| `examples/bundle.json` | A demo signed+encrypted bundle, password `hunter2` |
| `examples/bundle-source.json` | The plaintext source the demo bundle was built from |

---

## 2. End-to-end flow

```
                     APP MASTER KEYPAIR  (one-time, you only)
                     │
                     │ priv  ─────────────────────► sign activation keys
                     │ pub   ─── HARDCODED ────────► utils/security/master-public-key.ts
                     ▼
   ┌──────────────────────────── CONSUMER DEVICE ────────────────────────────┐
   │                                                                         │
   │  ┌─────── Section 1: Global App Lock ────────┐                          │
   │  │ activation-key.json (Ed25519 signed)      │                          │
   │  │  → verify against master pub              │                          │
   │  │  → check expiry                            │                          │
   │  │  → check deviceId (if bound)               │                          │
   │  │  → store in expo-secure-store              │                          │
   │  │  → app unlocks                             │                          │
   │  └────────────────────────────────────────────┘                          │
   │                                                                         │
   │  ┌─────── Section 2: Creator Identity (per user) ─────┐                 │
   │  │ Generate Ed25519 keypair on-device                  │                 │
   │  │ creatorId = sha256("creator:" + pubHex).slice(0,32) │                 │
   │  │ priv stored in expo-secure-store, NEVER leaves device│                │
   │  └─────────────────────────────────────────────────────┘                 │
   │                                                                         │
   │  ┌─────── Sections 3-7: Build Bundle ─────────────────┐                 │
   │  │ content = { cards, media }                          │                 │
   │  │ contentHash = sha256(canonicalJSON(content))        │                 │
   │  │ key = sha256(password)                              │                 │
   │  │ encryptedContent = AES-256-GCM(key, content)        │                 │
   │  │ passwordHash = sha256("pw:" + password)             │                 │
   │  │ signature = Ed25519(creatorPriv, msg) where         │                 │
   │  │   msg = canonicalJSON({                             │                 │
   │  │     bundleId, creatorId, creatorPublicKey,          │                 │
   │  │     contentHash, passwordHash                       │                 │
   │  │   })                                                │                 │
   │  └─────────────────────────────────────────────────────┘                 │
   │                                                                         │
   │  ┌─────── Section 8: Open Bundle (consumer) ──────────┐                 │
   │  │ 1. Verify Ed25519(creatorPublicKey, signature, msg) │                 │
   │  │ 2. Verify creatorId == derive(creatorPublicKey)     │                 │
   │  │ 3. Compute key = sha256(password)                   │                 │
   │  │ 4. Verify dynamic unlock token (±1 timeWindow)      │                 │
   │  │ 5. AES decrypt → content                            │                 │
   │  │ 6. Verify sha256(canonicalJSON(content))==contentHash│                │
   │  │ 7. Hold content in component state ONLY (Section 9) │                 │
   │  └─────────────────────────────────────────────────────┘                 │
   └─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Wire format

### Activation key
```jsonc
{
  "appId": "learningpath",
  "issuedAt": 1735689600000,
  "expiry": 2050240000000,        // ms epoch
  "deviceId": "abc123…",           // OPTIONAL — omit field for unbound key
  "signature": "<base64 Ed25519>"  // see signed-message format below
}
```
Signed-message format (UTF-8 bytes of the literal string, pipe-delimited;
empty string when `deviceId` is omitted):
```
${appId}|${issuedAt}|${expiry}|${deviceId ?? ""}
```

### Signed + encrypted bundle
```jsonc
{
  "bundleId": "kursus-fisika-vol1",
  "creatorId": "5bcb7dd5ffad642aa5a651ee193d094b",
  "creatorPublicKey": "<base64 Ed25519 pub (32 bytes)>",
  "contentHash": "<sha256 hex of canonicalJSON({cards, media})>",
  "passwordHash": "<sha256 hex of password>",
  "encryptedContent": "<base64(iv(12) || ciphertext || tag(16))>",
  "signature": "<base64 Ed25519 over the pipe-delimited message below>"
}
```
Signed-message format (UTF-8 bytes of the literal string):
```
${bundleId}|${creatorId}|${contentHash}
```
- `creatorId` MUST equal `sha256("creator:" + publicKeyHex).slice(0, 32)` (16-byte
  truncated hex digest of the public key in hex form). The verifier rejects a
  mismatch — prevents identity hijacking by re-signing with another keypair.
- `passwordHash = sha256(password)` (hex). Used for fast wrong-password rejection
  before attempting AES decryption.
- `encryptedContent` plaintext = `canonicalJSON({cards, media})` (UTF-8); key
  for AES-256-GCM = `sha256(password)`.

### Dynamic unlock token (Section 7)
At each unlock attempt, the verifier computes locally:
```
timeWindow = floor(Date.now() / 1000 / 3600)      // 1-hour windows
expected   = sha256(password + bundleId + timeWindow)
```
The check accepts `timeWindow`, `timeWindow-1`, and `timeWindow+1` to absorb
clock skew (≈ ±1 hour). The token never travels — it is recomputed locally and
gates the decryption attempt, ensuring the unlock happens in a recent time
window (no static reuse of a captured payload+attempt pair).

---

## 4. CLI usage

All scripts are pure ESM, run with bare `node`, no `npm install` required (they
import from the mobile app's `node_modules`).

### One-time: generate the app master key
```bash
node artifacts/mobile/scripts/security/keygen-app.mjs
# → Writes keys/security/app-master-private.hex (KEEP OFFLINE)
# → Prints the public key in hex.
# → COPY the public key into utils/security/master-public-key.ts
```

### Generate a creator keypair (offline)
```bash
node artifacts/mobile/scripts/security/keygen-creator.mjs
# → Writes keys/security/creator-<id>-private.hex
```

### Sign an activation key
```bash
APP_MASTER_PRIVATE_KEY=<hex>  \
  node artifacts/mobile/scripts/security/sign-app-activation.mjs \
    --appId=learningpath \
    --days=365 \
    [--deviceId=<DEVICE_ID>] \
    --out=examples/activation-key.json
```
Or place the key at `keys/security/app-master-private.hex` (the path used by
`keygen-app.mjs` by default) and omit the env var.
Omit `--deviceId` for an unbound key (any device with the JSON can activate).

### Sign + encrypt a bundle
```bash
node artifacts/mobile/scripts/security/sign-bundle.mjs examples/bundle-source.json \
  --bundleId=my-deck \
  --password=hunter2 \
  --creatorKey=keys/security/creator-XXXX-private.hex \
  --out=examples/bundle.json
```
The script derives the creator public key (and `creatorId`) from the private key
file. Where `bundle-source.json` looks like:
```json
{ "cards": [{ "q": "...", "a": "..." }, ...], "media": {} }
```

---

## 5. UI navigation map

```
┌─────────────────────────────────────────────────┐
│ App start                                       │
│   │                                             │
│   ▼  isAppActivated() ?                         │
│   │  no  ────►  /activate    (paste license)    │
│   │             on success → isAppActivated=true│
│   │                          → reload, gate lifts│
│   │  yes ────►  Tabs                            │
│                  └─► Profile                    │
│                       ├─ "Creator (Bundle Aman)"│
│                       │     └─► /creator        │
│                       │          └─► /creator/  │
│                       │              create-bundle│
│                       └─ "Buka Bundle Terkunci" │
│                             └─► /bundle/open    │
└─────────────────────────────────────────────────┘
```

---

## 6. Section-by-section compliance

| § | Requirement | Implementation |
| --- | --- | --- |
| 1 | Global app lock | `_layout.tsx` shows only `<ActivateScreen />` until `isAppActivated()` resolves true |
| 2 | Per-user creator Ed25519 keypair, on-device | `creator.ts` — generated, stored in expo-secure-store, never exported |
| 3 | Self-signed bundles with embedded creator pubkey | `bundle.ts:createSignedBundle` — creator pub embedded; verifier uses embedded pub |
| 4 | Deterministic SHA-256 content hash | `crypto.ts:canonicalJson` (sorted keys) → `sha256` |
| 5 | AES-256 encryption with key=SHA256(password) | `crypto.ts:aesEncrypt` (AES-256-GCM) with key from `deriveEncryptionKey` |
| 6 | Password hash stored | `passwordHash = sha256(password)` |
| 7 | Dynamic ±1-window unlock token | `crypto.ts:generateUnlockToken` + `validateUnlockToken` |
| 8 | Full unlock flow | `bundle.ts:unlockBundle` does verify→token→decrypt→hash check |
| 9 | Never persist decrypted content | Decrypted content lives only in `useState` of `bundle/open.tsx` |
| 10 | Offline Node.js CLI | `scripts/security/*.mjs`, no network |
| 11 | UI screens | `activate.tsx`, `creator/*`, `bundle/open.tsx` |
| 12-14 | noble libs only, fully offline | Imports limited to `@noble/ed25519`, `@noble/hashes`, `@noble/ciphers` |
| 15 | Integration docs | This file + `examples/*` |

---

## 7. Threat model notes

- **Forged activation key** — rejected: signature must verify against the
  hard-coded master public key.
- **Expired key / wrong device** — rejected by `verifyAppLicense` before
  storage.
- **Bundle re-signed by another creator** — rejected: `creatorId` must derive
  from the embedded public key.
- **Bundle ciphertext tampered** — rejected: AES-GCM tag fails, AND content
  hash check fails after decrypt.
- **Wrong password** — fast-rejected by `passwordHash` mismatch before
  attempting AES.
- **Replay of decrypted plaintext** — not possible from the bundle alone;
  plaintext never persisted (Section 9).
- **Stolen creator private key** — out of scope for the protocol; the consumer
  cannot distinguish a legitimate creator from a thief who has their priv key.
  Mitigation: `regenerateCreatorIdentity()` lets the user rotate; future
  bundles signed with the new key get a new `creatorId`.

---

## 8. Quick smoke test

1. Run the mobile app. You should land on **Aktivasi Aplikasi** (`/activate`).
2. Open `examples/activation-key.json`, copy its contents, paste, tap
   "Aktifkan". The app unlocks.
3. Profile → **Creator (Bundle Aman)** → "Generate Creator Keypair".
4. → **Buat Bundle Baru**, fill 1+ cards, set password `hunter2`, export.
   You should see the signed JSON.
5. Profile → **Buka Bundle Terkunci** → paste the JSON from step 4 → Verify →
   enter `hunter2` → Unlock. Cards appear.
6. Repeat step 5 with a wrong password → "Password salah." Repeat with
   `examples/bundle.json` to verify cross-creator interop.
