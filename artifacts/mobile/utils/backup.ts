import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "@/utils/fs-compat";

const STORAGE_KEYS = [
  "user",
  "learning_paths",
  "modules",
  "lessons",
  "flashcard_packs",
  "quiz_packs",
  "flashcards",
  "quizzes",
  "progress",
  "stats",
  "notes",
  "study_materials",
  "session_logs",
  "bookmarks",
  "spaced_rep",
  "theme",
  "standalone_collections",
] as const;

type StorageKey = (typeof STORAGE_KEYS)[number];

export interface BackupFile {
  version: 1;
  kind: "learnpath-backup";
  createdAt: string;
  data: Record<StorageKey, unknown>;
  media: Record<string, { name: string; base64: string }>;
}

const MEDIA_PROTOCOL = "lpbak://";

function isLocalFileUri(s: unknown): s is string {
  return (
    typeof s === "string" &&
    (s.startsWith("file://") ||
      s.startsWith(FileSystem.documentDirectory ?? "###") ||
      s.startsWith(FileSystem.cacheDirectory ?? "###"))
  );
}

function basename(uri: string): string {
  const clean = uri.split("?")[0].split("#")[0];
  const parts = clean.split("/");
  return parts[parts.length - 1] || "file";
}

async function tryReadBase64(uri: string): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    return await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch {
    return null;
  }
}

/**
 * Walk a JSON value, calling `replacer` on every string. The replacer may
 * return a new string, or null to leave it unchanged.
 */
async function mapStrings(
  value: unknown,
  replacer: (s: string) => Promise<string | null>
): Promise<unknown> {
  if (typeof value === "string") {
    const r = await replacer(value);
    return r ?? value;
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const v of value) out.push(await mapStrings(v, replacer));
    return out;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = await mapStrings(v, replacer);
    }
    return out;
  }
  return value;
}

/**
 * Build a single-file backup containing all AsyncStorage data plus any local
 * media (images / audio) referenced by URIs in those records, embedded as base64.
 */
export async function buildBackup(
  onProgress?: (msg: string) => void
): Promise<BackupFile> {
  const data = {} as Record<StorageKey, unknown>;
  const media: BackupFile["media"] = {};
  let mediaCounter = 0;

  for (const key of STORAGE_KEYS) {
    onProgress?.(`Membaca ${key}...`);
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) {
      data[key] = null;
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
    // Replace local file URIs with lpbak:// references and stash the file.
    const transformed = await mapStrings(parsed, async (s) => {
      if (!isLocalFileUri(s)) return null;
      const b64 = await tryReadBase64(s);
      if (!b64) return null;
      const id = `m${mediaCounter++}`;
      media[id] = { name: basename(s), base64: b64 };
      return `${MEDIA_PROTOCOL}${id}`;
    });
    data[key] = transformed;
  }

  onProgress?.(`Selesai: ${Object.keys(media).length} file media disertakan.`);

  return {
    version: 1,
    kind: "learnpath-backup",
    createdAt: new Date().toISOString(),
    data,
    media,
  };
}

/**
 * Write a backup file as JSON to the cache directory and return its uri.
 */
export async function writeBackupToFile(
  backup: BackupFile
): Promise<{ uri: string; filename: string; sizeBytes: number }> {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const filename = `learnpath-backup-${stamp}.json`;
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  const json = JSON.stringify(backup);
  await FileSystem.writeAsStringAsync(uri, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  try {
    await AsyncStorage.setItem("last_backup_at", new Date().toISOString());
  } catch {
    // ignore
  }
  return { uri, filename, sizeBytes: json.length };
}

/**
 * Returns the ISO timestamp of the last successful backup, or null if none.
 */
export async function getLastBackupAt(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem("last_backup_at");
  } catch {
    return null;
  }
}

/** Number of days since the last backup, or null if there has never been one. */
export async function getDaysSinceLastBackup(): Promise<number | null> {
  const iso = await getLastBackupAt();
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
}

/** Mark the backup reminder as snoozed for `days` days. */
export async function snoozeBackupReminder(days = 3): Promise<void> {
  const until = Date.now() + days * 24 * 60 * 60 * 1000;
  try {
    await AsyncStorage.setItem("backup_reminder_snooze_until", String(until));
  } catch {
    // ignore
  }
}

/** Whether a backup reminder banner should be shown right now. */
export async function shouldShowBackupReminder(
  thresholdDays = 7
): Promise<boolean> {
  try {
    const snoozeRaw = await AsyncStorage.getItem("backup_reminder_snooze_until");
    if (snoozeRaw) {
      const until = Number(snoozeRaw);
      if (Number.isFinite(until) && until > Date.now()) return false;
    }
  } catch {
    // ignore
  }
  const days = await getDaysSinceLastBackup();
  if (days === null) return true;
  return days >= thresholdDays;
}

/**
 * Restore a backup file. Media files are written into a fresh subfolder of
 * the document directory and URIs in the records are rewritten accordingly.
 *
 * The restore is destructive: it overwrites every key listed in the backup.
 */
export async function restoreBackup(
  backup: BackupFile,
  onProgress?: (msg: string) => void
): Promise<{ keysRestored: number; mediaRestored: number }> {
  if (backup.kind !== "learnpath-backup" || backup.version !== 1) {
    throw new Error("Format backup tidak valid.");
  }

  // Write media files to a fresh dir under documentDirectory.
  const stamp = Date.now();
  const mediaDir = `${FileSystem.documentDirectory}backup-restore-${stamp}/`;
  await FileSystem.makeDirectoryAsync(mediaDir, { intermediates: true });

  const idToUri = new Map<string, string>();
  const mediaIds = Object.keys(backup.media ?? {});
  let written = 0;
  for (const id of mediaIds) {
    const m = backup.media[id];
    if (!m) continue;
    onProgress?.(`Memulihkan media ${written + 1}/${mediaIds.length}...`);
    const safeName = m.name.replace(/[^\w.\-]+/g, "_") || "file";
    const target = `${mediaDir}${id}-${safeName}`;
    try {
      await FileSystem.writeAsStringAsync(target, m.base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      idToUri.set(id, target);
      written++;
    } catch {
      // Skip files that fail to write.
    }
  }

  let keysRestored = 0;
  for (const key of STORAGE_KEYS) {
    if (!(key in (backup.data ?? {}))) continue;
    const value = backup.data[key];
    if (value == null) {
      await AsyncStorage.removeItem(key);
      keysRestored++;
      continue;
    }
    const rewritten = await mapStrings(value, async (s) => {
      if (!s.startsWith(MEDIA_PROTOCOL)) return null;
      const id = s.slice(MEDIA_PROTOCOL.length);
      const uri = idToUri.get(id);
      return uri ?? "";
    });
    await AsyncStorage.setItem(key, JSON.stringify(rewritten));
    keysRestored++;
  }

  return { keysRestored, mediaRestored: written };
}
