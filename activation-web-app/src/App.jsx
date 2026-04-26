import React, { useState, useEffect } from 'react';
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { concatBytes } from "@noble/hashes/utils";
import { 
  ShieldCheck, 
  Key, 
  Clock, 
  Smartphone, 
  Copy, 
  CheckCircle2, 
  AlertCircle, 
  Terminal, 
  Zap, 
  FileCode, 
  Lock,
  Search,
  CheckCircle,
  XCircle,
  Download
} from 'lucide-react';

/** 
 * PROTOKOL KEAMANAN V3.2 - UNIFIED
 * Logika ini sinkron byte-per-byte dengan Mobile App & CLI GUI.
 */

// Konfigurasi Hashing (Wajib untuk Noble v3)
try {
  if (ed.etc && !ed.etc.sha512Sync) {
    if (Object.isExtensible(ed.etc)) {
      ed.etc.sha512Sync = (...m) => sha512(concatBytes(...m));
      ed.etc.sha512Async = async (...m) => sha512(concatBytes(...m));
    }
  }
} catch (e) {
  console.warn("Manual SHA-512 setup skipped.");
}

// Deterministic UTF-8 Encoder (Sama dengan HP)
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
  const clean = h.replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
};
const toBase64 = b => btoa(String.fromCharCode(...b));
const fromBase64 = s => {
  const clean = s.replace(/[^A-Za-z0-9+/=]/g, "").replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let idx = 0, buf = 0, bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".indexOf(clean[i]);
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out[idx++] = (buf >> bits) & 0xff; }
  }
  return out.slice(0, idx);
};

/** Compact V2 binary packing */
function packLicenseV2(lic, sig) {
  const dBuf = utf8(lic.deviceId || "");
  const buf = new Uint8Array(1 + 1 + 8 + 8 + 1 + dBuf.length + 64);
  const view = new DataView(buf.buffer);
  
  buf[0] = 0x02;
  buf[1] = lic.mode === "trial" ? 1 : 0;
  view.setBigUint64(2, BigInt(lic.issuedAt));
  view.setBigUint64(10, BigInt(lic.expiry));
  buf[18] = dBuf.length;
  buf.set(dBuf, 19);
  buf.set(sig, 19 + dBuf.length);
  
  return toBase64(buf);
}

/** Compact V2 binary unpacking */
function unpackLicenseV2(bin) {
  if (bin.length < 1 + 1 + 8 + 8 + 1 + 64) return null;
  const view = new DataView(bin.buffer);
  const mode = bin[1] === 1 ? "trial" : "full";
  const issuedAt = Number(view.getBigUint64(2));
  const expiry = Number(view.getBigUint64(10));
  const dLen = bin[18];
  const deviceId = dLen > 0 ? new TextDecoder().decode(bin.slice(19, 19 + dLen)) : "";
  const sig = bin.slice(bin.length - 64);
  return { appId: "learningpath", mode, issuedAt, expiry, deviceId, signature: toBase64(sig) };
}

export default function App() {
  const [activeTab, setActiveTab] = useState('generate'); // 'generate' | 'verify'
  const [sk, setSk] = useState('');
  const [pk, setPk] = useState('cb1188467c03070da7da70edab724a59b77a5728183b2132a9bc4d31e4b1965e'); // Default LP Master PK
  const [appId, setAppId] = useState('learningpath');
  const [deviceId, setDeviceId] = useState('');
  const [mode, setMode] = useState('full');
  const [expiryVal, setExpiryVal] = useState(365);
  const [expiryUnit, setExpiryUnit] = useState('days');
  const [quantity, setQuantity] = useState(1);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);

  const [showSk, setShowSk] = useState(false);

  const generateToken = async () => {
    setCopied(false);
    setError('');
    setResult(null);
    try {
      if (!sk) throw new Error("Private Key required!");
      const privateKeyRaw = fromHex(sk);
      if (privateKeyRaw.length !== 32) throw new Error("Invalid Private Key length (must be 64 hex chars).");

      const tokens = [];
      const qty = Math.max(1, Math.min(Number(quantity), 100));
      
      let baseNow = Date.now();
      let multiplier = 86400000;
      if (expiryUnit === 'minutes') multiplier = 60000;
      if (expiryUnit === 'weeks') multiplier = 86400000 * 7;
      if (expiryUnit === 'months') multiplier = 86400000 * 30;

      for (let i = 0; i < qty; i++) {
        const now = baseNow + i;
        const expiry = now + (Number(expiryVal) * multiplier);
        const dId = deviceId.trim();
        
        // FORMAT: appId|issuedAt|expiry|deviceId|mode
        const msgStr = `${appId}|${now}|${expiry}|${dId}|${mode}`;
        const msg = utf8(msgStr);
        const sig = await ed.signAsync(msg, privateKeyRaw);
        
        const license = {
          appId,
          mode,
          issuedAt: now,
          expiry,
          signature: toBase64(sig)
        };
        if (dId) license.deviceId = dId;
        
        // Pack into V2 Blob
        license._blob = packLicenseV2(license, sig);
        tokens.push(license);
      }

      setResult(qty === 1 ? tokens[0] : tokens);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleVerify = async () => {
    setVerifyResult(null);
    setError('');
    try {
      if (!verifyInput) throw new Error("Input required!");
      if (!pk) throw new Error("Public Key required!");
      
      const publicKeyRaw = fromHex(pk);
      const inputClean = verifyInput.trim().replace(/\s+/g, '');
      
      let license = null;
      
      // Try V2 Binary
      try {
        const bin = fromBase64(inputClean);
        if (bin[0] === 0x02) {
          license = unpackLicenseV2(bin);
        }
      } catch (e) { /* not V2 */ }
      
      // Try JSON
      if (!license) {
        try {
          license = JSON.parse(verifyInput);
        } catch (e) {
          throw new Error("Invalid format: Must be V2 Blob or JSON.");
        }
      }
      
      if (!license.signature) throw new Error("Missing signature.");
      
      const sig = fromBase64(license.signature);
      const msg = utf8(`${license.appId}|${license.issuedAt}|${license.expiry}|${license.deviceId || ""}|${license.mode || "full"}`);
      
      const ok = await ed.verifyAsync(sig, msg, publicKeyRaw);
      const expired = Date.now() > license.expiry;
      
      setVerifyResult({
        ok,
        expired,
        license
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const quickTrial = (days) => {
    setMode('trial');
    setExpiryVal(days);
    setExpiryUnit('days');
    setError('');
    // Auto generate if SK is present
    if (sk) setTimeout(generateToken, 100);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadAll = () => {
    if (!result) return;
    const content = Array.isArray(result) 
      ? result.map((k, i) => `# Key #${i+1} (${k.mode})\n${k._blob}`).join('\n\n')
      : result._blob;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activation-keys-${Date.now()}.txt`;
    a.click();
  };

  return (
    <div className="app-container">
      <div className="glass-panel">
        <header className="header">
          <div className="logo-icon-wrapper">
            <div className="logo-icon"><ShieldCheck size={32} strokeWidth={2.5} /></div>
            <div className="status-dot"></div>
          </div>
          <div>
            <h1>LearningPath <span>Issuer</span></h1>
            <p>Cryptographic Activation System v3.2 (Unified)</p>
          </div>
        </header>

        <nav className="tab-nav">
          <button 
            className={activeTab === 'generate' ? 'active' : ''} 
            onClick={() => { setActiveTab('generate'); setError(''); }}
          >
            <Key size={16} /> Generator
          </button>
          <button 
            className={activeTab === 'verify' ? 'active' : ''} 
            onClick={() => { setActiveTab('verify'); setError(''); }}
          >
            <Search size={16} /> Verify
          </button>
        </nav>

        <main className="form-main animate-fade-in">
          {activeTab === 'generate' ? (
            <>
              <div className="input-grid">
                <div className="input-group full">
                  <div className="label-row">
                    <label><Lock size={14} /> Master Private Key (HEX)</label>
                    <button className="toggle-btn" onClick={() => setShowSk(!showSk)} tabIndex="-1">
                      {showSk ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div className="input-with-icon">
                    <input 
                      type={showSk ? "text" : "password"} 
                      value={sk} 
                      onChange={e => setSk(e.target.value)} 
                      placeholder="Paste 64-char hex master key..." 
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label><Terminal size={14} /> Application ID</label>
                  <input value={appId} onChange={e => setAppId(e.target.value)} />
                </div>

                <div className="input-group">
                  <label><Smartphone size={14} /> Device ID (Optional)</label>
                  <input 
                    value={deviceId} 
                    onChange={e => setDeviceId(e.target.value)} 
                    placeholder="Lock to specific device..." 
                  />
                </div>

                <div className="input-group">
                  <label><Zap size={14} /> License Mode</label>
                  <select value={mode} onChange={e => setMode(e.target.value)} className="mode-select">
                    <option value="full">Full Access (Lifetime)</option>
                    <option value="trial">Trial Mode (Time-limited)</option>
                  </select>
                </div>

                <div className="input-group">
                  <label><Clock size={14} /> Validity</label>
                  <div className="expiry-row">
                    <input 
                      type="number" 
                      value={expiryVal} 
                      onChange={e => setExpiryVal(e.target.value)} 
                      className="val-input"
                    />
                    <select value={expiryUnit} onChange={e => setExpiryUnit(e.target.value)} className="unit-select">
                      <option value="minutes">Min</option>
                      <option value="days">Days</option>
                      <option value="weeks">Wks</option>
                      <option value="months">Mths</option>
                    </select>
                  </div>
                </div>

                <div className="input-group">
                  <label><FileCode size={14} /> Batch Quantity</label>
                  <input 
                    type="number" 
                    value={quantity} 
                    onChange={e => setQuantity(Math.max(1, Math.min(100, Number(e.target.value))))} 
                    min="1"
                    max="100"
                  />
                </div>
              </div>

              <div className="quick-trial-section">
                <label>Quick Trial Presets:</label>
                <div className="trial-buttons">
                  <button onClick={() => quickTrial(7)}>7 Days</button>
                  <button onClick={() => quickTrial(30)}>30 Days</button>
                  <button onClick={() => quickTrial(90)}>90 Days</button>
                </div>
              </div>

              <button className="primary-btn" onClick={generateToken}>
                {quantity > 1 ? `Generate Batch of ${quantity}` : 'Sign Activation Key'}
              </button>
            </>
          ) : (
            <div className="verify-panel">
              <div className="input-group full">
                <label><Search size={14} /> Public Key (Master)</label>
                <input 
                  value={pk} 
                  onChange={e => setPk(e.target.value)} 
                  placeholder="Paste 64-char hex public key..." 
                />
              </div>
              <div className="input-group full">
                <label><FileCode size={14} /> V2 Blob or JSON Key</label>
                <textarea 
                  value={verifyInput} 
                  onChange={e => setVerifyInput(e.target.value)} 
                  placeholder="Paste activation code here..."
                  rows={4}
                />
              </div>
              <button className="primary-btn" onClick={handleVerify}>Verify Integrity</button>

              {verifyResult && (
                <div className={`verify-card ${verifyResult.ok ? 'ok' : 'fail'} animate-fade-in`}>
                  <div className="verify-icon">
                    {verifyResult.ok ? <CheckCircle color="#22c55e" /> : <XCircle color="#ef4444" />}
                  </div>
                  <div className="verify-details">
                    <h3>{verifyResult.ok ? 'Valid Signature' : 'Invalid Signature'}</h3>
                    <p>{verifyResult.expired ? '⚠️ Key is Expired' : '✅ Key is Active'}</p>
                    <div className="detail-grid">
                      <span>App: {verifyResult.license.appId}</span>
                      <span>Mode: {verifyResult.license.mode?.toUpperCase()}</span>
                      <span>Device: {verifyResult.license.deviceId || 'Any'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="error-box animate-shake">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {result && (
            <div className="result-area animate-fade-in">
              <div className="result-header">
                <h3>V2 Abstracted Token</h3>
                <div className="header-actions">
                  <button onClick={downloadAll} className="icon-btn" title="Download as .txt">
                    <Download size={16} />
                  </button>
                  <button onClick={() => copyToClipboard(Array.isArray(result) ? result.map(k=>k._blob).join('\n') : result._blob)} className="copy-btn">
                    {copied ? <CheckCircle2 size={16} color="#22c55e" /> : <Copy size={16} />}
                    {copied ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>
              </div>
              <div className="code-box">
                <pre>{Array.isArray(result) ? result.map(k => k._blob).join('\n') : result._blob}</pre>
              </div>
              <p className="hint">This is an abstract V2 binary blob. User should paste this exactly as shown.</p>
            </div>
          )}
        </main>

        <footer className="footer">
            <p>Fully compliant with Mobile v2 & CLI v2.1</p>
        </footer>
      </div>
    </div>
  );
}
