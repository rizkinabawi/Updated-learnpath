console.log('MAIN.JS: STARTING LOAD');

import './style.css';

// Helpers derived from stable GUI CLI tool
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

const getCrypto = () => {
    if (!window.nobleEd25519) {
        throw new Error('nobleEd25519 library not loaded yet');
    }
    return window.nobleEd25519;
};

// Logic: Keygen
document.getElementById('btn-keygen')?.addEventListener('click', async () => {
    try {
        const ed = getCrypto();
        const sk = ed.utils.randomPrivateKey();
        const pk = await ed.getPublicKey(sk);
        document.getElementById('sk-val').textContent = toHex(sk);
        document.getElementById('pk-val').textContent = toHex(pk);
        document.getElementById('keygen-result').classList.remove('hidden');
    } catch(e) {
        alert('Keygen Error: ' + e.message);
    }
});

// Logic: Sign
document.getElementById('btn-sign')?.addEventListener('click', async () => {
    const skHex = document.getElementById('sign-sk').value.trim();
    if (!skHex) return alert('Enter Private Key');
    try {
        const ed = getCrypto();
        const sk = fromHex(skHex);
        const appId = document.getElementById('sign-appid').value.trim();
        const ia = Date.now();
        const ex = ia + (365 * 86400000);
        const msg = utf8(`${appId}|${ia}|${ex}|`); // Default empty deviceId for now
        const sig = await ed.sign(msg, sk);
        const license = { appId, issuedAt: ia, expiry: ex, signature: toBase64(sig) };
        document.getElementById('sign-output').textContent = JSON.stringify(license, null, 2);
        document.getElementById('sign-result').classList.remove('hidden');
    } catch(e) {
        alert('Sign Error: ' + e.message);
    }
});

// Logic: Token
document.getElementById('btn-token')?.addEventListener('click', async () => {
    try {
        const ed = getCrypto();
        const skHex = document.getElementById('buyer-sk').value.trim();
        const bid = document.getElementById('buyer-bundle').value.trim();
        const sid = document.getElementById('buyer-id').value.trim();
        const cid = document.getElementById('buyer-creator').value.trim();
        if (!skHex) return alert('SK required');
        
        const sk = fromHex(skHex);
        const ia = Date.now();
        const ex = ia + (365 * 86400000);
        const nonce = toHex(ed.utils.randomPrivateKey().slice(0, 12));
        const msg = utf8(`bl1|${bid}|${sid}|${nonce}|${ia}|${ex}|${cid}`);
        const sig = await ed.sign(msg, sk);
        const token = { v: 1, bundleId: bid, buyerId: sid, nonce, issuedAt: ia, expiry: ex, creatorId: cid, signature: toBase64(sig) };
        document.getElementById('token-output').textContent = JSON.stringify(token, null, 2);
        document.getElementById('token-result').classList.remove('hidden');
    } catch(e) {
        alert('Token Error: ' + e.message);
    }
});

// Logic: Verify
document.getElementById('btn-verify')?.addEventListener('click', async () => {
    try {
        const ed = getCrypto();
        const raw = document.getElementById('verify-input').value.trim();
        const pkHex = document.getElementById('verify-pk').value.trim();
        if (!raw || !pkHex) return alert('Input Required');
        
        const data = JSON.parse(raw);
        const pk = fromHex(pkHex);
        let msgStr = '';
        if (data.nonce) {
            msgStr = `bl1|${data.bundleId}|${data.buyerId}|${data.nonce}|${data.issuedAt}|${data.expiry}|${data.creatorId}`;
        } else {
            msgStr = `${data.appId}|${data.issuedAt}|${data.expiry}|${data.deviceId || ""}`;
        }
        
        const ok = await ed.verify(fromBase64(data.signature), utf8(msgStr), pk);
        const status = document.getElementById('verify-status');
        status.innerHTML = ok ? '<div class="alert success">VALID</div>' : '<div class="alert danger">INVALID</div>';
    } catch(e) {
        alert('Verify Error: ' + e.message);
    }
});

console.log('MAIN.JS: READY');
