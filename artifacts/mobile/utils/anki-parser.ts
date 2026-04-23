/**
 * 100% client-side Anki .apkg / .colpkg parser.
 * - Uses JSZip to extract the package
 * - Uses sql.js (pure-JS asm.js variant — runs in Hermes & browser) to read SQLite
 * - Strips HTML, removes [sound:...] / image refs from card fields
 * - No network, no backend
 */

import { Platform } from "react-native";
import JSZip from "jszip";
import * as fsCompat from "./fs-compat";

export interface AnkiCard {
  front: string;
  back: string;
  tags?: string;
  /** Original media filenames referenced by the card (front + back). */
  media?: string[];
  /** Local file:// URI of the first image found, if any. */
  imageUri?: string;
  /** Local file:// URIs of any audio/sound clips referenced. */
  audioUris?: string[];
}

export interface AnkiDeck {
  name: string;
  cards: AnkiCard[];
}

export interface AnkiParseResult {
  totalCards: number;
  decks: AnkiDeck[];
  /** Directory where media files were extracted (if requested). */
  mediaDir?: string;
}

export interface ParseOptions {
  /** When provided, media files are extracted to <mediaDir>/<importId>/ and referenced from cards. */
  importId?: string;
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
  // Native: read directly as bytes (Uint8Array) — MUCH more memory efficient than base64
  return await fsCompat.readAsBytesAsync(uri);
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof globalThis.btoa === "function") {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(
        null,
        Array.from(bytes.subarray(i, i + chunk)) as unknown as number[],
      );
    }
    return globalThis.btoa(binary);
  }
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const a = bytes[i]!, b = bytes[i + 1]!, c = bytes[i + 2]!;
    out +=
      chars[a >> 2]! +
      chars[((a & 3) << 4) | (b >> 4)]! +
      chars[((b & 15) << 2) | (c >> 6)]! +
      chars[c & 63]!;
  }
  if (i < bytes.length) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    out += chars[a >> 2]! + chars[((a & 3) << 4) | (b >> 4)]!;
    if (i + 1 < bytes.length) {
      out += chars[(b & 15) << 2]! + "=";
    } else {
      out += "==";
    }
  }
  return out;
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
  options?: ParseOptions,
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

  // Build media name -> filename map. Inside the zip, media files are stored under
  // numeric names ("0", "1", ...) and the "media" file is a JSON mapping
  // {"0":"image.jpg", "1":"audio.mp3", ...}.
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
  // Reverse map: original filename -> numeric key in zip
  const filenameToKey: Record<string, string> = {};
  for (const [k, v] of Object.entries(mediaMap)) {
    filenameToKey[String(v)] = String(k);
  }

  // Extract media files to a per-import directory if requested.
  // We only extract files that are referenced by cards (lazy-ish: filter later),
  // but to keep things simple and offline-first we extract all referenced files
  // after we know which ones cards point to. For now, prepare the target dir.
  let mediaDirUri: string | null = null;
  if (options?.importId && Platform.OS !== "web" && fsCompat.documentDirectory) {
    mediaDirUri = `${fsCompat.documentDirectory}anki-media/${options.importId}/`;
    try {
      await fsCompat.makeDirectoryAsync(mediaDirUri, { intermediates: true });
    } catch {
      // ignore
    }
  }

  const isImageName = (n: string) =>
    /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(n);
  const isAudioName = (n: string) =>
    /\.(mp3|m4a|wav|ogg|oga|opus|aac|flac)$/i.test(n);

  // Cache of already-extracted file URIs so we don't extract the same file twice
  const extractedCache = new Map<string, string>();

  async function extractMediaFile(filename: string): Promise<string | null> {
    if (!mediaDirUri) return null;
    if (extractedCache.has(filename)) return extractedCache.get(filename) ?? null;
    const key = filenameToKey[filename];
    if (!key) return null;
    const entry = zip.file(key);
    if (!entry) return null;
    try {
      const bytes = await entry.async("uint8array");
      const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const targetUri = `${mediaDirUri}${safeName}`;
      // Native: write directly as bytes (Uint8Array) — MUCH more memory efficient than base64
      await fsCompat.writeAsBytesAsync(targetUri, bytes);
      extractedCache.set(filename, targetUri);
      return targetUri;
    } catch {
      return null;
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
        const mediaList = [...front.media, ...back.media].filter(Boolean);
        arr.push({
          front: front.text,
          back: back.text,
          tags: tags || undefined,
          media: mediaList,
        });
        buckets.set(deckName, arr);
      }
    }

    const decks: AnkiDeck[] = Array.from(buckets.entries()).map(
      ([name, cards]) => ({ name, cards }),
    );

    // Resolve media: extract referenced files to disk and attach URIs to each card.
    if (mediaDirUri) {
      onProgress?.({ stage: "building-decks", message: "Mengekstrak media..." });
      for (const deck of decks) {
        for (const card of deck.cards) {
          if (!card.media || card.media.length === 0) continue;
          const audioUris: string[] = [];
          let imageUri: string | undefined;
          for (const name of card.media) {
            const uri = await extractMediaFile(name);
            if (!uri) continue;
            if (!imageUri && isImageName(name)) imageUri = uri;
            else if (isAudioName(name)) audioUris.push(uri);
          }
          if (imageUri) card.imageUri = imageUri;
          if (audioUris.length > 0) card.audioUris = audioUris;
        }
      }
    }

    const totalCards = decks.reduce((s, d) => s + d.cards.length, 0);

    onProgress?.({ stage: "done", percent: 100 });
    return { totalCards, decks, mediaDir: mediaDirUri ?? undefined };
  } finally {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
}
