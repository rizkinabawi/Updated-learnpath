import './style.css';
import { createIcons, LayoutDashboard, Key, PenTool, Ticket, ShieldCheck, Copy, RefreshCw, CheckCircle2, Search, Info, Shield, Lock, Zap } from 'lucide';
import * as ed from "@noble/ed25519";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { randomBytes as nobleRandom } from "@noble/hashes/utils.js";

// Wire SHA-512 into ed25519 for v2 compatibility
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
ed.etc.sha512Async = async (...m) => sha512(ed.etc.concatBytes(...m));

// ── Helpers ───────────────────────────────────────────────────────────────────
const toHex = b => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
const fromHex = h => {
    const c = h.replace(/[^0-9a-fA-F]/g, '');
    if (c.length % 2) throw new Error("hex length odd");
    const o = new Uint8Array(c.length / 2);
    for (let i = 0; i < o.length; i++) o[i] = parseInt(c.substr(i * 2, 2), 16);
    return o;
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
const sha256h = s => sha256(utf8(s));

// Initialize Lucide Icons
const initIcons = () => {
    createIcons({
        icons: { LayoutDashboard, Key, PenTool, Ticket, ShieldCheck, Copy, RefreshCw, CheckCircle2, Search, Info, Shield, Lock, Zap }
    });
};

// ── UI Logic ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initIcons();

    // Tab Switching
    const navItems = document.querySelectorAll('.nav-item');
    const tabPanels = document.querySelectorAll('.tab-panel');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            
            navItems.forEach(i => i.classList.remove('active'));
            tabPanels.forEach(p => p.classList.remove('active'));

            item.classList.add('active');
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });

    // Copy Implementation
    document.querySelectorAll('[data-copy]').forEach(btn => {
        btn.addEventListener('click', () => {
            const elId = btn.getAttribute('data-copy');
            const text = document.getElementById(elId).textContent;
            navigator.clipboard.writeText(text).then(() => {
                alert('Copied to clipboard!');
            });
        });
    });

    // ── Functional Cryptography Impl ──────────────────────────────────────────

    // 1. Keypair
    const btnKeygen = document.getElementById('btn-keygen');
    btnKeygen.addEventListener('click', async () => {
        try {
            const sk = ed.utils.randomPrivateKey();
            const pk = await ed.getPublicKeyAsync(sk);
            document.getElementById('sk-val').textContent = toHex(sk);
            document.getElementById('pk-val').textContent = toHex(pk);
            document.getElementById('keygen-result').classList.remove('hidden');
        } catch (e) {
            alert('Gen failed: ' + e.message);
        }
    });

    // 2. Sign Activation Key
    const btnSign = document.getElementById('btn-sign');
    btnSign.addEventListener('click', async () => {
        const skHex = document.getElementById('sign-sk').value.trim();
        const appId = document.getElementById('sign-appid').value.trim() || 'learningpath';
        const days = parseInt(document.getElementById('sign-days').value);
        const device = document.getElementById('sign-device').value.trim();

        if (!skHex) return alert('Secret Key required!');
        
        try {
            const sk = fromHex(skHex);
            const issuedAt = Date.now();
            const expiry = issuedAt + days * 86400000;
            const msg = utf8(`${appId}|${issuedAt}|${expiry}|${device}`);
            const sig = await ed.signAsync(msg, sk);
            
            const license = { appId, issuedAt, expiry };
            if (device) license.deviceId = device;
            license.signature = toBase64(sig);

            document.getElementById('sign-output-json').textContent = JSON.stringify(license, null, 2);
            document.getElementById('sign-result').classList.remove('hidden');
        } catch (e) {
            alert('Sign failed: ' + e.message);
        }
    });

    // 3. Buyer Token
    const btnToken = document.getElementById('btn-token');
    btnToken.addEventListener('click', async () => {
        const skHex = document.getElementById('buyer-sk').value.trim();
        const bundleId = document.getElementById('buyer-bundle').value.trim();
        const buyerId = document.getElementById('buyer-id').value.trim();
        const days = parseInt(document.getElementById('buyer-days').value);

        if (!skHex || !bundleId || !buyerId) return alert('All fields required!');

        try {
            const sk = fromHex(skHex);
            const issuedAt = Date.now();
            const expiry = issuedAt + days * 86400000;
            const nonce = toHex(nobleRandom(8));
            const msg = utf8(`buyer|${bundleId}|${buyerId}|${issuedAt}|${expiry}|${nonce}`);
            const sig = await ed.signAsync(msg, sk);

            const token = {
                v: 1,
                bundleId,
                buyerId,
                issuedAt,
                expiry,
                nonce,
                signature: toBase64(sig)
            };

            document.getElementById('token-output-json').textContent = JSON.stringify(token, null, 2);
            document.getElementById('token-result').classList.remove('hidden');
        } catch (e) {
            alert('Token gen failed: ' + e.message);
        }
    });

    // 4. Verify
    const btnVerify = document.getElementById('btn-verify');
    btnVerify.addEventListener('click', async () => {
        const input = document.getElementById('verify-input').value.trim();
        const pkHex = document.getElementById('verify-pk').value.trim();
        const statusEl = document.getElementById('verify-status');

        if (!input || !pkHex) return alert('Input and PK required!');

        try {
            const pk = fromHex(pkHex);
            const data = JSON.parse(input);
            let msgText = '';

            if (data.nonce) {
                // Buyer Token
                msgText = `buyer|${data.bundleId}|${data.buyerId}|${data.issuedAt}|${data.expiry}|${data.nonce}`;
            } else {
                // Activation Key
                msgText = `${data.appId}|${data.issuedAt}|${data.expiry}|${data.deviceId || ""}`;
            }

            const sig = fromBase64(data.signature);
            const isOk = await ed.verifyAsync(sig, utf8(msgText), pk);

            statusEl.innerHTML = isOk 
                ? '<div class="alert success" style="color:var(--success); font-weight:700">✓ Cryptographically VALID</div>' 
                : '<div class="alert danger" style="color:var(--danger); font-weight:700">❌ INVALID Signature</div>';
        } catch (e) {
            statusEl.innerHTML = `<div class="alert danger" style="color:var(--danger)">ERROR: ${e.message}</div>`;
        }
    });
});
