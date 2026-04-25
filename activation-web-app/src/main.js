console.log('CRYPTO_MODULE: LOADING');

import './style.css';
import * as ed from "@noble/ed25519";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { randomBytes as nobleRandom } from "@noble/hashes/utils.js";

// Wire SHA-512 into ed25519 for v3 compatibility
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
ed.etc.sha512Async = async (...m) => sha512(ed.etc.concatBytes(...m));

// ── Helpers ───────────────────────────────────────────────────────────────────
const toHex = b => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
const fromHex = h => {
    try {
        const c = h.replace(/[^0-9a-fA-F]/g, '');
        if (c.length % 2) throw new Error("hex length odd");
        const o = new Uint8Array(c.length / 2);
        for (let i = 0; i < o.length; i++) o[i] = parseInt(c.substr(i * 2, 2), 16);
        return o;
    } catch(e) { throw new Error("Invalid hex key format"); }
};

const B64A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const toBase64 = bytes => {
    let o = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0;
        o += B64A[a >> 2]; o += B64A[((a & 3) << 4) | (b >> 4)];
        o += i + 1 < bytes.length ? B64A[((b & 15) << 2) | (c >> 6)] : '=';
        o += i + 2 < bytes.length ? B64A[c & 63] : '=';
    }
    return o;
};
const fromBase64 = b64 => {
    const cl = b64.replace(/[^A-Za-z0-9+/=]/g, '').replace(/=+$/, '');
    const o = new Uint8Array(Math.floor(cl.length * 3 / 4));
    let idx = 0, buf = 0, bits = 0;
    for (let i = 0; i < cl.length; i++) {
        const v = B64A.indexOf(cl[i]);
        if (v < 0) throw new Error("invalid base64");
        buf = (buf << 6) | v; bits += 6;
        if (bits >= 8) { bits -= 8; o[idx++] = (buf >> bits) & 0xff; }
    }
    return o.slice(0, idx);
};
const utf8 = s => new TextEncoder().encode(s);

// Global showToast proxy (defined in index.html)
const toast = (m, t) => window.showToast ? window.showToast(m, t) : console.log(m);

console.log('CRYPTO_MODULE: INITIALIZING LOGIC');

// 1. Copy Helper (using delegation)
document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy]');
    if (btn) {
        const elId = btn.getAttribute('data-copy');
        const targetEl = document.getElementById(elId);
        if (targetEl) {
            navigator.clipboard.writeText(targetEl.textContent).then(() => {
                toast('Copied to clipboard!', 'success');
            });
        }
    }
});

// 2. Logic: Keypair
const btnKeygen = document.getElementById('btn-keygen');
if (btnKeygen) {
    btnKeygen.addEventListener('click', async () => {
        try {
            const sk = nobleRandom(32);
            const pk = await ed.getPublicKey(sk);
            document.getElementById('sk-val').textContent = toHex(sk);
            document.getElementById('pk-val').textContent = toHex(pk);
            document.getElementById('keygen-result').classList.remove('hidden');
            toast('New keypair generated!', 'success');
        } catch (e) {
            toast('Gen failed: ' + e.message, 'error');
            console.error(e);
        }
    });
}

// 3. Logic: Sign Activation Key
const btnSign = document.getElementById('btn-sign');
if (btnSign) {
    btnSign.addEventListener('click', async () => {
        const skHex = document.getElementById('sign-sk')?.value?.trim();
        const appId = document.getElementById('sign-appid')?.value?.trim() || 'learningpath';
        const days = parseInt(document.getElementById('sign-days')?.value) || 365;
        const count = parseInt(document.getElementById('sign-count')?.value) || 1;
        const device = document.getElementById('sign-device')?.value?.trim() || "";

        if (!skHex) return toast('Secret Key required!', 'error');
        
        try {
            const sk = fromHex(skHex);
            const issuedAt = Date.now();
            const expiry = issuedAt + (days * 86400000);
            const signContainer = document.getElementById('sign-keys-container');
            if (signContainer) signContainer.innerHTML = '';
            
            const allKeys = [];
            for (let i = 0; i < count; i++) {
                const ia = issuedAt + i;
                const ex = expiry + i;
                const msg = utf8(`${appId}|${ia}|${ex}|${device}`);
                const sig = await ed.sign(msg, sk);
                const license = { appId, issuedAt: ia, expiry: ex, signature: toBase64(sig) };
                if (device) license.deviceId = device;
                allKeys.push(license);

                if (signContainer) {
                    const div = document.createElement('div');
                    div.className = 'code-box mt-10';
                    const codeId = `sign-key-${i}`;
                    div.innerHTML = `
                        <code id="${codeId}">${JSON.stringify(license)}</code>
                        <button class="btn-icon" data-copy="${codeId}"><i data-lucide="copy"></i></button>
                    `;
                    signContainer.appendChild(div);
                }
            }
            window._lastBatch = allKeys;
            document.getElementById('sign-result')?.classList.remove('hidden');
            if (window.lucide) window.lucide.createIcons();
            toast(`Generated ${count} keys!`, 'success');
        } catch (e) {
            toast('Sign failed: ' + e.message, 'error');
        }
    });
}

// 4. Logic: Buyer Token
const btnToken = document.getElementById('btn-token');
if (btnToken) {
    btnToken.addEventListener('click', async () => {
        const skHex = document.getElementById('buyer-sk')?.value?.trim();
        const bundleId = document.getElementById('buyer-bundle')?.value?.trim();
        const buyerId = document.getElementById('buyer-id')?.value?.trim();
        const creatorId = document.getElementById('buyer-creator')?.value?.trim();
        const days = parseInt(document.getElementById('buyer-days')?.value) || 365;

        if (!skHex || !bundleId || !buyerId || !creatorId) return toast('All fields required!', 'error');

        try {
            const sk = fromHex(skHex);
            const issuedAt = Date.now();
            const expiry = issuedAt + (days * 86400000);
            const nonce = toHex(nobleRandom(12));
            const msg = utf8(`bl1|${bundleId}|${buyerId}|${nonce}|${issuedAt}|${expiry}|${creatorId}`);
            const sig = await ed.sign(msg, sk);

            const token = { v: 1, bundleId, buyerId, nonce, issuedAt, expiry, creatorId, signature: toBase64(sig) };
            const output = document.getElementById('token-output-json');
            if (output) output.textContent = JSON.stringify(token);
            document.getElementById('token-result')?.classList.remove('hidden');
            toast('Token generated!', 'success');
        } catch (e) {
            toast('Token gen failed: ' + e.message, 'error');
        }
    });
}

// 5. Logic: Verify
const btnVerify = document.getElementById('btn-verify');
if (btnVerify) {
    btnVerify.addEventListener('click', async () => {
        const input = document.getElementById('verify-input')?.value?.trim();
        const pkHex = document.getElementById('verify-pk')?.value?.trim();
        const statusEl = document.getElementById('verify-status');

        if (!input || !pkHex) return toast('Input and PK required!', 'error');

        try {
            const pk = fromHex(pkHex);
            const data = JSON.parse(input);
            let msgText = data.nonce 
                ? `bl1|${data.bundleId}|${data.buyerId}|${data.nonce}|${data.issuedAt}|${data.expiry}|${data.creatorId}`
                : `${data.appId}|${data.issuedAt}|${data.expiry}|${data.deviceId || ""}`;

            const sig = fromBase64(data.signature);
            const isOk = await ed.verify(sig, utf8(msgText), pk);

            if (statusEl) {
                statusEl.innerHTML = isOk 
                    ? '<div class="alert success" style="color:var(--success); font-weight:700; padding:12px; background:rgba(34,197,94,0.1); border-radius:8px; margin-top:10px;">✓ Valid Signature</div>' 
                    : '<div class="alert danger" style="color:var(--danger); font-weight:700; padding:12px; background:rgba(239,68,68,0.1); border-radius:8px; margin-top:10px;">❌ Invalid Signature</div>';
            }
        } catch (e) {
            if (statusEl) statusEl.innerHTML = `<div class="alert danger" style="color:var(--danger); padding:10px;">Error: ${e.message}</div>`;
        }
    });
}

console.log('CRYPTO_MODULE: READY');
