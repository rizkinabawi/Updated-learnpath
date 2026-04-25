console.log('MAIN.JS: INITIALIZING');

import './style.css';
// NAMED IMPORTS are critical to avoid frozen namespace issues
import { etc, getPublicKey, sign, verify, utils } from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { concatBytes, randomBytes } from "@noble/hashes/utils";

// ── CRYPTO SETUP (Sync with Mobile Core) ──
try {
    // In Noble v3, etc is an object that can be extended if imported as a named export
    // This resolves the "object is not extensible" error
    etc.sha512Sync = (...m) => sha512(concatBytes(...m));
    etc.sha512Async = async (...m) => sha512(concatBytes(...m));
    console.log('CRYPTO: SHA512 Mapped successfully');
} catch (e) {
    console.warn('CRYPTO: SHA512 Mapping failed:', e.message);
}

// ── Helpers ──
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
const alertToast = (m) => window.toast ? window.toast(m) : alert(m);

// ── KEYPAIR ──
document.getElementById('btn-keygen')?.addEventListener('click', async () => {
    try {
        const sk = randomBytes(32);
        const pk = await getPublicKey(sk);
        document.getElementById('val-sk').textContent = toHex(sk);
        document.getElementById('val-pk').textContent = toHex(pk);
        document.getElementById('keygen-out').style.display = 'block';
        alertToast('Generated Success');
    } catch(e) { alert(e.message); }
});

// ── ISSUE ──
document.getElementById('btn-issue')?.addEventListener('click', async () => {
    const skHex = document.getElementById('issue-sk').value.trim();
    if (!skHex) return alert('Need Private Key');
    try {
        const sk = fromHex(skHex);
        const appId = document.getElementById('issue-appid').value;
        const days = parseInt(document.getElementById('issue-days').value);
        const ia = Date.now();
        const ex = ia + (days * 86400000);
        
        // Message: appId|issuedAt|expiry|deviceId
        const msg = utf8(`${appId}|${ia}|${ex}|`);
        const sig = await sign(msg, sk);
        const res = { appId, issuedAt: ia, expiry: ex, signature: toBase64(sig) };
        const out = document.getElementById('issue-out');
        out.textContent = JSON.stringify(res, null, 2);
        out.style.display = 'block';
        alertToast('Signed Successfully');
    } catch(e) { alert(e.message); }
});

// ── TOKEN ──
document.getElementById('btn-token')?.addEventListener('click', async () => {
    const skHex = document.getElementById('token-sk').value.trim();
    const bid = document.getElementById('token-bid').value.trim();
    const sid = document.getElementById('token-sid').value.trim();
    const cid = document.getElementById('token-cid').value.trim();
    const days = parseInt(document.getElementById('token-days').value);
    
    if (!skHex || !bid || !sid || !cid) return alert('Fields Required');
    try {
        const sk = fromHex(skHex);
        const ia = Date.now();
        const ex = ia + (days * 86400000);
        const nonce = toHex(randomBytes(12));
        
        // Message: bl1|bundleId|buyerId|nonce|issuedAt|expiry|creatorId
        const msg = utf8(`bl1|${bid}|${sid}|${nonce}|${ia}|${ex}|${cid}`);
        const sig = await sign(msg, sk);
        const res = { v: 1, bundleId: bid, buyerId: sid, nonce, issuedAt: ia, expiry: ex, creatorId: cid, signature: toBase64(sig) };
        const out = document.getElementById('token-out');
        out.textContent = JSON.stringify(res, null, 2);
        out.style.display = 'block';
        alertToast('Token Successfully Created');
    } catch(e) { alert(e.message); }
});

// ── VERIFY ──
document.getElementById('btn-verify')?.addEventListener('click', async () => {
    const raw = document.getElementById('verify-json').value;
    const pkHex = document.getElementById('verify-pk').value.trim();
    if (!raw || !pkHex) return alert('Input Data & PK');
    try {
        const data = JSON.parse(raw);
        const pk = fromHex(pkHex);
        const msg = data.nonce 
            ? utf8(`bl1|${data.bundleId}|${data.buyerId}|${data.nonce}|${data.issuedAt}|${data.expiry}|${data.creatorId}`)
            : utf8(`${data.appId}|${data.issuedAt}|${data.expiry}|${data.deviceId || ""}`);
        const ok = await verify(fromBase64(data.signature), msg, pk);
        const status = document.getElementById('verify-status');
        status.textContent = ok ? '✓ SIGNATURE VALID' : '❌ SIGNATURE INVALID';
        status.style.color = ok ? '#22c55e' : '#ef4444';
    } catch(e) { alert(e.message); }
});

console.log('MAIN.JS: READY');
