# LearningPath Activation Key CLI

Standalone offline tool to generate activation keys for the LearningPath mobile app.
No network calls. No backend. Run anywhere with Node.js 20+.

## Setup (one-time, on your local computer)

```bash
cd activation-cli
npm install         # or: pnpm install
```

## Save your master private key

The private key signs activation keys. Keep it secret.

Place your hex private key at:

```
keys/app-master-private.hex
```

(Single line, 64 hex characters, no whitespace.)

Or set it as an env var when running the sign command:

```bash
APP_MASTER_PRIVATE_KEY=<your_64_char_hex>
```

> **Important:** The PUBLIC key matching this private key must already be embedded
> in the app build (in `artifacts/mobile/utils/security/master-public-key.ts` at
> build time). If you change the master keypair, you must rebuild the app.

## Generate one activation key

```bash
node scripts/sign-app-activation.mjs \
  --appId=learningpath \
  --days=365 \
  --out=key.json
```

Optional flags:

| Flag | Default | Meaning |
|---|---|---|
| `--appId=<id>` | `learningpath` | Must match `APP_ID` in the app |
| `--days=<n>` | `365` | Validity period in days |
| `--deviceId=<id>` | (unbound) | Bind key to a specific device ID |
| `--out=<file>` | (stdout) | Write JSON to file instead of printing |

## Generate many activation keys at once

```bash
for i in 1 2 3 4 5; do
  node scripts/sign-app-activation.mjs \
    --appId=learningpath --days=365 --out=keys/key-$i.json
done
```

## Generate a brand-new master keypair (advanced — invalidates the app build)

```bash
node scripts/keygen-app.mjs
# → writes keys/app-master-private.hex (KEEP OFFLINE)
# → writes keys/app-master-public.hex
# → prints both hex values
```

After generating a new keypair you MUST update
`artifacts/mobile/utils/security/master-public-key.ts` with the new public key
and rebuild the app, otherwise old activation keys will fail and previously
signed keys won't unlock the new build.

## Wire format (what the app verifies)

```jsonc
{
  "appId":     "learningpath",
  "issuedAt":  1735689600000,            // ms epoch
  "expiry":    2050240000000,            // ms epoch
  "deviceId":  "abc123…",                // OPTIONAL — omit for unbound
  "signature": "<base64 Ed25519 signature>"
}
```

Signed message (UTF-8 bytes, pipe-delimited; empty string when `deviceId`
omitted):

```
${appId}|${issuedAt}|${expiry}|${deviceId ?? ""}
```

## Notes

- 100% offline. The CLI never makes a network request.
- Uses `@noble/ed25519` + `@noble/hashes` only. No native modules.
- Mirrors `artifacts/mobile/utils/security/crypto.ts` byte-for-byte so the
  in-app verifier and the CLI agree exactly.
