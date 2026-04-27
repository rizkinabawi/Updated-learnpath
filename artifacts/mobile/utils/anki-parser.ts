/**
 * anki-parser.ts  —  Anki .apkg / .colpkg parser for React Native / Expo
 *
 * ARCHITECTURE (v2 — sql.js FREE):
 *   1. Read the .apkg file as raw bytes (via expo-file-system)
 *   2. Unzip with JSZip → find collection.anki2 / collection.anki21 SQLite bytes
 *   3. Write those bytes to a TEMPORARY file in documentDirectory
 *   4. Open it with expo-sqlite v16 (native SQLite, works on Hermes, no WASM)
 *   5. Query notes + cards, build AnkiCard[], clean up temp file
 *
 * Why this replaces sql.js:
 *   - sql.js needs a browser/Node.js WASM or ASM.js environment.
 *     Hermes on Android/iOS does NOT provide this — sql.js either crashes
 *     or returns 0 cards silently.
 *   - expo-sqlite uses the platform's native SQLite3 library, which is
 *     battle-tested, always available, and has no JS-engine dependency.
 */

import * as FileSystem from "expo-file-system/legacy";
import * as SQLite from "expo-sqlite";
import JSZip from "jszip";
import { Platform } from "react-native";

// ─── Public types (unchanged API surface) ───────────────────────────────────

export interface AnkiCard {
  front: string;
  back: string;
  tags?: string;
  media?: string[];
  imageUri?: string;
  audioUris?: string[];
  frontImageUris?: string[];
  backImageUris?: string[];
  frontAudioUris?: string[];
  backAudioUris?: string[];
}

export interface AnkiDeck {
  name: string;
  cards: AnkiCard[];
}

export interface AnkiParseResult {
  totalCards: number;
  decks: AnkiDeck[];
  mediaDir?: string;
}

export interface ParseOptions {
  importId?: string;
  maxRetries?: number;
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

export class AnkiImportError extends Error {
  retryable: boolean;
  code:
    | "READ_FAILED"
    | "NOT_ZIP"
    | "ZIP_CORRUPT"
    | "NO_DB"
    | "DB_UNSUPPORTED"
    | "DB_CORRUPT"
    | "ENGINE_FAILED"
    | "EMPTY"
    | "UNKNOWN";

  constructor(
    code: AnkiImportError["code"],
    message: string,
    retryable = false,
  ) {
    super(message);
    this.name = "AnkiImportError";
    this.code = code;
    this.retryable = retryable;
  }
}

// ─── HTML / Cloze stripper ───────────────────────────────────────────────────

function stripHtmlAndMedia(input: string): { text: string; media: string[] } {
  if (!input) return { text: "", media: [] };
  const media: string[] = [];
  let s = input;

  // Capture <img src="..."> (quoted)
  s = s.replace(/<img[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi, (_, src) => {
    media.push(String(src));
    return "";
  });
  // Capture <img src=filename> (unquoted)
  s = s.replace(/<img[^>]*\bsrc\s*=\s*([^\s>]+)[^>]*>/gi, (_, src) => {
    media.push(String(src));
    return "";
  });
  // Capture <source src="...">
  s = s.replace(/<source[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi, (_, src) => {
    media.push(String(src));
    return "";
  });
  // Capture <audio src="...">
  s = s.replace(/<audio[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi, (_, src) => {
    media.push(String(src));
    return "";
  });
  // Capture [sound:filename]
  s = s.replace(/\[sound:([^\]]+)\]/gi, (_, name) => {
    media.push(String(name));
    return "";
  });
  // Strip Anki Cloze markers: {{c1::answer}} → answer
  s = s.replace(/\{\{c\d+::([^:}]+)(?:::[^}]+)?\}\}/gi, (_, answer) => answer);
  // Remove style/script content
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  // Line breaks for block tags
  s = s.replace(/<\s*br\s*\/?>/gi, "\n");
  s = s.replace(/<\s*\/(p|div|li|tr|h[1-6])\s*>/gi, "\n");
  // Strip remaining tags
  s = s.replace(/<[^>]+>/g, "");
  // Decode common entities
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

// ─── File helpers ────────────────────────────────────────────────────────────

async function readFileAsBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, {
    encoding: "base64",
  });
}

async function readFileAsUint8Array(uri: string): Promise<Uint8Array> {
  // Efficient path: Use fetch to get an ArrayBuffer directly. 
  // Works on Web and modern Expo Native (SDK 49+).
  try {
    const resp = await fetch(uri);
    const buf = await resp.arrayBuffer();
    return new Uint8Array(buf);
  } catch (e) {
    // Fallback for older environments or specific URI types
    if (Platform.OS === "web") throw e;
    const b64 = await readFileAsBase64(uri);
    if (!b64) throw new Error("File empty or unreadable as Base64.");
    return base64ToUint8Array(b64);
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
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
  const lookup = new Uint8Array(256);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
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

// ─── Validation ──────────────────────────────────────────────────────────────

function isZipSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

function isSqliteSignature(bytes: Uint8Array): boolean {
  const sig = "SQLite format 3\0";
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[i] !== sig.charCodeAt(i)) return false;
  }
  return true;
}

// ─── Main public API ─────────────────────────────────────────────────────────

export async function parseAnkiPackage(
  fileUri: string,
  onProgress?: ProgressCb,
  options?: ParseOptions,
): Promise<AnkiParseResult> {
  const maxRetries = Math.max(0, options?.maxRetries ?? 1);
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await parseAnkiPackageOnce(fileUri, onProgress, options);
    } catch (e) {
      lastErr = e;
      const isAnki = e instanceof AnkiImportError;
      if (isAnki && !(e as AnkiImportError).retryable) throw e;
      if (attempt === maxRetries) throw e;
      await new Promise((r) => setTimeout(r, 300 + attempt * 300));
    }
  }
  throw lastErr ?? new AnkiImportError("UNKNOWN", "Gagal mengimpor file.");
}

// ─── Core parser (one attempt) ───────────────────────────────────────────────

async function parseAnkiPackageOnce(
  fileUri: string,
  onProgress?: ProgressCb,
  options?: ParseOptions,
): Promise<AnkiParseResult> {

  // ── Step 1: Read raw bytes ──────────────────────────────────────────────
  onProgress?.({ stage: "reading", message: "Membaca file..." });
  let raw: Uint8Array;
  try {
    raw = await readFileAsUint8Array(fileUri);
  } catch (e) {
    throw new AnkiImportError(
      "READ_FAILED",
      `Gagal membaca file: ${e instanceof Error ? e.message : String(e)}`,
      true,
    );
  }

  if (!isZipSignature(raw)) {
    throw new AnkiImportError(
      "NOT_ZIP",
      "File bukan paket Anki yang valid (bukan format ZIP). File mungkin rusak atau bukan .apkg/.colpkg.",
      false,
    );
  }

  // ── Step 2: Unzip ───────────────────────────────────────────────────────
  onProgress?.({ stage: "extracting", message: "Mengekstrak paket..." });
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(raw);
    // Allow GC to collect raw bytes — they can be several MB
    (raw as any) = null;
  } catch (e) {
    throw new AnkiImportError(
      "ZIP_CORRUPT",
      `Paket ZIP tampak rusak: ${e instanceof Error ? e.message : String(e)}`,
      false,
    );
  }

  // ── Step 3: Find the SQLite database inside the ZIP ────────────────────
  const candidates = ["collection.anki21b", "collection.anki21", "collection.anki2"];
  let sqliteBytes: Uint8Array | null = null;
  let foundAnki21b = false;

  for (const name of candidates) {
    const entry = zip.file(name);
    if (!entry) continue;
    const bytes = await entry.async("uint8array");
    if (name === "collection.anki21b") {
      foundAnki21b = true;
      continue; // zstd-compressed — not supported
    }
    if (isSqliteSignature(bytes)) {
      sqliteBytes = bytes;
      break;
    }
  }

  if (!sqliteBytes) {
    if (foundAnki21b) {
      throw new AnkiImportError(
        "DB_UNSUPPORTED",
        "File ini menggunakan format zstd baru (Anki 2.1.50+).\n\n" +
        "Cara ekspor ulang dari Anki Desktop:\n" +
        "  1. Buka Anki → File → Export\n" +
        "  2. Pilih 'Anki Deck Package (.apkg)'\n" +
        "  3. Centang ✅ 'Support older Anki versions (slower)'\n" +
        "  4. Klik Export → coba import file baru",
        false,
      );
    }
    throw new AnkiImportError(
      "NO_DB",
      "Tidak menemukan database Anki yang valid di dalam file. File mungkin rusak.",
      false,
    );
  }

  // ── Step 4: Find writable storage ───────────────────────────────────────
  // expo-sqlite needs a file path in the standard documentDirectory/SQLite/ folder.
  onProgress?.({ stage: "loading-engine", message: "Menyiapkan database..." });

  let docDir: string | undefined =
    (FileSystem as any).documentDirectory ||
    (FileSystem as any).Paths?.document?.uri ||
    undefined;

  if (!docDir) {
    docDir =
      (FileSystem as any).cacheDirectory ||
      (FileSystem as any).Paths?.cache?.uri ||
      undefined;
    if (docDir) {
      console.warn("[AnkiParser] Using fallback cacheDirectory:", docDir);
    }
  }

  if (typeof docDir !== "string" || docDir.length === 0) {
    throw new AnkiImportError(
      "ENGINE_FAILED",
      "Tidak menemukan direktori penyimpanan aplikasi (documentDirectory/cacheDirectory). " +
        "Coba tutup paksa lalu buka ulang aplikasi, atau berikan izin penyimpanan jika diminta.",
      true,
    );
  }

  console.log("[AnkiParser] Final docDir:", docDir);

  // Use the standard SQLite/ directory. expo-sqlite v16+ expects files here.
  // Defensive join in case docDir is missing the trailing slash.
  const sqliteDir = docDir.charAt(docDir.length - 1) === "/"
    ? `${docDir}SQLite/`
    : `${docDir}/SQLite/`;
  console.log("[AnkiParser] Target SQLite directory:", sqliteDir);

  try {
    const dirInfo = await FileSystem.getInfoAsync(sqliteDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });
    }
  } catch (e) {
    console.error("[AnkiParser] Failed to ensure SQLite dir:", e);
  }

  const tmpName = `anki_tmp_${Date.now()}.db`;
  const tmpPath = `${sqliteDir}${tmpName}`;

  try {
    const b64 = uint8ArrayToBase64(sqliteBytes);
    sqliteBytes = null as any; // allow GC
    if (!b64) throw new Error("Gagal mengonversi database ke Base64.");
    await FileSystem.writeAsStringAsync(tmpPath, b64, {
      encoding: "base64",
    });
  } catch (e) {
    throw new AnkiImportError(
      "ENGINE_FAILED",
      `Gagal menulis database sementara: ${e instanceof Error ? e.message : String(e)}`,
      true,
    );
  }

  // ── Step 5: Open with expo-sqlite (native) ──────────────────────────────
  onProgress?.({ stage: "parsing-sqlite", message: "Memproses database..." });

  let db: SQLite.SQLiteDatabase | null = null;
  try {
    // expo-sqlite v16 API: openDatabaseAsync(name, options)
    // When the file is in the SQLite/ directory, we can open it by filename.
    db = await SQLite.openDatabaseAsync(tmpName, { useNewConnection: true });
  } catch (e) {
    // Clean up temp file on failure
    try { await FileSystem.deleteAsync(tmpPath, { idempotent: true }); } catch { /* ignore */ }
    throw new AnkiImportError(
      "DB_CORRUPT",
      `Database Anki tidak bisa dibuka: ${e instanceof Error ? e.message : String(e)}`,
      false,
    );
  }

  try {
    // ── Step 6: Read deck names ────────────────────────────────────────────
    const deckMap: Record<string, string> = {};
    try {
      const colRows = await db.getAllAsync<{ decks: string }>(
        "SELECT decks FROM col LIMIT 1",
      );
      if (colRows[0]?.decks) {
        const parsed = JSON.parse(colRows[0].decks);
        for (const k of Object.keys(parsed)) {
          deckMap[k] = String(parsed[k]?.name ?? "Default");
        }
      }
    } catch {
      // col table might use different schema — fall back to using deck ID as name
    }

    // ── Step 7: Read notes + cards ─────────────────────────────────────────
    onProgress?.({ stage: "building-decks", message: "Menyusun kartu..." });

    const rows = await db.getAllAsync<{ did: number | string; flds: string; tags: string }>(
      `SELECT c.did, n.flds, n.tags
       FROM cards c
       JOIN notes n ON n.id = c.nid
       ORDER BY c.id
       LIMIT 20000`,
    );

    // ── Step 8: Build media map ────────────────────────────────────────────
    let mediaMap: Record<string, string> = {};
    const mediaEntry = zip.file("media");
    if (mediaEntry) {
      try {
        mediaMap = JSON.parse(await mediaEntry.async("string"));
      } catch {
        mediaMap = {};
      }
    }
    // Reverse: original filename → numeric key in ZIP
    const filenameToKey: Record<string, string> = {};
    for (const [k, v] of Object.entries(mediaMap)) {
      filenameToKey[String(v)] = String(k);
    }

    // ── Step 9: Prepare media extraction directory ─────────────────────────
    let mediaDirUri: string | null = null;
    if (options?.importId && Platform.OS !== "web") {
      mediaDirUri = `${docDir}anki-media/${options.importId}/`;
      try {
        await FileSystem.makeDirectoryAsync(mediaDirUri, { intermediates: true });
      } catch {
        // ignore — media will just be skipped
      }
    }

    const isImage = (n: string) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(n);
    const isAudio = (n: string) => /\.(mp3|m4a|wav|ogg|oga|opus|aac|flac)$/i.test(n);
    const extractedCache = new Map<string, string>();

    async function extractMedia(filename: string): Promise<string | null> {
      if (!mediaDirUri) return null;
      if (extractedCache.has(filename)) return extractedCache.get(filename)!;
      const key = filenameToKey[filename];
      if (!key) return null;
      const entry = zip.file(key);
      if (!entry) return null;
      try {
        const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const targetUri = `${mediaDirUri}${safeName}`;
        try {
          const info = await FileSystem.getInfoAsync(targetUri);
          if (info.exists && (info as any).size > 0) {
            extractedCache.set(filename, targetUri);
            return targetUri;
          }
        } catch {
          // fall through to re-extract
        }
        const bytes = await entry.async("uint8array");
        const b64 = uint8ArrayToBase64(bytes);
        if (!b64) throw new Error(`Gagal mengonversi media ${filename} ke Base64.`);
        await FileSystem.writeAsStringAsync(targetUri, b64, {
          encoding: "base64",
        });
        extractedCache.set(filename, targetUri);
        return targetUri;
      } catch {
        return null;
      }
    }

    // ── Step 10: Process rows into AnkiCard objects ────────────────────────
    const buckets = new Map<string, AnkiCard[]>();

    for (const row of rows) {
      const did = String(row.did ?? "0");
      const flds = String(row.flds ?? "");
      const tags = String(row.tags ?? "").trim();
      const fields = splitFields(flds);

      const front = stripHtmlAndMedia(fields[0] ?? "");
      // Smart back: 2+ fields → join rest; single field → use field[0] as back too
      const backRaw =
        fields.length >= 2
          ? fields.slice(1).join("\n").trim()
          : fields[0] ?? "";
      const back = stripHtmlAndMedia(backRaw || fields[0] || "");

      if (!front.text && !back.text) continue; // skip completely empty cards

      const allMedia = [...new Set([...front.media, ...back.media])];

      const card: AnkiCard = {
        front: front.text,
        back: back.text,
        tags: tags || undefined,
        media: allMedia.length ? allMedia : undefined,
      };

      // Extract media and attach URIs
      if (mediaDirUri && allMedia.length) {
        const frontUris = await Promise.all(front.media.map(extractMedia));
        const backUris = await Promise.all(back.media.map(extractMedia));

        const frontImgs = frontUris.filter((u): u is string => !!u && isImage(u));
        const frontAudios = frontUris.filter((u): u is string => !!u && isAudio(u));
        const backImgs = backUris.filter((u): u is string => !!u && isImage(u));
        const backAudios = backUris.filter((u): u is string => !!u && isAudio(u));

        if (frontImgs.length) { card.frontImageUris = frontImgs; card.imageUri = frontImgs[0]; }
        if (frontAudios.length) { card.frontAudioUris = frontAudios; }
        if (backImgs.length) card.backImageUris = backImgs;
        if (backAudios.length) card.backAudioUris = backAudios;
        card.audioUris = [...(frontAudios), ...(backAudios)].filter(Boolean);
      }

      if (!buckets.has(did)) buckets.set(did, []);
      buckets.get(did)!.push(card);

      // Yield every 50 cards so the UI doesn't hang during heavy media extraction
      if (buckets.get(did)!.length % 50 === 0) {
        onProgress?.({
          stage: "building-decks",
          message: `Memproses kartu ${buckets.get(did)!.length}...`,
          percent: Math.min(99, Math.round((buckets.get(did)!.length / (rows.length || 1)) * 100))
        });
        await new Promise(r => setTimeout(r, 0));
      }
    }

    // ── Step 11: Assemble decks ────────────────────────────────────────────
    const decks: AnkiDeck[] = [];
    for (const [did, cards] of buckets) {
      const name = deckMap[did] ?? `Deck ${did}`;
      decks.push({ name, cards });
    }

    // Sort decks alphabetically
    decks.sort((a, b) => a.name.localeCompare(b.name));

    const totalCards = decks.reduce((s, d) => s + d.cards.length, 0);

    if (totalCards === 0) {
      throw new AnkiImportError(
        "EMPTY",
        "Deck ini tidak memiliki kartu yang dapat diimpor. Pastikan deck tidak kosong.",
        false,
      );
    }

    onProgress?.({
      stage: "done",
      percent: 100,
      message: `${totalCards} kartu berhasil diimpor dari ${decks.length} deck.`,
    });

    return {
      totalCards,
      decks,
      mediaDir: mediaDirUri ?? undefined,
    };

  } finally {
    // Always close the DB connection and delete the temp file
    try { await db?.closeAsync(); } catch { /* ignore */ }
    try { await FileSystem.deleteAsync(tmpPath, { idempotent: true }); } catch { /* ignore */ }
  }
}
