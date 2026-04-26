console.log('MAIN.JS: STARTING LOAD');

import './style.css';
import * as edModule from "https://esm.sh/@noble/ed25519@3.1.0";
import { sha512 } from "https://esm.sh/@noble/hashes@1.7.2/sha2.js";
import { concatBytes, randomBytes } from "https://esm.sh/@noble/hashes/utils";

// Create a local extensible object to wrap the noble module
// This is critical to avoid "object is not extensible" errors in ESM environments
const ed = { 
    ...edModule,
    etc: { ...(edModule.etc || {}) }
};

console.log('CRYPTO_MODULE: WRAPPING MODULE');

try {
    // Manually wiring SHA-512 into the local extension
    ed.etc.sha512Sync = (...m) => sha512(concatBytes(...m));
    ed.etc.sha512Async = async (...m) => sha512(concatBytes(...m));
    console.log('CRYPTO_MODULE: etc.sha512Sync configured locally');
} catch (e) {
    console.warn('CRYPTO_MODULE: etc config skipped:', e.message);
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
        const pk = await ed.getPublicKey(sk);
        document.getElementById('sk-val').textContent = toHex(sk);
        document.getElementById('pk-val').textContent = toHex(pk);
        document.getElementById('keygen-result').classList.remove('hidden');
        toast('New Keypair Created', 'success');
    } catch(e) { toast(e.message, 'error'); }
});

// Logic: Sign
document.getElementById('btn-issue')?.addEventListener('click', async () => {
    const skHex = document.getElementById('issue-sk').value.trim();
    if (!skHex) return toast('SK Required', 'error');
    try {
        const sk = fromHex(skHex);
        const appId = document.getElementById('issue-appid').value.trim();
        const days = parseInt(document.getElementById('issue-days').value);
        const ia = Date.now();
        const ex = ia + (days * 86400000);
        
        // Exact format: appId|issuedAt|expiry|deviceId
        const msg = utf8(`${appId}|${ia}|${ex}|`);
        const sig = await ed.sign(msg, sk);
        const res = { appId, issuedAt: ia, expiry: ex, signature: toBase64(sig) };
        document.getElementById('issue-out').textContent = JSON.stringify(res, null, 2);
        document.getElementById('issue-out').style.display = 'block';
        toast('Signed success', 'success');
    } catch(e) { toast(e.message, 'error'); }
});

// Logic: Token
document.getElementById('btn-token')?.addEventListener('click', async () => {
    const skHex = document.getElementById('token-sk').value.trim();
    const bid = document.getElementById('token-bid').value.trim();
    const sid = document.getElementById('token-sid').value.trim();
    const cid = document.getElementById('token-cid').value.trim();
    const days = parseInt(document.getElementById('token-days').value);

    if (!skHex || !bid || !sid || !cid) return toast('Fields Required', 'error');
    try {
        const sk = fromHex(skHex);
        const ia = Date.now();
        const ex = ia + (days * 86400000);
        const nonce = toHex(randomBytes(12));
        
        // Exact format: bl1|bundleId|buyerId|nonce|issuedAt|expiry|creatorId
        const msg = utf8(`bl1|${bid}|${sid}|${nonce}|${ia}|${ex}|${cid}`);
        const sig = await ed.sign(msg, sk);
        const token = { v: 1, bundleId: bid, buyerId: sid, nonce, issuedAt: ia, expiry: ex, creatorId: cid, signature: toBase64(sig) };
        document.getElementById('token-output').textContent = JSON.stringify(token, null, 2);
        document.getElementById('token-output').parentElement.classList.remove('hidden');
        toast('Token Created', 'success');
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
        const ok = await ed.verify(fromBase64(data.signature), msg, pk);
        document.getElementById('verify-status').innerHTML = ok ? '<div style="color:#22c55e">✓ VALID</div>' : '<div style="color:#ef4444">❌ INVALID</div>';
    } catch(e) { toast(e.message, 'error'); }
});

console.log('MAIN.JS: READY');
