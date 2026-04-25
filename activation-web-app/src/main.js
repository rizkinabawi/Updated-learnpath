console.log('CRYPTO_MODULE: V3 INITIALIZING');

import './style.css';
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { concatBytes, randomBytes } from "@noble/hashes/utils.js";

// ── Noble v2/v3 compatibility (Synced with Mobile App's crypto.ts) ──
try {
    // Note: ed.etc might be frozen in ESM environments (like Vite builds).
    // We only set it if extensible. v3.x noble usually handles native hashing 
    // internally in modern browsers via crypto.subtle anyway.
    if (ed.etc && !Object.isFrozen(ed.etc)) {
        ed.etc.sha512Sync = (...m) => sha512(concatBytes(...m));
        ed.etc.sha512Async = async (...m) => sha512(concatBytes(...m));
        console.log('CRYPTO_MODULE: etc.sha512Sync configured');
    }
} catch (e) {
    console.warn('CRYPTO_MODULE: etc config skipped (frozen or missing):', e.message);
}

const toHex = b => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
const fromHex = h => {
    const c = h.replace(/[^0-9a-fA-F]/g, '');
    const o = new Uint8Array(c.length / 2);
    for (let i = 0; i < o.length; i++) o[i] = parseInt(c.substr(i * 2, 2), 16);
    return o;
};
const toBase64 = b => btoa(String.fromCharCode(...b));
const fromBase64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const utf8 = s => new TextEncoder().encode(s);
const toast = (m, t) => window.showToast ? window.showToast(m, t) : console.log(m);

// Logic: Copy
document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy]');
    if (btn) {
        const id = btn.getAttribute('data-copy');
        const el = document.getElementById(id);
        if (el) {
            navigator.clipboard.writeText(el.textContent).then(() => toast('Copied!', 'success'));
        }
    }
});

// Logic: Keypair
document.getElementById('btn-keygen')?.addEventListener('click', async () => {
    try {
        const sk = randomBytes(32);
        // noble-ed25519 v3 uses getPublicKey(sk)
        const pk = await ed.getPublicKey(sk);
        document.getElementById('sk-val').textContent = toHex(sk);
        document.getElementById('pk-val').textContent = toHex(pk);
        document.getElementById('keygen-result').classList.remove('hidden');
        toast('New Keypair Created', 'success');
    } catch(e) { toast(e.message, 'error'); }
});

// Logic: Sign
document.getElementById('btn-sign')?.addEventListener('click', async () => {
    const skHex = document.getElementById('sign-sk').value.trim();
    if (!skHex) return toast('SK Required', 'error');
    try {
        const sk = fromHex(skHex);
        const appId = document.getElementById('sign-appid').value.trim();
        const days = parseInt(document.getElementById('sign-days').value);
        const count = parseInt(document.getElementById('sign-count').value);
        const device = document.getElementById('sign-device').value.trim();
        const expiryDate = Date.now() + (days * 86400000);
        
        const container = document.getElementById('sign-keys-container');
        container.innerHTML = '';
        const list = [];
        
        for (let i = 0; i < count; i++) {
            const ia = Date.now() + i;
            const ex = expiryDate + i;
            // appId|issuedAt|expiry|deviceId
            const msg = utf8(`${appId}|${ia}|${ex}|${device}`);
            const sig = await ed.sign(msg, sk);
            const key = { appId, issuedAt: ia, expiry: ex, signature: toBase64(sig) };
            if (device) key.deviceId = device;
            list.push(key);
            
            const box = document.createElement('div');
            box.className = 'code-box mt-10';
            const codeId = `key-${i}`;
            box.innerHTML = `<code id="${codeId}">${JSON.stringify(key)}</code><button class="btn-icon" data-copy="${codeId}"><i data-lucide="copy"></i></button>`;
            container.appendChild(box);
        }
        window._lastBatch = list;
        document.getElementById('sign-result').classList.remove('hidden');
        toast(`Signed ${count} keys`, 'success');
    } catch(e) { toast(e.message, 'error'); }
});

// Logic: Token
document.getElementById('btn-token')?.addEventListener('click', async () => {
    const skHex = document.getElementById('buyer-sk').value.trim();
    const bid = document.getElementById('buyer-bundle').value.trim();
    const sid = document.getElementById('buyer-id').value.trim();
    const cid = document.getElementById('buyer-creator').value.trim();
    const days = parseInt(document.getElementById('buyer-days').value);

    if (!skHex || !bid || !sid || !cid) return toast('All Fields Required', 'error');
    try {
        const sk = fromHex(skHex);
        const ia = Date.now();
        const ex = ia + (days * 86400000);
        const nonce = toHex(randomBytes(12));
        // bl1|bundleId|buyerId|nonce|issuedAt|expiry|creatorId
        const msg = utf8(`bl1|${bid}|${sid}|${nonce}|${ia}|${ex}|${cid}`);
        const sig = await ed.sign(msg, sk);
        const token = { v: 1, bundleId: bid, buyerId: sid, nonce, issuedAt: ia, expiry: ex, creatorId: cid, signature: toBase64(sig) };
        document.getElementById('token-output-json').textContent = JSON.stringify(token);
        document.getElementById('token-result').classList.remove('hidden');
        toast('Buyer Token Created', 'success');
    } catch(e) { toast(e.message, 'error'); }
});

// Logic: Verify
document.getElementById('btn-verify')?.addEventListener('click', async () => {
    const raw = document.getElementById('verify-input').value.trim();
    const pkHex = document.getElementById('verify-pk').value.trim();
    if (!raw || !pkHex) return toast('Input Required', 'error');
    try {
        const data = JSON.parse(raw);
        const pk = fromHex(pkHex);
        const msg = data.nonce 
            ? utf8(`bl1|${data.bundleId}|${data.buyerId}|${data.nonce}|${data.issuedAt}|${data.expiry}|${data.creatorId}`)
            : utf8(`${data.appId}|${data.issuedAt}|${data.expiry}|${data.deviceId || ""}`);
        const sig = fromBase64(data.signature);
        const ok = await ed.verify(sig, msg, pk);
        document.getElementById('verify-status').innerHTML = ok ? '<div class="alert success" style="color:var(--success); font-weight:700;">✓ VALID</div>' : '<div class="alert danger" style="color:var(--danger); font-weight:700;">❌ INVALID</div>';
    } catch(e) { toast(e.message, 'error'); }
});

console.log('CRYPTO_MODULE: V3 READY');
