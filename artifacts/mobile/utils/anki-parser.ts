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
  // Capture <source src="..."> and <audio src="...">
  s = s.replace(/<(?:source|audio)[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi, (_, src) => {
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
  
  // Remove style/script content completely
  s = s.replace(/<(style|script)[\s\S]*?<\/\1>/gi, "");
  
  // Convert structural tags to newlines/spaces BEFORE stripping to avoid glued words
  // Br, Hr, and closing block tags should cause a break
  s = s.replace(/<\s*br[^>]*>/gi, "\n");
  s = s.replace(/<\s*hr[^>]*>/gi, "\n---\n");
  
  // Opening block tags -> newline
  s = s.replace(/<(p|div|li|tr|h[1-6]|ul|ol|blockquote|section|article|header|footer)[^>]*>/gi, "\n");
  // Closing block tags -> newline
  s = s.replace(/<\/(p|div|li|tr|h[1-6]|ul|ol|blockquote|section|article|header|footer)>/gi, "\n");
  
  // Table cells -> space
  s = s.replace(/<\s*\/?(td|th)[^>]*>/gi, " ");
  
  // Strip all remaining HTML tags (like <b>, <i>, <span>, etc.)
  // We don't add a space here to avoid breaking words like <b>W</b>ord
  s = s.replace(/<[^>]+>/g, "");
  
  // Decode common entities
  const entityMap: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&mdash;": "—",
    "&ndash;": "–",
    "&hellip;": "...",
    "&copy;": "©",
    "&reg;": "®",
  };
  s = s.replace(/&[a-z0-9#]+;/gi, (match) => entityMap[match.toLowerCase()] || match);
    
  // Clean up excessive whitespace safely
  // Remove spaces before/after newlines
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
  // Collapse 3 or more newlines into 2 (max 1 empty line between paragraphs)
  s = s.replace(/\n{3,}/g, "\n\n");
  // Collapse excessive spaces
  s = s.replace(/ {2,}/g, " ");
  
  return { text: s.trim(), media };
}

function splitFields(flds: string): string[] {
  // Anki uses 0x1f as field separator
  return flds.split("\x1f");
}

// ─── File helpers ────────────────────────────────────────────────────────────

async function readFileAsUint8Array(uri: string): Promise<Uint8Array> {
  if (Platform.OS === "web") {
    const resp = await fetch(uri);
    const buf = await resp.arrayBuffer();
    return new Uint8Array(buf);
  }

  // Native: ALWAYS use chunked FileSystem reading!
  // Do NOT use fetch() for local files! React Native's network bridge converts binary
  // payload to base64 strings under the hood. For large files (>200MB), this causes
  // a fatal "RangeError: String length exceeds limit" inside the Hermes engine before
  // the JS code even receives it.
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error("File tidak ditemukan.");
  
  // @ts-ignore - size exists on FileInfo when exists is true
  const size = info.size as number;
  const out = new Uint8Array(size);
  const chunkSize = 1024 * 1024; // 1MB chunks to prevent string overflow
  
  let position = 0;
  while (position < size) {
    const length = Math.min(chunkSize, size - position);
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: "base64",
      position,
      length,
    });
    const chunkBytes = base64ToUint8Array(b64);
    out.set(chunkBytes, position);
    position += length;
  }
  
  return out;
}

function base64ToUint8Array(b64: string): Uint8Array {
  const lookup = new Uint8Array(256);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  // Instead of using b64.replace() which creates a copy of a massive string and throws 
  // "String length exceeds limit" in Hermes, we calculate lengths directly.
  // Expo's readAsStringAsync(base64) returns clean base64 without newlines anyway.
  let validLen = 0;
  let placeHolders = 0;
  const len = b64.length;
  for (let i = 0; i < len; i++) {
    const code = b64.charCodeAt(i);
    if (code === 61) { // '='
      placeHolders++;
      validLen++;
    } else if (code < 256 && lookup[code] !== undefined) {
      validLen++;
    }
  }

  const arrLen = ((validLen * 3) >> 2) - placeHolders;
  const out = new Uint8Array(arrLen);

  let p = 0;
  let i = 0;
  while (i < len && p < arrLen) {
    let t = 0;
    let charsRead = 0;
    while (charsRead < 4 && i < len) {
      const code = b64.charCodeAt(i++);
      if (code === 61) {
        charsRead++;
      } else if (code < 256 && lookup[code] !== undefined) {
        t = (t << 6) | lookup[code]!;
        charsRead++;
      }
    }
    if (charsRead === 4) {
      if (p < arrLen) out[p++] = (t >> 16) & 0xff;
      if (p < arrLen) out[p++] = (t >> 8) & 0xff;
      if (p < arrLen) out[p++] = t & 0xff;
    }
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
  let sqliteEntry: JSZip.JSZipObject | null = null;
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
      sqliteEntry = entry;
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

  // ── Step 4 + 5: Open the SQLite database ────────────────────────────────
  // Two strategies:
  //   • Web/PWA: use deserializeDatabaseAsync to load from in-memory Uint8Array.
  //     This avoids needing a writable filesystem (which web doesn't have) and
  //     also avoids the previous "documentDirectory is undefined" crash.
  //   • Native: write to documentDirectory/SQLite/ and open by filename. This
  //     keeps the heavy SQLite bytes off the JS heap (better for big decks).
  onProgress?.({ stage: "loading-engine", message: "Menyiapkan database..." });

  let db: SQLite.SQLiteDatabase | null = null;
  let docDir: string | undefined;
  let tmpName: string | null = null;
  let tmpPath: string | null = null;

  if (Platform.OS === "web") {
    onProgress?.({ stage: "parsing-sqlite", message: "Memproses database..." });
    try {
      // expo-sqlite web uses wa-sqlite (WASM) and supports deserialize
      // straight from a Uint8Array — no filesystem needed.
      db = await (SQLite as any).deserializeDatabaseAsync(sqliteBytes);
      sqliteBytes = null as any; // allow GC
    } catch (e) {
      throw new AnkiImportError(
        "DB_CORRUPT",
        `Database Anki tidak bisa dibuka di browser: ${e instanceof Error ? e.message : String(e)}`,
        false,
      );
    }
  } else {
    docDir =
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

    tmpName = `anki_tmp_${Date.now()}.db`;
    tmpPath = `${sqliteDir}${tmpName}`;

    try {
      if (!sqliteEntry) throw new Error("No sqlite entry found.");
      const b64 = await sqliteEntry.async("base64");
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

    onProgress?.({ stage: "parsing-sqlite", message: "Memproses database..." });

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
  }

  if (!db) {
    throw new AnkiImportError(
      "ENGINE_FAILED",
      "Database SQLite tidak terbuka.",
      true,
    );
  }
  const dbRef: SQLite.SQLiteDatabase = db;

  try {
    // ── Step 6: Read deck names ────────────────────────────────────────────
    const deckMap: Record<string, string> = {};
    try {
      const colRows = await dbRef.getAllAsync<{ decks: string }>(
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

    const rows = await dbRef.getAllAsync<{ did: number | string; flds: string; tags: string }>(
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
        const b64 = await entry.async("base64");
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

      // Skip cards where either side is empty (cleaner data)
      if (!front.text.trim() || !back.text.trim()) continue;

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
    // Always close the DB connection and delete the temp file (native only)
    try { await db?.closeAsync(); } catch { /* ignore */ }
    if (tmpPath) {
      try { await FileSystem.deleteAsync(tmpPath, { idempotent: true }); } catch { /* ignore */ }
    }
  }
}
