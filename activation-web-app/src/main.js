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
    try {
        initIcons();
    } catch (e) {
        console.warn('Lucide icons failed to init:', e);
    }

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

    // Toast Implementation
    const showToast = (msg, type = 'info') => {
        const root = document.getElementById('toast-root');
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.textContent = msg;
        root.appendChild(t);
        setTimeout(() => t.classList.add('show'), 10);
        setTimeout(() => {
            t.classList.remove('show');
            setTimeout(() => t.remove(), 400);
        }, 3000);
    };

    // Copy Implementation
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-copy]');
        if (btn) {
            const elId = btn.getAttribute('data-copy');
            const text = document.getElementById(elId).textContent;
            navigator.clipboard.writeText(text).then(() => {
                showToast('Copied to clipboard!', 'success');
            });
        }
    });

    // ── Functional Cryptography Impl ──────────────────────────────────────────

    // 1. Keypair
    const btnKeygen = document.getElementById('btn-keygen');
    btnKeygen.addEventListener('click', async () => {
        try {
            const sk = ed.utils.randomPrivateKey();
            const pk = await ed.getPublicKey(sk);
            document.getElementById('sk-val').textContent = toHex(sk);
            document.getElementById('pk-val').textContent = toHex(pk);
            document.getElementById('keygen-result').classList.remove('hidden');
            showToast('New keypair generated!', 'success');
        } catch (e) {
            showToast('Gen failed: ' + e.message, 'error');
            console.error(e);
        }
    });

    // 2. Sign Activation Key
    const btnSign = document.getElementById('btn-sign');
    const signContainer = document.getElementById('sign-keys-container');
    
    btnSign.addEventListener('click', async () => {
        const skHex = document.getElementById('sign-sk').value.trim();
        const appId = document.getElementById('sign-appid').value.trim() || 'learningpath';
        const days = parseInt(document.getElementById('sign-days').value);
        const count = parseInt(document.getElementById('sign-count').value) || 1;
        const device = document.getElementById('sign-device').value.trim();

        if (!skHex) return showToast('Secret Key required!', 'error');
        
        try {
            const sk = fromHex(skHex);
            const issuedAt = Date.now();
            const expiry = issuedAt + days * 86400000;
            
            signContainer.innerHTML = '';
            const allKeys = [];

            for (let i = 0; i < count; i++) {
                const ia = issuedAt + i;
                const ex = expiry + i;
                const msg = utf8(`${appId}|${ia}|${ex}|${device || ""}`);
                const sig = await ed.sign(msg, sk);
                
                const license = { appId, issuedAt: ia, expiry: ex, signature: toBase64(sig) };
                if (device) license.deviceId = device;

                allKeys.push(license);

                const div = document.createElement('div');
                div.className = 'code-box mt-10';
                const codeId = `sign-key-${i}`;
                div.innerHTML = `
                    <code id="${codeId}">${JSON.stringify(license)}</code>
                    <button class="btn-icon" data-copy="${codeId}"><i data-lucide="copy"></i></button>
                `;
                signContainer.appendChild(div);
            }
            
            window._lastBatch = allKeys;
            document.getElementById('sign-result').classList.remove('hidden');
            try { initIcons(); } catch(e) {}
            showToast(`Generated ${count} keys!`, 'success');
        } catch (e) {
            showToast('Sign failed: ' + e.message, 'error');
            console.error(e);
        }
    });

    document.getElementById('btn-copy-all-sign')?.addEventListener('click', () => {
        if (!window._lastBatch) return;
        const text = window._lastBatch.map(k => JSON.stringify(k)).join('\n\n');
        navigator.clipboard.writeText(text).then(() => showToast('All keys copied!', 'success'));
    });

    // File Upload for Key
    document.getElementById('file-key-upload')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (re) => {
            const hex = re.target.result.trim();
            if (hex.length === 64) {
                document.getElementById('sk-val').textContent = hex;
                document.getElementById('sign-sk').value = hex;
                document.getElementById('keygen-result').classList.remove('hidden');
                showToast('Key loaded successfully!', 'success');
                try { initIcons(); } catch(e) {}
            } else {
                showToast('Invalid hex key file', 'error');
            }
        };
        reader.readAsText(file);
    });

    // 3. Buyer Token
    const btnToken = document.getElementById('btn-token');
    btnToken.addEventListener('click', async () => {
        const skHex = document.getElementById('buyer-sk').value.trim();
        const bundleId = document.getElementById('buyer-bundle').value.trim();
        const buyerId = document.getElementById('buyer-id').value.trim();
        const creatorId = document.getElementById('buyer-creator').value.trim();
        const days = parseInt(document.getElementById('buyer-days').value);

        if (!skHex || !bundleId || !buyerId || !creatorId) return showToast('All fields required!', 'error');

        try {
            const sk = fromHex(skHex);
            const issuedAt = Date.now();
            const expiry = issuedAt + days * 86400000;
            const nonce = toHex(nobleRandom(12));
            const msg = utf8(`bl1|${bundleId}|${buyerId}|${nonce}|${issuedAt}|${expiry}|${creatorId}`);
            const sig = await ed.sign(msg, sk);

            const token = {
                v: 1,
                bundleId,
                buyerId,
                nonce,
                issuedAt,
                expiry,
                creatorId,
                signature: toBase64(sig)
            };

            document.getElementById('token-output-json').textContent = JSON.stringify(token);
            document.getElementById('token-result').classList.remove('hidden');
            showToast('Token generated!', 'success');
        } catch (e) {
            showToast('Token gen failed: ' + e.message, 'error');
            console.error(e);
        }
    });

    // 4. Verify
    const btnVerify = document.getElementById('btn-verify');
    btnVerify.addEventListener('click', async () => {
        const input = document.getElementById('verify-input').value.trim();
        const pkHex = document.getElementById('verify-pk').value.trim();
        const statusEl = document.getElementById('verify-status');

        if (!input || !pkHex) return showToast('Input and PK required!', 'error');

        try {
            const pk = fromHex(pkHex);
            const data = JSON.parse(input);
            let msgText = '';

            if (data.nonce) {
                // Buyer Token (bl1 format)
                msgText = `bl1|${data.bundleId}|${data.buyerId}|${data.nonce}|${data.issuedAt}|${data.expiry}|${data.creatorId}`;
            } else {
                // Activation Key
                msgText = `${data.appId}|${data.issuedAt}|${data.expiry}|${data.deviceId || ""}`;
            }

            const sig = fromBase64(data.signature);
            const isOk = await ed.verify(sig, utf8(msgText), pk);

            statusEl.innerHTML = isOk 
                ? '<div class="alert success" style="color:var(--success); font-weight:700; padding:12px; background:rgba(34,197,94,0.1); border-radius:8px; margin-top:10px;">✓ Cryptographically VALID</div>' 
                : '<div class="alert danger" style="color:var(--danger); font-weight:700; padding:12px; background:rgba(239,68,68,0.1); border-radius:8px; margin-top:10px;">❌ INVALID Signature</div>';
        } catch (e) {
            statusEl.innerHTML = `<div class="alert danger" style="color:var(--danger); padding:10px;">ERROR: ${e.message}</div>`;
            console.error(e);
        }
    });
});
});
