import './style.css';
import * as edModule from "https://esm.sh/@noble/ed25519@3.1.0";
import { sha512 } from "https://esm.sh/@noble/hashes@1.7.2/sha2.js";
import { concatBytes } from "https://esm.sh/@noble/hashes/utils";

/** 
 * SINKRONISASI SISTEM V3.1
 * Logic ini identik 100% dengan CLI dan Mobile App
 */
const ed = edModule;
try { 
    // Di lingkungan browser modern, @noble/ed25519 v3 biasanya mendeteksi crypto.subtle otomatis.
    // Tapi kita tetapkan secara manual untuk kompatibilitas maksimal.
    if (ed.etc && Object.isExtensible(ed.etc)) {
        ed.etc.sha512Sync = (...m) => sha512(concatBytes(...m));
        ed.etc.sha512Async = async (...m) => sha512(concatBytes(...m));
    }
} catch (e) {
    console.warn('Manual hash setup skipped (likely auto-detected by library):', e.message);
}

// Deterministic UTF-8 (MATCHES MOBILE APP BYTES)
const utf8 = (s) => {
    const bytes = [];
    for (let i = 0; i < s.length; i++) {
        let c = s.charCodeAt(i);
        if (c < 0x80) bytes.push(c);
        else if (c < 0x800) { bytes.push(0xc0 | (c >> 6)); bytes.push(0x80 | (c & 0x3f)); }
        else if (c < 0xd800 || c >= 0xe000) {
            bytes.push(0xe0 | (c >> 12)); bytes.push(0x80 | ((c >> 6) & 0x3f)); bytes.push(0x80 | (c & 0x3f));
        } else {
            i++; c = 0x10000 + (((c & 0x3ff) << 10) | (s.charCodeAt(i) & 0x3ff));
            bytes.push(0xf0 | (c >> 18)); bytes.push(0x80 | ((c >> 12) & 0x3f));
            bytes.push(0x80 | ((c >> 6) & 0x3f)); bytes.push(0x80 | (c & 0x3f));
        }
    }
    return new Uint8Array(bytes);
};

const toHex = b => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
const fromHex = h => {
    const c = h.replace(/[^0-9a-fA-F]/g, '');
    const o = new Uint8Array(c.length / 2);
    for (let i = 0; i < o.length; i++) o[i] = parseInt(c.substr(i * 2, 2), 16);
    return o;
};
const toBase64 = b => {
    const B64A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let out = "";
    for (let i = 0; i < b.length; i += 3) {
      const a = b[i], b1 = i + 1 < b.length ? b[i + 1] : 0, c = i + 2 < b.length ? b[i + 2] : 0;
      out += B64A[a >> 2]; out += B64A[((a & 3) << 4) | (b1 >> 4)];
      out += i + 1 < b.length ? B64A[((b1 & 15) << 2) | (c >> 6)] : "=";
      out += i + 2 < b.length ? B64A[c & 63] : "=";
    }
    return out;
};
const fromBase64 = s => {
    const B64A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const clean = s.replace(/[^A-Za-z0-9+/=]/g, "").replace(/=+$/, "");
    const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
    let idx = 0, buf = 0, bits = 0;
    for (let i = 0; i < clean.length; i++) {
      const v = B64A.indexOf(clean[i]);
      buf = (buf << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out[idx++] = (buf >> bits) & 0xff; }
    }
    return out.slice(0, idx);
};

const toast = (m, type = 'success') => {
    const root = document.getElementById('toast-root');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = m;
    root.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3000);
};

// Tabs
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-item, .tab-panel').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// Copy
document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy]');
    if (btn) {
        const id = btn.getAttribute('data-copy');
        const text = document.getElementById(id).textContent;
        navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard!'));
    }
});

// Issue Logic
document.getElementById('btn-issue').addEventListener('click', async () => {
    const skHex = document.getElementById('issue-sk').value.trim();
    if (!skHex) return toast('Please enter Private Key', 'error');

    try {
        const sk = fromHex(skHex);
        const appId = document.getElementById('issue-appid').value.trim();
        const deviceId = document.getElementById('issue-device').value.trim();
        const eVal = parseFloat(document.getElementById('issue-expiry-val').value);
        const eUnit = document.getElementById('issue-expiry-unit').value;

        let multiplier = 86400000; // default days
        if (eUnit === 'minutes') multiplier = 60000;
        if (eUnit === 'weeks') multiplier = 86400000 * 7;
        if (eUnit === 'months') multiplier = 86400000 * 30;

        const ia = Date.now();
        const ex = ia + (eVal * multiplier);

        // FORMAT: appId|issuedAt|expiry|deviceId
        const msgStr = `${appId}|${ia}|${ex}|${deviceId}`;
        const msg = utf8(msgStr);
        const sig = await ed.sign(msg, sk);

        const res = { appId, issuedAt: ia, expiry: ex, signature: toBase64(sig) };
        if (deviceId) res.deviceId = deviceId;

        document.getElementById('issue-out').textContent = JSON.stringify(res, null, 2);
        document.getElementById('output-area').classList.remove('hidden');
        toast('Activation Token Generated');
    } catch (e) { toast(e.message, 'error'); }
});

// Verify Logic
document.getElementById('btn-verify').addEventListener('click', async () => {
    const raw = document.getElementById('verify-input').value.trim();
    const pkHex = document.getElementById('verify-pk').value.trim();
    if (!raw || !pkHex) return toast('Input Required', 'error');
    try {
        const data = JSON.parse(raw);
        const pk = fromHex(pkHex);
        const msg = utf8(`${data.appId}|${data.issuedAt}|${data.expiry}|${data.deviceId || ""}`);
        const ok = await ed.verify(fromBase64(data.signature), msg, pk);
        document.getElementById('verify-status').innerHTML = ok 
            ? '<i class="fa-solid fa-circle-check" style="color:#22c55e"></i> <strong style="color:#22c55e">VALID TOKEN</strong>' 
            : '<i class="fa-solid fa-circle-xmark" style="color:#ef4444"></i> <strong style="color:#ef4444">INVALID SIGNATURE</strong>';
    } catch(e) { toast('Invalid JSON Format', 'error'); }
});
