import React, { useState, useEffect } from 'react';
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { concatBytes } from "@noble/hashes/utils.js";
import { ShieldCheck, Key, Clock, Smartphone, Copy, CheckCircle2, AlertCircle, Terminal } from 'lucide-react';

/** 
 * PROTOKOL KEAMANAN V3.1 - UNIFIED
 * Logika ini sinkron byte-per-byte dengan Mobile App.
 */

// Konfigurasi Hashing (Wajib untuk Noble v3)
try {
  if (ed.etc && Object.isExtensible(ed.etc)) {
    ed.etc.sha512Sync = (...m) => sha512(concatBytes(...m));
    ed.etc.sha512Async = async (...m) => sha512(concatBytes(...m));
  }
} catch (e) {
  console.warn("Security init handled by library.");
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

export default function App() {
  const [sk, setSk] = useState('');
  const [appId, setAppId] = useState('learningpath');
  const [deviceId, setDeviceId] = useState('');
  const [expiryVal, setExpiryVal] = useState(36500);
  const [expiryUnit, setExpiryUnit] = useState('days');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const generateToken = async () => {
    setError('');
    try {
      if (!sk) throw new Error("Private Key wajib diisi!");
      const privateKeyRaw = fromHex(sk);
      if (privateKeyRaw.length !== 32) throw new Error("Private Key harus 32 bytes (64 karakter hex)");

      const now = Date.now();
      let multiplier = 86400000;
      if (expiryUnit === 'minutes') multiplier = 60000;
      if (expiryUnit === 'weeks') multiplier = 86400000 * 7;
      if (expiryUnit === 'months') multiplier = 86400000 * 30;

      const expiry = now + (expiryVal * multiplier);

      // MESSAGE BUILDER: appId|issuedAt|expiry|deviceId
      const msgStr = `${appId}|${now}|${expiry}|${deviceId.trim()}`;
      const msg = utf8(msgStr);
      
      const sig = await ed.signAsync(msg, privateKeyRaw);
      
      const token = {
        appId,
        issuedAt: now,
        expiry,
        signature: toBase64(sig)
      };
      if (deviceId.trim()) token.deviceId = deviceId.trim();

      setResult(token);
    } catch (err) {
      setError(err.message);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="app-container">
      <div className="glass-panel">
        <header className="header">
          <div className="logo-icon"><ShieldCheck size={32} /></div>
          <div>
            <h1>LearningPath <span>Master</span></h1>
            <p>Cryptographic Activation System v3.1</p>
          </div>
        </header>

        <main className="form-main">
          <div className="input-grid">
            <div className="input-group full">
              <label><Key size={14} /> Master Private Key (HEX)</label>
              <input 
                type="password" 
                value={sk} 
                onChange={e => setSk(e.target.value)} 
                placeholder="fe24bf45..." 
              />
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
                placeholder="7fb3d3ee..." 
              />
            </div>

            <div className="input-group full">
              <label><Clock size={14} /> Expiration Period</label>
              <div className="flex-row">
                <input 
                  type="number" 
                  value={expiryVal} 
                  onChange={e => setExpiryVal(e.target.value)} 
                  className="val-input"
                />
                <select value={expiryUnit} onChange={e => setExpiryUnit(e.target.value)}>
                  <option value="minutes">Minutes</option>
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                  <option value="months">Months</option>
                </select>
              </div>
            </div>
          </div>

          <button className="primary-btn" onClick={generateToken}>
            Generate Activation Key
          </button>

          {error && (
            <div className="error-box">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {result && (
            <div className="result-area animate-fade-in">
              <div className="result-header">
                <h3>V3.1 Activation Token</h3>
                <button onClick={copyToClipboard} className="copy-btn">
                  {copied ? <CheckCircle2 size={16} color="#22c55e" /> : <Copy size={16} />}
                  {copied ? 'Copied!' : 'Copy JSON'}
                </button>
              </div>
              <div className="code-box">
                <pre>{JSON.stringify(result, null, 2)}</pre>
              </div>
            </div>
          )}
        </main>

        <footer className="footer">
            <p>Standardized byte-for-byte with Mobile & CLI</p>
        </footer>
      </div>
    </div>
  );
}
