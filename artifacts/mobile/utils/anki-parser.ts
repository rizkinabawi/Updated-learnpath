/**
 * 100% client-side Anki .apkg / .colpkg parser.
 * - Uses JSZip to extract the package
 * - Uses sql.js (pure-JS asm.js variant — runs in Hermes & browser) to read SQLite
 * - Strips HTML, removes [sound:...] / image refs from card fields
 * - No network, no backend
 */

import { Platform } from "react-native";
import JSZip from "jszip";
import * as FileSystem from "expo-file-system";
import * as fsCompat from "./fs-compat";

export interface AnkiCard {
  front: string;
  back: string;
  tags?: string;
  media?: string[];
}

export interface AnkiDeck {
  name: string;
  cards: AnkiCard[];
}

export interface AnkiParseResult {
  totalCards: number;
  decks: AnkiDeck[];
}

export interface ParseProgress {
  stage:
    | "reading"
    | "extracting"
    | "loading-engine"
    | "parsing-sqlite"
    | "building-decks"
    | "done";
  percent?: number;
  message?: string;
}

type ProgressCb = (p: ParseProgress) => void;

// ---------------- Helpers ----------------

function stripHtmlAndMedia(input: string): { text: string; media: string[] } {
  if (!input) return { text: "", media: [] };
  const media: string[] = [];

  let s = input;
  // capture <img src="...">
  s = s.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, (_, src) => {
    media.push(String(src));
    return "";
  });
  // capture [sound:filename]
  s = s.replace(/\[sound:([^\]]+)\]/gi, (_, name) => {
    media.push(String(name));
    return "";
  });
  // remove style/script content
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  // line breaks for block tags
  s = s.replace(/<\s*br\s*\/?>/gi, "\n");
  s = s.replace(/<\s*\/(p|div|li|tr|h[1-6])\s*>/gi, "\n");
  // strip remaining tags
  s = s.replace(/<[^>]+>/g, "");
  // decode common entities
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: s, media };
}

function splitFields(flds: string): string[] {
  // Anki uses 0x1f as field separator
  return flds.split("\x1f");
}

// ---------------- Engine loader ----------------

let _SQL: any = null;

async function loadSqlEngine(onProgress?: ProgressCb): Promise<any> {
  if (_SQL) return _SQL;
  onProgress?.({ stage: "loading-engine", message: "Memuat mesin SQLite..." });

  // Use the asm.js (pure JS) variant so it runs on Hermes / RN without WASM.
  // This module exposes a factory function as default export.
  const mod: any = await import("sql.js/dist/sql-asm.js");
  const factory = mod.default ?? mod;
  _SQL = await factory();
  return _SQL;
}

// ---------------- File reading ----------------

async function readFileAsUint8Array(uri: string): Promise<Uint8Array> {
  if (Platform.OS === "web") {
    const resp = await fetch(uri);
    const buf = await resp.arrayBuffer();
    return new Uint8Array(buf);
  }
  // Native: read as base64 then decode
  const b64 = await fsCompat.readAsStringAsync(uri, { encoding: "base64" });
  return base64ToUint8Array(b64);
}

function base64ToUint8Array(b64: string): Uint8Array {
  // Use a tiny inline decoder; works in Hermes which lacks atob in some cases
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  // Fallback: pure JS decoder
  const lookup = new Uint8Array(256);
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, "");
  const len = clean.length;
  const placeHolders = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  const arrLen = ((len * 3) >> 2) - placeHolders;
  const out = new Uint8Array(arrLen);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const t =
      (lookup[clean.charCodeAt(i)]! << 18) |
      (lookup[clean.charCodeAt(i + 1)]! << 12) |
      (lookup[clean.charCodeAt(i + 2)]! << 6) |
      lookup[clean.charCodeAt(i + 3)]!;
    if (p < arrLen) out[p++] = (t >> 16) & 0xff;
    if (p < arrLen) out[p++] = (t >> 8) & 0xff;
    if (p < arrLen) out[p++] = t & 0xff;
  }
  return out;
}

// ---------------- Validation ----------------

function isZipSignature(bytes: Uint8Array): boolean {
  // PK\x03\x04
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

function isSqliteSignature(bytes: Uint8Array): boolean {
  // "SQLite format 3\0"
  const sig = "SQLite format 3\0";
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[i] !== sig.charCodeAt(i)) return false;
  }
  return true;
}

// ---------------- Main parser ----------------

export async function parseAnkiPackage(
  fileUri: string,
  onProgress?: ProgressCb,
): Promise<AnkiParseResult> {
  onProgress?.({ stage: "reading", message: "Membaca file..." });
  const raw = await readFileAsUint8Array(fileUri);

  if (!isZipSignature(raw)) {
    throw new Error("File bukan paket Anki yang valid (signature ZIP tidak ditemukan).");
  }

  onProgress?.({ stage: "extracting", message: "Mengekstrak paket..." });
  const zip = await JSZip.loadAsync(raw);

  // Find the SQLite collection — Anki uses collection.anki21 (newer) or collection.anki2 (older)
  const candidates = [
    "collection.anki21b",
    "collection.anki21",
    "collection.anki2",
  ];
  let sqliteBytes: Uint8Array | null = null;
  let usedName = "";
  for (const name of candidates) {
    const entry = zip.file(name);
    if (entry) {
      sqliteBytes = await entry.async("uint8array");
      usedName = name;
      if (sqliteBytes && isSqliteSignature(sqliteBytes)) break;
      // anki21b is zstd-compressed — not supported without zstd; try next
      sqliteBytes = null;
    }
  }
  if (!sqliteBytes) {
    throw new Error(
      "Tidak menemukan database Anki yang valid (collection.anki2/anki21).",
    );
  }
  if (!isSqliteSignature(sqliteBytes)) {
    throw new Error(
      `Database "${usedName}" bukan format SQLite yang didukung (mungkin dikompres zstd).`,
    );
  }

  // Build media name -> filename map (so we can later resolve refs if needed)
  // mediaMap is JSON: {"0":"image.jpg",...}
  let mediaMap: Record<string, string> = {};
  const mediaEntry = zip.file("media");
  if (mediaEntry) {
    try {
      const txt = await mediaEntry.async("string");
      mediaMap = JSON.parse(txt);
    } catch {
      mediaMap = {};
    }
  }

  onProgress?.({ stage: "parsing-sqlite", message: "Memproses database..." });
  const SQL = await loadSqlEngine(onProgress);
  const db = new SQL.Database(sqliteBytes);

  try {
    // Decks: stored as JSON in col.decks
    let deckMap: Record<string, string> = {};
    try {
      const colRes = db.exec("SELECT decks FROM col LIMIT 1");
      if (colRes[0]?.values?.[0]?.[0]) {
        const decksJson = String(colRes[0].values[0][0]);
        const parsed = JSON.parse(decksJson);
        for (const k of Object.keys(parsed)) {
          deckMap[k] = String(parsed[k]?.name ?? "Default");
        }
      }
    } catch {
      // ignore — fall back to deck id as name
    }

    onProgress?.({ stage: "building-decks", message: "Menyusun kartu..." });

    // Join cards -> notes to get fields + tags + deck id
    const rows = db.exec(`
      SELECT c.did, n.flds, n.tags
      FROM cards c
      JOIN notes n ON n.id = c.nid
    `);

    const buckets = new Map<string, AnkiCard[]>();

    if (rows[0]?.values) {
      for (const row of rows[0].values) {
        const did = String(row[0] ?? "0");
        const flds = String(row[1] ?? "");
        const tags = String(row[2] ?? "").trim();
        const fields = splitFields(flds);
        const front = stripHtmlAndMedia(fields[0] ?? "");
        const back = stripHtmlAndMedia(fields.slice(1).join("\n\n") ?? "");
        if (!front.text && !back.text) continue;

        const deckName = deckMap[did] ?? `Deck ${did}`;
        const arr = buckets.get(deckName) ?? [];
        arr.push({
          front: front.text,
          back: back.text,
          tags: tags || undefined,
          media: [...front.media, ...back.media].filter(Boolean),
        });
        buckets.set(deckName, arr);
      }
    }

    const decks: AnkiDeck[] = Array.from(buckets.entries()).map(
      ([name, cards]) => ({ name, cards }),
    );
    const totalCards = decks.reduce((s, d) => s + d.cards.length, 0);

    onProgress?.({ stage: "done", percent: 100 });
    return { totalCards, decks };
  } finally {
    try {
      db.close();
    } catch {
      // ignore
    }
    // mediaMap is referenced for future use (lazy media resolution)
    void mediaMap;
    void FileSystem;
  }
}
