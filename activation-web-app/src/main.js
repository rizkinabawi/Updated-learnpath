console.log('CRYPTO_MODULE: V3 START');

import './style.css';
// Unified v3.1.0 (Sync with Mobile App)
import * as ed from "https://esm.sh/@noble/ed25519@3.1.0";
import { sha512 } from "https://esm.sh/@noble/hashes@1.7.2/sha512";
import { randomBytes } from "https://esm.sh/@noble/hashes@1.7.2/utils";

// Mandatory v3 configuration for synchronous/asynchronous signing
// Note: Mobile app uses v3, so we must match its entropy and hashing behavior.
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
ed.etc.sha512Async = async (...m) => sha512(ed.etc.concatBytes(...m));

console.log('CRYPTO_MODULE: V3 LIB LOADED');

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
        const pk = await ed.getPublicKey(sk);
        document.getElementById('sk-val').textContent = toHex(sk);
        document.getElementById('pk-val').textContent = toHex(pk);
        document.getElementById('keygen-result').classList.remove('hidden');
        toast('New Keypair Created (v3)', 'success');
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
            // EXACT MESSAGE FORMAT: appId|issuedAt|expiry|deviceId
            const msg = utf8(`${appId}|${ia}|${ex}|${device}`);
            const sig = await ed.sign(msg, sk);
            const key = { appId, issuedAt: ia, expiry: ex, signature: toBase64(sig) };
            if (device) key.deviceId = device;
            list.push(key);
            
            const box = document.createElement('div');
            box.className = 'code-box mt-10';
            box.innerHTML = `<code id="key-${i}">${JSON.stringify(key)}</code><button class="btn-icon" data-copy="key-${i}"><i data-lucide="copy"></i></button>`;
            container.appendChild(box);
        }
        window._lastBatch = list;
        document.getElementById('sign-result').classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
        toast(`Signed ${count} keys (v3)`, 'success');
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
        // EXACT TOKEN FORMAT: bl1|bundleId|buyerId|nonce|issuedAt|expiry|creatorId
        const msg = utf8(`bl1|${bid}|${sid}|${nonce}|${ia}|${ex}|${cid}`);
        const sig = await ed.sign(msg, sk);
        const token = { v: 1, bundleId: bid, buyerId: sid, nonce, issuedAt: ia, expiry: ex, creatorId: cid, signature: toBase64(sig) };
        document.getElementById('token-output-json').textContent = JSON.stringify(token);
        document.getElementById('token-result').classList.remove('hidden');
        toast('Buyer Token Created (v3)', 'success');
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
        document.getElementById('verify-status').innerHTML = ok ? '<div class="alert success">✓ VALID V3</div>' : '<div class="alert danger">❌ INVALID V3</div>';
    } catch(e) { toast(e.message, 'error'); }
});

console.log('CRYPTO_MODULE: V3 READY');
