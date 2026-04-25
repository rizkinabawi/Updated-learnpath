import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { deleteAsync, downloadAsync, documentDirectory, makeDirectoryAsync } from "./fs-compat";

/** Special lessonId for flashcards/quizzes created without a course */
export const STANDALONE_LESSON_ID = "__standalone__";

/** Prefix for standalone collection IDs */
export const STANDALONE_COLLECTION_PREFIX = "__sc__";

/** Returns true if the lessonId belongs to a standalone collection (or legacy standalone) */
export const isStandaloneId = (id: string) =>
  id === STANDALONE_LESSON_ID || id.startsWith(STANDALONE_COLLECTION_PREFIX);

/** A named folder/collection for standalone flashcards or quizzes */
export interface StandaloneCollection {
  id: string;          // always starts with STANDALONE_COLLECTION_PREFIX
  name: string;
  description?: string;
  type: "flashcard" | "quiz";
  createdAt: string;
}

// Types
export interface User {
  id: string;
  name: string;
  goal: string;
  topic: string;
  level: "beginner" | "intermediate" | "advanced";
  avatar?: string;
  createdAt: string;
}

export interface LearningPath {
  id: string;
  name: string;
  description: string;
  userId: string;
  tags?: string[];
  /** Feather icon name override (e.g. "book", "code") */
  icon?: string;
  completedLessons?: number;
  totalLessons?: number;
  createdAt: string;
  /** If true, this course was imported from a secured bundle and cannot be exported/shared again. */
  isLocked?: boolean;
}

export interface Module {
  id: string;
  name: string;
  description: string;
  pathId: string;
  order: number;
  icon?: string;
  createdAt: string;
}

export interface Lesson {
  id: string;
  name: string;
  description: string;
  moduleId: string;
  order: number;
  notes?: string;
  createdAt: string;
}

export interface FlashcardPack {
  id: string;
  lessonId: string;
  name: string;
  createdAt: string;
}

export interface QuizPack {
  id: string;
  lessonId: string;
  name: string;
  createdAt: string;
}

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
  tag: string;
  lessonId: string;
  packId?: string;
  image?: string;
  /** Optional local audio file URI (e.g. extracted from imported Anki deck). */
  audio?: string;
  /** Additional images on the FRONT (question) side. `image` is index 0. */
  images?: string[];
  /** All images on the BACK (answer) side. */
  imagesBack?: string[];
  /** All audio clips on the FRONT (question) side. `audio` is index 0. */
  audios?: string[];
  /** All audio clips on the BACK (answer) side. */
  audiosBack?: string[];
  createdAt: string;
}

export interface Quiz {
  id: string;
  question: string;
  options: string[];
  answer: string;
  explanation?: string;
  type: "multiple-choice" | "true-false";
  lessonId: string;
  packId?: string;
  image?: string;
  /** Optional local audio file URI played during the quiz. */
  audio?: string;
  createdAt: string;
}

export interface Progress {
  id: string;
  userId: string;
  lessonId: string;
  flashcardId?: string;
  quizId?: string;
  isCorrect: boolean;
  userAnswer?: string;
  timestamp: string;
}

export interface Stats {
  totalStudyTime: number;
  totalAnswers: number;
  correctAnswers: number;
  streak: number;
  lastStudyDate: string;
}

export interface Note {
  id: string;
  lessonId: string;
  title: string;
  content: string;
  /** Optional embedded images (URIs) — turns notes into a canvas-like editor */
  images?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StudyMaterial {
  id: string;
  lessonId: string;
  title: string;
  type: "text" | "html" | "file" | "youtube" | "googledoc" | "image";
  content: string;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  fileMime?: string;
  videoUrl?: string;
  imageLocalPath?: string;
  /** Optional extra images attached to text/html materials (canvas-style) */
  images?: string[];
  createdAt: string;
}

export interface SessionLog {
  id: string;
  type: "flashcard" | "quiz";
  lessonId: string;
  lessonName: string;
  total: number;
  correct: number;
  durationSec: number;
  date: string;
}

export interface BookmarkedItem {
  id: string;
  type: "flashcard" | "quiz";
  itemId: string;
  question: string;
  answer: string;
  lessonId: string;
  lessonName: string;
  createdAt: string;
}

export interface SpacedRepData {
  cardId: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: string;
}

// Course Pack for export/import
export interface CoursePack {
  version: number;           // 1 = no assets, 2 = base64 assets embedded
  exportedAt: string;
  paths: LearningPath[];
  modules: Module[];
  lessons: Lesson[];
  flashcardPacks: FlashcardPack[];
  quizPacks: QuizPack[];
  flashcards: Flashcard[];
  quizzes: Quiz[];
  materials: StudyMaterial[];
  notes: Note[];
  assetData?: Record<string, string>; // originalUri → base64 (version 2+)

  // Optional Ed25519 signature envelope (see utils/bundle-crypto.ts).
  // When present, the bundle is treated as a "signed bundle" and must pass
  // signature verification + activation key check before import.
  bundleId?: string;
  creator?: string;
  contentHash?: string; // hex sha256 of canonicalJson(packData)
  signature?: string;   // base64 ed25519 over `${bundleId}|${creator}|${contentHash}`
}

const STORAGE_KEYS = {
  USER: "user",
  LEARNING_PATHS: "learning_paths",
  MODULES: "modules",
  LESSONS: "lessons",
  FLASHCARD_PACKS: "flashcard_packs",
  QUIZ_PACKS: "quiz_packs",
  /** LEGACY single-blob flashcards key — migrated on first read into the
   *  per-lesson layout below (FLASHCARDS_INDEX + FLASHCARDS_LESSON_PREFIX).
   *  Kept here only so the migration code can find and remove it. */
  FLASHCARDS: "flashcards",
  /** New: small JSON map { lessonId: count } so we can render counts and
   *  drive list views without loading any card bodies. */
  FLASHCARDS_INDEX: "flashcards_idx",
  /** New: per-lesson key prefix. Each lesson gets its own AsyncStorage row
   *  containing a JSON array of just that lesson's cards. This is THE fix
   *  for the OOM crashes on accounts with thousands of cards — opening one
   *  deck only deserializes that deck's blob, not the entire collection. */
  FLASHCARDS_LESSON_PREFIX: "flashcards_l:",
  QUIZZES: "quizzes",
  PROGRESS: "progress",
  STATS: "stats",
  NOTES: "notes",
  STUDY_MATERIALS: "study_materials",
  SESSION_LOGS: "session_logs",
  BOOKMARKS: "bookmarks",
  SPACED_REP: "spaced_rep",
  THEME: "theme",
  STANDALONE_COLLECTIONS: "standalone_collections",
  COMPLETED_LESSONS: "completed_lessons",
  ISSUED_TOKENS: "issued_tokens",
};

export interface IssuedTokenRecord {
  id: string;
  bundleId: string;
  buyerId: string;
  durationMs: number;
  expiryIso: string;
  tokenJson: string;
  issuedAt: string;
}

export const generateId = () =>
  `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const getFromStorage = async <T>(key: string): Promise<T[]> => {
  try {
    const data = await AsyncStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const saveToStorage = async <T>(key: string, data: T[]) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch {}
};

/** Helper to delete a local file if it's stored in the app's internal directory */
const deleteFileIfLocal = async (uri?: string) => {
  if (!uri || Platform.OS === "web") return;
  // Check if it's a local file in documentDirectory
  if (uri.startsWith("file://") || (documentDirectory && uri.startsWith(documentDirectory))) {
    try {
      await deleteAsync(uri);
    } catch {
      // ignore
    }
  }
};

/** Helper to ensure a remote asset is downloaded locally for offline use */
export const ensureLocalAsset = async (sourceUrl: string, folder: string): Promise<string> => {
  if (Platform.OS === "web" || !sourceUrl.startsWith("http") || !documentDirectory) {
    return sourceUrl;
  }
  try {
    const dir = `${documentDirectory}${folder}/`;
    await makeDirectoryAsync(dir, { intermediates: true });
    
    const ext = sourceUrl.split(".").pop()?.split("?")[0] ?? "dat";
    const filename = `${generateId()}.${ext}`;
    const dest = `${dir}${filename}`;
    
    await downloadAsync(sourceUrl, dest);
    return dest;
  } catch {
    return sourceUrl;
  }
};

// User
export const getUser = async (): Promise<User | null> => {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.USER);
  return data ? JSON.parse(data) : null;
};

export const saveUser = async (user: User) => {
  await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
};

// Learning Paths
export const getLearningPaths = async (): Promise<LearningPath[]> => {
  return getFromStorage<LearningPath>(STORAGE_KEYS.LEARNING_PATHS);
};

export const saveLearningPath = async (path: LearningPath) => {
  const paths = await getLearningPaths();
  const index = paths.findIndex((p) => p.id === path.id);
  if (index >= 0) paths[index] = path;
  else paths.push(path);
  await saveToStorage(STORAGE_KEYS.LEARNING_PATHS, paths);
};

export const deleteLearningPath = async (id: string) => {
  const paths = await getLearningPaths();
  await saveToStorage(STORAGE_KEYS.LEARNING_PATHS, paths.filter((p) => p.id !== id));
};

// Modules
export const getModules = async (pathId?: string): Promise<Module[]> => {
  const modules = await getFromStorage<Module>(STORAGE_KEYS.MODULES);
  return pathId ? modules.filter((m) => m.pathId === pathId) : modules;
};

export const saveModule = async (module: Module) => {
  const modules = await getModules();
  const index = modules.findIndex((m) => m.id === module.id);
  if (index >= 0) modules[index] = module;
  else modules.push(module);
  await saveToStorage(STORAGE_KEYS.MODULES, modules);
};

export const deleteModule = async (id: string) => {
  const modules = await getModules();
  await saveToStorage(STORAGE_KEYS.MODULES, modules.filter((m) => m.id !== id));
};

// Lessons
export const getLessons = async (moduleId?: string): Promise<Lesson[]> => {
  const lessons = await getFromStorage<Lesson>(STORAGE_KEYS.LESSONS);
  return moduleId ? lessons.filter((l) => l.moduleId === moduleId) : lessons;
};

export const saveLesson = async (lesson: Lesson) => {
  const lessons = await getLessons();
  const index = lessons.findIndex((l) => l.id === lesson.id);
  if (index >= 0) lessons[index] = lesson;
  else lessons.push(lesson);
  await saveToStorage(STORAGE_KEYS.LESSONS, lessons);
};

export const deleteLesson = async (id: string) => {
  const lessons = await getLessons();
  await saveToStorage(STORAGE_KEYS.LESSONS, lessons.filter((l) => l.id !== id));
};

// ─── Flashcard Packs ───────────────────────────────────────────
export const getFlashcardPacks = async (lessonId?: string): Promise<FlashcardPack[]> => {
  const packs = await getFromStorage<FlashcardPack>(STORAGE_KEYS.FLASHCARD_PACKS);
  return lessonId ? packs.filter((p) => p.lessonId === lessonId) : packs;
};

export const saveFlashcardPack = async (pack: FlashcardPack) => {
  const packs = await getFlashcardPacks();
  const index = packs.findIndex((p) => p.id === pack.id);
  if (index >= 0) packs[index] = pack;
  else packs.push(pack);
  await saveToStorage(STORAGE_KEYS.FLASHCARD_PACKS, packs);
};

export const deleteFlashcardPack = async (packId: string) => {
  const packs = await getFlashcardPacks();
  await saveToStorage(STORAGE_KEYS.FLASHCARD_PACKS, packs.filter((p) => p.id !== packId));
  // Also delete all flashcards in this pack — uses the per-lesson layout so we
  // only rewrite lessons that actually contain cards from this pack.
  await deleteFlashcardsByPack(packId);
};

// ─── Quiz Packs ────────────────────────────────────────────────
export const getQuizPacks = async (lessonId?: string): Promise<QuizPack[]> => {
  const packs = await getFromStorage<QuizPack>(STORAGE_KEYS.QUIZ_PACKS);
  return lessonId ? packs.filter((p) => p.lessonId === lessonId) : packs;
};

export const saveQuizPack = async (pack: QuizPack) => {
  const packs = await getQuizPacks();
  const index = packs.findIndex((p) => p.id === pack.id);
  if (index >= 0) packs[index] = pack;
  else packs.push(pack);
  await saveToStorage(STORAGE_KEYS.QUIZ_PACKS, packs);
};

export const deleteQuizPack = async (packId: string) => {
  const packs = await getQuizPacks();
  await saveToStorage(STORAGE_KEYS.QUIZ_PACKS, packs.filter((p) => p.id !== packId));
  const quizzes = await getFromStorage<Quiz>(STORAGE_KEYS.QUIZZES);
  await saveToStorage(STORAGE_KEYS.QUIZZES, quizzes.filter((q) => q.packId !== packId));
};

// ─── Flashcards (per-lesson sharded storage) ───────────────────
//
// Why per-lesson sharding:
//   The original layout stored EVERY flashcard the user owned in a single
//   AsyncStorage row under "flashcards". With heavy Anki imports this row
//   easily hit 50–100 MB of JSON, which caused two unrecoverable crashes:
//     1. JSON.parse on the entire blob → JS heap OOM on entry to any
//        flashcard screen.
//     2. AsyncStorage.setItem of the entire blob → SQLite cursor row size
//        limit exceeded on Android (the underlying RKStorage table has a
//        hard ~6 MB row cap on most devices) → silent native crash.
//
//   The new layout shards cards by lessonId:
//     • flashcards_idx        — { lessonId: count } map (small, always loaded)
//     • flashcards_l:<lid>    — Flashcard[] for one lesson (~1 MB max in practice)
//
//   Open-deck and bulk-import only ever touch one lesson's row, so the JSON
//   payload stays small no matter how many decks the user owns. Migration
//   from the legacy single-blob is automatic on first read.
//
//   Caches:
//     • _flashcardsIndex      — the count map, in-memory mirror of FLASHCARDS_INDEX
//     • _flashcardsByLesson   — per-lesson card arrays we've loaded this session
//
//   Everything below preserves the public API the rest of the app already
//   uses (getFlashcards, saveFlashcard, saveFlashcardsBulk, etc.) so callers
//   need no changes.

let _flashcardsIndex: Record<string, number> | null = null;
const _flashcardsByLesson = new Map<string, Flashcard[]>();
let _migrated = false;

const _flashcardLessonKey = (lessonId: string) =>
  `${STORAGE_KEYS.FLASHCARDS_LESSON_PREFIX}${lessonId}`;

/** Migrate the legacy single-blob "flashcards" row into per-lesson rows.
 *  Idempotent — only runs the first time per app session, and skips entirely
 *  once the new index key exists. */
async function _ensureFlashcardsMigrated(): Promise<void> {
  if (_migrated) return;
  // Fast path: already migrated in a previous session.
  const existingIdxRaw = await AsyncStorage.getItem(STORAGE_KEYS.FLASHCARDS_INDEX);
  if (existingIdxRaw) {
    try {
      _flashcardsIndex = JSON.parse(existingIdxRaw) ?? {};
    } catch {
      _flashcardsIndex = {};
    }
    _migrated = true;
    return;
  }

  // Slow path: split the legacy "flashcards" blob (if any) into per-lesson rows.
  let legacyRaw: string | null = null;
  try {
    legacyRaw = await AsyncStorage.getItem(STORAGE_KEYS.FLASHCARDS);
  } catch {
    legacyRaw = null;
  }
  if (!legacyRaw) {
    _flashcardsIndex = {};
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.FLASHCARDS_INDEX, "{}");
    } catch {}
    _migrated = true;
    return;
  }

  let cards: Flashcard[] = [];
  try {
    cards = JSON.parse(legacyRaw) ?? [];
  } catch (e) {
    // Legacy blob corrupt or too large to parse — start fresh under the new
    // layout. Old blob is left in place so a future repair tool can recover.
    if (typeof console !== "undefined") {
      console.warn("[storage] legacy flashcards parse failed:", e);
    }
    _flashcardsIndex = {};
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.FLASHCARDS_INDEX, "{}");
    } catch {}
    _migrated = true;
    return;
  }

  // Group by lessonId.
  const groups = new Map<string, Flashcard[]>();
  for (const c of cards) {
    const lid = c.lessonId || "__orphan__";
    let arr = groups.get(lid);
    if (!arr) {
      arr = [];
      groups.set(lid, arr);
    }
    arr.push(c);
  }

  // Write each per-lesson row, then the index. Index is written LAST so that
  // a crash mid-migration leaves us with the legacy blob intact + no stale
  // index — next launch will retry the migration.
  const newIndex: Record<string, number> = {};
  for (const [lessonId, list] of groups) {
    try {
      await AsyncStorage.setItem(_flashcardLessonKey(lessonId), JSON.stringify(list));
      newIndex[lessonId] = list.length;
    } catch (e) {
      if (typeof console !== "undefined") {
        console.warn(`[storage] migration write failed for lesson ${lessonId}:`, e);
      }
    }
  }
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.FLASHCARDS_INDEX, JSON.stringify(newIndex));
    // Only remove the legacy blob after the index is durably written.
    await AsyncStorage.removeItem(STORAGE_KEYS.FLASHCARDS);
  } catch {}
  _flashcardsIndex = newIndex;
  _migrated = true;
}

async function _readLessonFlashcards(lessonId: string): Promise<Flashcard[]> {
  await _ensureFlashcardsMigrated();
  const cached = _flashcardsByLesson.get(lessonId);
  if (cached) return cached;
  let list: Flashcard[] = [];
  try {
    const raw = await AsyncStorage.getItem(_flashcardLessonKey(lessonId));
    if (raw) list = JSON.parse(raw) ?? [];
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn(`[storage] read lesson ${lessonId} failed:`, e);
    }
    list = [];
  }
  _flashcardsByLesson.set(lessonId, list);
  return list;
}

async function _writeLessonFlashcards(lessonId: string, list: Flashcard[]): Promise<void> {
  await _ensureFlashcardsMigrated();
  // Update cache first so subsequent reads see the new state even if the
  // disk write is slow/in-flight.
  _flashcardsByLesson.set(lessonId, list);
  if (!_flashcardsIndex) _flashcardsIndex = {};

  const key = _flashcardLessonKey(lessonId);
  if (list.length === 0) {
    try { await AsyncStorage.removeItem(key); } catch {}
    delete _flashcardsIndex[lessonId];
  } else {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(list));
      _flashcardsIndex[lessonId] = list.length;
    } catch (e) {
      // Re-throw so callers (especially imports) can surface a real error
      // message to the user instead of silently dropping the write.
      throw new Error(
        `Gagal menyimpan ${list.length} kartu untuk pelajaran ${lessonId}: ` +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.FLASHCARDS_INDEX, JSON.stringify(_flashcardsIndex));
  } catch {}
}

/** Drop in-memory flashcard caches. Call after restore-from-backup or when
 *  external code mutates AsyncStorage rows directly. */
export const invalidateFlashcardsCache = () => {
  _flashcardsIndex = null;
  _flashcardsByLesson.clear();
  _migrated = false;
};

/** Returns the count map { lessonId: count } without loading any card bodies. */
export const getFlashcardsIndex = async (): Promise<Record<string, number>> => {
  await _ensureFlashcardsMigrated();
  return _flashcardsIndex ? { ..._flashcardsIndex } : {};
};

export const getFlashcards = async (lessonId?: string): Promise<Flashcard[]> => {
  await _ensureFlashcardsMigrated();
  if (lessonId) {
    return _readLessonFlashcards(lessonId);
  }
  // Whole-collection read: walk the index and concat. Callers should avoid
  // this path on hot screens — prefer getFlashcardsIndex / getFlashcardCount.
  const idx = _flashcardsIndex ?? {};
  const all: Flashcard[] = [];
  for (const lid of Object.keys(idx)) {
    const list = await _readLessonFlashcards(lid);
    for (const c of list) all.push(c);
  }
  return all;
};

/** Paginated flashcard fetch — slices the per-lesson cache. */
export const getFlashcardsPaginated = async (
  lessonId: string | undefined,
  offset: number,
  limit: number,
): Promise<Flashcard[]> => {
  if (lessonId) {
    const list = await _readLessonFlashcards(lessonId);
    return list.slice(offset, offset + limit);
  }
  const all = await getFlashcards();
  return all.slice(offset, offset + limit);
};

/** Returns the number of flashcards in a lesson (or total when omitted).
 *  No card bodies are loaded — pulled straight from the index. */
export const getFlashcardCount = async (lessonId?: string): Promise<number> => {
  await _ensureFlashcardsMigrated();
  const idx = _flashcardsIndex ?? {};
  if (lessonId) return idx[lessonId] ?? 0;
  let total = 0;
  for (const k of Object.keys(idx)) total += idx[k] ?? 0;
  return total;
};

/** Returns a Map<lessonId, count> straight from the index — O(L) and zero
 *  card-body deserialization. Replaces the old N+1 read pattern. */
export const getAllFlashcardsGroupedByLesson = async (): Promise<Map<string, number>> => {
  await _ensureFlashcardsMigrated();
  const idx = _flashcardsIndex ?? {};
  const m = new Map<string, number>();
  for (const k of Object.keys(idx)) m.set(k, idx[k] ?? 0);
  return m;
};

/** Find every card belonging to a pack — needs to scan all lessons. Cheap
 *  in practice because each lesson row is small. */
export const getFlashcardsByPack = async (packId: string): Promise<Flashcard[]> => {
  await _ensureFlashcardsMigrated();
  const idx = _flashcardsIndex ?? {};
  const out: Flashcard[] = [];
  for (const lid of Object.keys(idx)) {
    const list = await _readLessonFlashcards(lid);
    for (const c of list) if (c.packId === packId) out.push(c);
  }
  return out;
};

export const saveFlashcard = async (card: Flashcard) => {
  const list = await _readLessonFlashcards(card.lessonId);
  const idx = list.findIndex((c) => c.id === card.id);
  const updated = list.slice();
  if (idx >= 0) updated[idx] = card;
  else updated.push(card);
  await _writeLessonFlashcards(card.lessonId, updated);
};

/** O(n + m) bulk merge, sharded by lesson — only the lessons actually being
 *  written are loaded and rewritten. Big imports stay flat in memory. */
export const saveFlashcardsBulk = async (newCards: Flashcard[]) => {
  if (newCards.length === 0) return;
  // Group incoming cards by lessonId.
  const byLesson = new Map<string, Flashcard[]>();
  for (const c of newCards) {
    let arr = byLesson.get(c.lessonId);
    if (!arr) {
      arr = [];
      byLesson.set(c.lessonId, arr);
    }
    arr.push(c);
  }
  for (const [lessonId, batch] of byLesson) {
    const existing = await _readLessonFlashcards(lessonId);
    const indexById = new Map<string, number>();
    for (let i = 0; i < existing.length; i++) indexById.set(existing[i].id, i);
    const updated = existing.slice();
    for (const card of batch) {
      const idx = indexById.get(card.id);
      if (idx !== undefined) {
        updated[idx] = card;
      } else {
        indexById.set(card.id, updated.length);
        updated.push(card);
      }
    }
    await _writeLessonFlashcards(lessonId, updated);
  }
};

/** Chunked variant — yields between lesson writes so the UI thread keeps
 *  drawing during a multi-thousand-card import. Errors propagate to the
 *  caller (via the rethrow inside _writeLessonFlashcards) so the import UI
 *  can show the real failure message. */
export const saveFlashcardsBulkChunked = async (
  newCards: Flashcard[],
  chunkSize = 50,
  onProgress?: (done: number, total: number) => void,
) => {
  if (newCards.length === 0) return;
  const total = newCards.length;
  let done = 0;

  // Group by lesson, then write each lesson's batch in sub-chunks. We drop
  // the input array reference progressively to let the GC reclaim card
  // objects we've already persisted.
  const byLesson = new Map<string, Flashcard[]>();
  for (const c of newCards) {
    let arr = byLesson.get(c.lessonId);
    if (!arr) {
      arr = [];
      byLesson.set(c.lessonId, arr);
    }
    arr.push(c);
  }

  for (const [lessonId, batch] of byLesson) {
    const existing = await _readLessonFlashcards(lessonId);
    const indexById = new Map<string, number>();
    for (let i = 0; i < existing.length; i++) indexById.set(existing[i].id, i);
    const updated = existing.slice();

    for (let i = 0; i < batch.length; i += chunkSize) {
      const end = Math.min(i + chunkSize, batch.length);
      for (let j = i; j < end; j++) {
        const card = batch[j];
        const idx = indexById.get(card.id);
        if (idx !== undefined) {
          updated[idx] = card;
        } else {
          indexById.set(card.id, updated.length);
          updated.push(card);
        }
      }
      done += end - i;
      onProgress?.(done, total);
      // Yield so the spinner / progress indicator keeps painting.
      await new Promise<void>((r) => setTimeout(r, 0));
    }
    await _writeLessonFlashcards(lessonId, updated);
    // Help the GC by dropping per-batch refs eagerly.
    byLesson.set(lessonId, []);
  }
};

export const deleteFlashcard = async (id: string) => {
  await _ensureFlashcardsMigrated();
  const idx = _flashcardsIndex ?? {};
  // Find the lesson that holds this card. Worst case scans every lesson row,
  // but each row is small and we stop on first hit.
  for (const lid of Object.keys(idx)) {
    const list = await _readLessonFlashcards(lid);
    const card = list.find((c) => c.id === id);
    if (!card) continue;
    await deleteFileIfLocal(card.image);
    await deleteFileIfLocal(card.audio);
    if (card.images) for (const u of card.images) await deleteFileIfLocal(u);
    if (card.imagesBack) for (const u of card.imagesBack) await deleteFileIfLocal(u);
    if (card.audios) for (const u of card.audios) await deleteFileIfLocal(u);
    if (card.audiosBack) for (const u of card.audiosBack) await deleteFileIfLocal(u);
    await _writeLessonFlashcards(lid, list.filter((c) => c.id !== id));
    return;
  }
};

/** Result of a storage repair scan. */
export interface FlashcardRepairReport {
  /** Per-lesson card rows discovered on disk. */
  lessonsScanned: number;
  /** Total cards counted across all per-lesson rows. */
  totalCards: number;
  /** Lesson rows that failed to parse (likely corrupted JSON). */
  corruptedLessons: string[];
  /** Lesson rows that existed but were missing from the index (now added). */
  reindexedLessons: number;
  /** Index entries removed because their per-lesson row was missing/empty. */
  removedStaleIndexEntries: number;
  /** True if the legacy single-blob row was found and successfully migrated. */
  legacyBlobMigrated: boolean;
  /** True if the legacy blob existed but couldn't be parsed (kept for manual recovery). */
  legacyBlobUnreadable: boolean;
}

/**
 * Rebuild `flashcards_idx` from disk by scanning every `flashcards_l:*` row,
 * and re-attempt migration of the legacy single-blob row if it's still
 * around. Useful when a previous crash left the store in a half-migrated or
 * inconsistent state. Safe to run any time — it never deletes card data.
 */
export const repairFlashcardStorage = async (): Promise<FlashcardRepairReport> => {
  const report: FlashcardRepairReport = {
    lessonsScanned: 0,
    totalCards: 0,
    corruptedLessons: [],
    reindexedLessons: 0,
    removedStaleIndexEntries: 0,
    legacyBlobMigrated: false,
    legacyBlobUnreadable: false,
  };

  // Drop in-memory caches so we re-read everything from disk.
  invalidateFlashcardsCache();

  let allKeys: readonly string[] = [];
  try {
    allKeys = await AsyncStorage.getAllKeys();
  } catch {
    allKeys = [];
  }

  // Step 1: re-attempt legacy migration if the old blob is still around AND
  // we haven't yet split it. We do NOT remove the legacy row on failure — it
  // stays so a future repair can try again on a less-loaded device.
  const legacyRaw = allKeys.includes(STORAGE_KEYS.FLASHCARDS)
    ? await AsyncStorage.getItem(STORAGE_KEYS.FLASHCARDS).catch(() => null)
    : null;
  if (legacyRaw) {
    try {
      const cards: Flashcard[] = JSON.parse(legacyRaw) ?? [];
      const groups = new Map<string, Flashcard[]>();
      for (const c of cards) {
        const lid = c.lessonId || "__orphan__";
        let arr = groups.get(lid);
        if (!arr) {
          arr = [];
          groups.set(lid, arr);
        }
        arr.push(c);
      }
      // Merge into existing per-lesson rows (don't clobber): newer per-lesson
      // data takes precedence over legacy by id.
      for (const [lid, legacyList] of groups) {
        const key = _flashcardLessonKey(lid);
        let existing: Flashcard[] = [];
        try {
          const raw = await AsyncStorage.getItem(key);
          if (raw) existing = JSON.parse(raw) ?? [];
        } catch {
          existing = [];
        }
        const seen = new Set(existing.map((c) => c.id));
        for (const c of legacyList) if (!seen.has(c.id)) existing.push(c);
        await AsyncStorage.setItem(key, JSON.stringify(existing));
      }
      await AsyncStorage.removeItem(STORAGE_KEYS.FLASHCARDS);
      report.legacyBlobMigrated = true;
      // Refresh keys list since we've added rows.
      allKeys = await AsyncStorage.getAllKeys();
    } catch {
      // Legacy blob still unreadable on this device. Leave it untouched.
      report.legacyBlobUnreadable = true;
    }
  }

  // Step 2: walk every per-lesson row and rebuild the index from scratch.
  const newIndex: Record<string, number> = {};
  for (const k of allKeys) {
    if (!k.startsWith(STORAGE_KEYS.FLASHCARDS_LESSON_PREFIX)) continue;
    const lessonId = k.slice(STORAGE_KEYS.FLASHCARDS_LESSON_PREFIX.length);
    let raw: string | null = null;
    try {
      raw = await AsyncStorage.getItem(k);
    } catch {
      raw = null;
    }
    if (!raw) continue;
    try {
      const list: Flashcard[] = JSON.parse(raw) ?? [];
      report.lessonsScanned += 1;
      report.totalCards += list.length;
      if (list.length > 0) newIndex[lessonId] = list.length;
    } catch {
      report.corruptedLessons.push(lessonId);
    }
  }

  // Step 3: compare to old index — count fixes for the user-facing report.
  let oldIndex: Record<string, number> = {};
  try {
    const oldRaw = await AsyncStorage.getItem(STORAGE_KEYS.FLASHCARDS_INDEX);
    if (oldRaw) oldIndex = JSON.parse(oldRaw) ?? {};
  } catch {
    oldIndex = {};
  }
  for (const k of Object.keys(newIndex)) {
    if (!(k in oldIndex)) report.reindexedLessons += 1;
  }
  for (const k of Object.keys(oldIndex)) {
    if (!(k in newIndex)) report.removedStaleIndexEntries += 1;
  }

  // Step 4: persist the rebuilt index and refresh the in-memory cache so
  // subsequent reads see the new state immediately.
  await AsyncStorage.setItem(STORAGE_KEYS.FLASHCARDS_INDEX, JSON.stringify(newIndex));
  _flashcardsIndex = newIndex;
  _migrated = true;
  return report;
};

/** Remove every card belonging to a pack. Touches only the lessons that
 *  contain pack cards. */
export const deleteFlashcardsByPack = async (packId: string) => {
  await _ensureFlashcardsMigrated();
  const idx = _flashcardsIndex ?? {};
  for (const lid of Object.keys(idx)) {
    const list = await _readLessonFlashcards(lid);
    if (!list.some((c) => c.packId === packId)) continue;
    await _writeLessonFlashcards(lid, list.filter((c) => c.packId !== packId));
  }
};

// ─── Quizzes ───────────────────────────────────────────────────
export const getQuizzes = async (lessonId?: string): Promise<Quiz[]> => {
  const quizzes = await getFromStorage<Quiz>(STORAGE_KEYS.QUIZZES);
  return lessonId ? quizzes.filter((q) => q.lessonId === lessonId) : quizzes;
};

export const getQuizzesByPack = async (packId: string): Promise<Quiz[]> => {
  const quizzes = await getFromStorage<Quiz>(STORAGE_KEYS.QUIZZES);
  return quizzes.filter((q) => q.packId === packId);
};

export const saveQuiz = async (quiz: Quiz) => {
  const quizzes = await getQuizzes();
  const index = quizzes.findIndex((q) => q.id === quiz.id);
  if (index >= 0) quizzes[index] = quiz;
  else quizzes.push(quiz);
  await saveToStorage(STORAGE_KEYS.QUIZZES, quizzes);
};

export const saveQuizzesBulk = async (newQuizzes: Quiz[]) => {
  const quizzes = await getQuizzes();
  const updated = [...quizzes];
  for (const q of newQuizzes) {
    const idx = updated.findIndex((item) => item.id === q.id);
    if (idx >= 0) updated[idx] = q;
    else updated.push(q);
  }
  await saveToStorage(STORAGE_KEYS.QUIZZES, updated);
};

export const deleteQuiz = async (id: string) => {
  const quizzes = await getQuizzes();
  const quiz = quizzes.find((q) => q.id === id);
  if (quiz) {
    await deleteFileIfLocal(quiz.image);
    await deleteFileIfLocal(quiz.audio);
  }
  await saveToStorage(STORAGE_KEYS.QUIZZES, quizzes.filter((q) => q.id !== id));
};

// Progress & Stats
export const getProgress = async (lessonId?: string): Promise<Progress[]> => {
  const progress = await getFromStorage<Progress>(STORAGE_KEYS.PROGRESS);
  return lessonId ? progress.filter((p) => p.lessonId === lessonId) : progress;
};

export const saveProgress = async (progress: Progress) => {
  const all = await getProgress();
  all.push(progress);
  await saveToStorage(STORAGE_KEYS.PROGRESS, all);
};

export const getWrongAnswers = async (): Promise<Progress[]> => {
  return (await getProgress()).filter((p) => !p.isCorrect);
};

export const getStats = async (): Promise<Stats> => {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.STATS);
  return data
    ? JSON.parse(data)
    : { totalStudyTime: 0, totalAnswers: 0, correctAnswers: 0, streak: 0, lastStudyDate: "" };
};

export const updateStats = async (updates: Partial<Stats>) => {
  const stats = await getStats();
  const updated = { ...stats, ...updates };
  await AsyncStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(updated));
};

export const clearAllData = async () => {
  // Reset the per-lesson sharded flashcard caches so the next read re-runs
  // migration cleanly against the (now empty) store.
  invalidateFlashcardsCache();
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const perLessonKeys = allKeys.filter((k) => k.startsWith(STORAGE_KEYS.FLASHCARDS_LESSON_PREFIX));
    if (perLessonKeys.length > 0) {
      await AsyncStorage.multiRemove(perLessonKeys);
    }
  } catch {}
  await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
};

/** Helper to update streak based on activity */
export const updateStreak = async () => {
  const stats = await getStats();
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  
  if (stats.lastStudyDate === today) return; // Already updated today

  let newStreak = stats.streak;
  if (!stats.lastStudyDate) {
    newStreak = 1;
  } else {
    const last = new Date(stats.lastStudyDate);
    const diffDays = Math.floor((now.getTime() - last.getTime()) / 86400000);
    
    if (diffDays === 1) {
      newStreak += 1;
    } else if (diffDays > 1) {
      newStreak = 1;
    }
  }
  
  await updateStats({ streak: newStreak, lastStudyDate: today });
};


// ─── Session Logs ──────────────────────────────────────────────
export const getSessionLogs = async (): Promise<SessionLog[]> => {
  return getFromStorage<SessionLog>(STORAGE_KEYS.SESSION_LOGS);
};

export const saveSessionLog = async (log: SessionLog) => {
  const logs = await getSessionLogs();
  logs.unshift(log);
  const trimmed = logs.slice(0, 200);
  await saveToStorage(STORAGE_KEYS.SESSION_LOGS, trimmed);
};

// ─── Bookmarks ─────────────────────────────────────────────────
export const getBookmarks = async (): Promise<BookmarkedItem[]> => {
  return getFromStorage<BookmarkedItem>(STORAGE_KEYS.BOOKMARKS);
};

export const toggleBookmark = async (item: Omit<BookmarkedItem, "id" | "createdAt">): Promise<boolean> => {
  const bookmarks = await getBookmarks();
  const exists = bookmarks.find((b) => b.itemId === item.itemId && b.type === item.type);
  if (exists) {
    await saveToStorage(STORAGE_KEYS.BOOKMARKS, bookmarks.filter((b) => b.id !== exists.id));
    return false;
  } else {
    bookmarks.unshift({ ...item, id: generateId(), createdAt: new Date().toISOString() });
    await saveToStorage(STORAGE_KEYS.BOOKMARKS, bookmarks);
    return true;
  }
};

export const isBookmarked = async (itemId: string, type: "flashcard" | "quiz"): Promise<boolean> => {
  const bookmarks = await getBookmarks();
  return bookmarks.some((b) => b.itemId === itemId && b.type === type);
};

// ─── Spaced Repetition (SM-2) ──────────────────────────────────
//
// BUG 3 FIX: The SPACED_REP AsyncStorage key is unbounded — it grows with
// every card a user has ever studied. Reading + JSON.parse of this entire
// blob on every deck open (via sortBySpacedRep → getSpacedRepData) caused
// multi-second JS-thread blocks and genuine OOM on large libraries.
//
// Fix: keep an in-memory cache that is populated on first read and
// invalidated whenever updateSpacedRep writes a new entry. Subsequent reads
// return the cached array without touching AsyncStorage.
let _spacedRepCache: SpacedRepData[] | null = null;

export const getSpacedRepData = async (): Promise<SpacedRepData[]> => {
  if (_spacedRepCache !== null) return _spacedRepCache;
  const data = await getFromStorage<SpacedRepData>(STORAGE_KEYS.SPACED_REP);
  _spacedRepCache = data;
  return data;
};

/** Invalidate the spaced-rep cache — call after restore-from-backup or
 *  direct AsyncStorage mutation. */
export const invalidateSpacedRepCache = () => {
  _spacedRepCache = null;
};

export const getCardSpacedRep = async (cardId: string): Promise<SpacedRepData> => {
  const all = await getSpacedRepData();
  return all.find((d) => d.cardId === cardId) ?? {
    cardId,
    easeFactor: 2.5,
    interval: 1,
    repetitions: 0,
    nextReview: new Date().toISOString(),
  };
};

export const updateSpacedRep = async (cardId: string, quality: number) => {
  const all = await getSpacedRepData();
  const existing = all.find((d) => d.cardId === cardId) ?? {
    cardId,
    easeFactor: 2.5,
    interval: 1,
    repetitions: 0,
    nextReview: new Date().toISOString(),
  };
  let { easeFactor, interval, repetitions } = existing;
  if (quality >= 3) {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);
    repetitions += 1;
    easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  } else {
    repetitions = 0;
    interval = 1;
  }
  const nextReview = new Date(Date.now() + interval * 86400000).toISOString();
  const updated: SpacedRepData = { cardId, easeFactor, interval, repetitions, nextReview };
  const rest = all.filter((d) => d.cardId !== cardId);
  const newAll = [...rest, updated];
  await saveToStorage(STORAGE_KEYS.SPACED_REP, newAll);
  // Update the in-memory cache so the next deck open doesn't need a disk read.
  _spacedRepCache = newAll;
  return updated;
};

export const sortBySpacedRep = async (cards: Flashcard[]): Promise<Flashcard[]> => {
  const now = Date.now();
  const all = await getSpacedRepData(); // now cached — no extra I/O on repeated calls
  const dataMap = new Map(all.map((d) => [d.cardId, d]));
  return [...cards].sort((a, b) => {
    const da = dataMap.get(a.id);
    const db = dataMap.get(b.id);
    const dueA = da ? new Date(da.nextReview).getTime() : 0;
    const dueB = db ? new Date(db.nextReview).getTime() : 0;
    const overdueA = dueA <= now ? 0 : dueA;
    const overdueB = dueB <= now ? 0 : dueB;
    return overdueA - overdueB;
  });
};

// ─── Notes ─────────────────────────────────────────────────────
export const getNotes = async (lessonId?: string): Promise<Note[]> => {
  const notes = await getFromStorage<Note>(STORAGE_KEYS.NOTES);
  return lessonId ? notes.filter((n) => n.lessonId === lessonId) : notes;
};

export const saveNote = async (note: Note) => {
  const notes = await getNotes();
  const index = notes.findIndex((n) => n.id === note.id);
  if (index >= 0) notes[index] = note;
  else notes.push(note);
  await saveToStorage(STORAGE_KEYS.NOTES, notes);
};

export const deleteNote = async (id: string) => {
  const notes = await getNotes();
  const note = notes.find((n) => n.id === id);
  if (note?.images) {
    for (const img of note.images) await deleteFileIfLocal(img);
  }
  await saveToStorage(STORAGE_KEYS.NOTES, notes.filter((n) => n.id !== id));
};

// ─── Study Materials ───────────────────────────────────────────
export const getStudyMaterials = async (lessonId?: string): Promise<StudyMaterial[]> => {
  const mats = await getFromStorage<StudyMaterial>(STORAGE_KEYS.STUDY_MATERIALS);
  return lessonId ? mats.filter((m) => m.lessonId === lessonId) : mats;
};

export const saveStudyMaterial = async (mat: StudyMaterial) => {
  const mats = await getStudyMaterials();
  const index = mats.findIndex((m) => m.id === mat.id);
  if (index >= 0) mats[index] = mat;
  else mats.push(mat);
  await saveToStorage(STORAGE_KEYS.STUDY_MATERIALS, mats);
};

export const deleteStudyMaterial = async (id: string) => {
  const mats = await getStudyMaterials();
  const mat = mats.find((m) => m.id === id);
  if (mat) {
    await deleteFileIfLocal(mat.filePath);
    await deleteFileIfLocal(mat.imageLocalPath);
    if (mat.images) {
      for (const img of mat.images) await deleteFileIfLocal(img);
    }
  }
  await saveToStorage(STORAGE_KEYS.STUDY_MATERIALS, mats.filter((m) => m.id !== id));
};

// ─── Course Pack Export / Import ───────────────────────────────
// ─── Standalone Collections ────────────────────────────────────
export const getStandaloneCollections = async (
  type?: "flashcard" | "quiz"
): Promise<StandaloneCollection[]> => {
  const all = await getFromStorage<StandaloneCollection>(
    STORAGE_KEYS.STANDALONE_COLLECTIONS
  );
  return type ? all.filter((c) => c.type === type) : all;
};

export const saveStandaloneCollection = async (
  col: StandaloneCollection
): Promise<void> => {
  const all = await getStandaloneCollections();
  const idx = all.findIndex((c) => c.id === col.id);
  if (idx >= 0) all[idx] = col;
  else all.push(col);
  await saveToStorage(STORAGE_KEYS.STANDALONE_COLLECTIONS, all);
};

/** Delete a collection AND all its flashcards/quizzes (by lessonId = col.id) */
export const deleteStandaloneCollection = async (id: string): Promise<void> => {
  const all = await getStandaloneCollections();
  await saveToStorage(
    STORAGE_KEYS.STANDALONE_COLLECTIONS,
    all.filter((c) => c.id !== id)
  );
  const cards = await getFromStorage<Flashcard>(STORAGE_KEYS.FLASHCARDS);
  await saveToStorage(
    STORAGE_KEYS.FLASHCARDS,
    cards.filter((c) => c.lessonId !== id)
  );
  const quizzes = await getFromStorage<Quiz>(STORAGE_KEYS.QUIZZES);
  await saveToStorage(
    STORAGE_KEYS.QUIZZES,
    quizzes.filter((q) => q.lessonId !== id)
  );
};

/** Move all items in a collection to a new lessonId, then delete the collection record */
export const assignStandaloneCollection = async (
  colId: string,
  targetLessonId: string
): Promise<void> => {
  const cards = await getFromStorage<Flashcard>(STORAGE_KEYS.FLASHCARDS);
  const updatedCards = cards.map((c) =>
    c.lessonId === colId ? { ...c, lessonId: targetLessonId } : c
  );
  await saveToStorage(STORAGE_KEYS.FLASHCARDS, updatedCards);

  const quizzes = await getFromStorage<Quiz>(STORAGE_KEYS.QUIZZES);
  const updatedQuizzes = quizzes.map((q) =>
    q.lessonId === colId ? { ...q, lessonId: targetLessonId } : q
  );
  await saveToStorage(STORAGE_KEYS.QUIZZES, updatedQuizzes);

  const all = await getStandaloneCollections();
  await saveToStorage(
    STORAGE_KEYS.STANDALONE_COLLECTIONS,
    all.filter((c) => c.id !== colId)
  );
};

export const importCourse = async (pack: CoursePack): Promise<number> => {
  let imported = 0;

  // 1. Core Structure
  for (const p of pack.paths ?? []) { 
    await saveLearningPath({ ...p, isLocked: true }); 
    imported++; 
  }
  for (const m of pack.modules ?? []) { await saveModule(m); imported++; }
  for (const l of pack.lessons ?? []) { await saveLesson(l); imported++; }
  for (const p of pack.flashcardPacks ?? []) { await saveFlashcardPack(p); }
  for (const p of pack.quizPacks ?? []) { await saveQuizPack(p); }

  // 2. High-volume items (Bulk)
  if ((pack.flashcards ?? []).length > 0) {
    await saveFlashcardsBulkChunked(pack.flashcards!);
    imported += pack.flashcards!.length;
  }
  if ((pack.quizzes ?? []).length > 0) {
    await saveQuizzesBulk(pack.quizzes!);
    imported += pack.quizzes!.length;
  }

  // 3. Supporting content
  for (const m of pack.materials ?? []) { await saveStudyMaterial(m); imported++; }
  for (const n of pack.notes ?? []) { await saveNote(n); imported++; }

  return imported;
};

export const exportCourse = async (pathId: string): Promise<CoursePack> => {
  const allPaths = await getLearningPaths();
  const path = allPaths.find((p) => p.id === pathId);
  if (!path) throw new Error("Kursus tidak ditemukan.");
  
  if (path.isLocked) {
    throw new Error("Pelajaran ini terkunci (DRM Protected) dan tidak dapat disebarkan ulang.");
  }

  const modules = await getModules(pathId);
  const modIds = modules.map((m) => m.id);

  const allLessons = await getLessons();
  const lessons = allLessons.filter((l) => modIds.includes(l.moduleId));
  const lessonIds = lessons.map((l) => l.id);

  const flashcardPacks = (await getFlashcardPacks()).filter((p) =>
    lessonIds.includes(p.lessonId)
  );
  const quizPacks = (await getQuizPacks()).filter((p) =>
    lessonIds.includes(p.lessonId)
  );

  const flashcards = await getFlashcards();
  const filteredFlashcards = flashcards.filter((c) =>
    lessonIds.includes(c.lessonId)
  );

  const quizzes = (await getFromStorage<Quiz>(STORAGE_KEYS.QUIZZES)).filter(
    (q) => lessonIds.includes(q.lessonId)
  );
  const materials = (
    await getFromStorage<StudyMaterial>(STORAGE_KEYS.STUDY_MATERIALS)
  ).filter((m) => lessonIds.includes(m.lessonId));
  const notes = (await getFromStorage<Note>(STORAGE_KEYS.NOTES)).filter((n) =>
    lessonIds.includes(n.lessonId)
  );

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    paths: [path],
    modules,
    lessons,
    flashcardPacks,
    quizPacks,
    flashcards: filteredFlashcards,
    quizzes,
    materials,
    notes,
  };
};

// ─── Lesson Progress & Completion ──────────────────────────────
export const getCompletedLessons = async (): Promise<string[]> => {
  return getFromStorage<string>(STORAGE_KEYS.COMPLETED_LESSONS);
};

export const isLessonCompleted = async (lessonId: string): Promise<boolean> => {
  const completed = await getCompletedLessons();
  return completed.includes(lessonId);
};

export const setLessonCompleted = async (lessonId: string, completed: boolean) => {
  const list = await getCompletedLessons();
  const index = list.indexOf(lessonId);
  
  if (completed && index === -1) {
    list.push(lessonId);
    await updateStreak(); // Boost streak when completing a lesson
  } else if (!completed && index !== -1) {
    list.splice(index, 1);
  }
  
  await saveToStorage(STORAGE_KEYS.COMPLETED_LESSONS, list);
};

/** Calculates overall progress for a course/path */
export const getCourseProgress = async (pathId: string): Promise<{
  total: number;
  completed: number;
  percentage: number;
}> => {
  const modules = await getModules(pathId);
  let total = 0;
  let completed = 0;
  
  const completedList = await getCompletedLessons();
  
  for (const mod of modules) {
    const lessons = await getLessons(mod.id);
    total += lessons.length;
    for (const l of lessons) {
      if (completedList.includes(l.id)) completed++;
    }
  }
  
  return {
    total,
    completed,
    percentage: total > 0 ? (completed / total) * 100 : 0
  };
};

// ─── Token History ─────────────────────────────────────────────
export const getIssuedTokens = async (): Promise<IssuedTokenRecord[]> => {
  return getFromStorage<IssuedTokenRecord>(STORAGE_KEYS.ISSUED_TOKENS);
};

export const saveIssuedToken = async (record: IssuedTokenRecord) => {
  const all = await getIssuedTokens();
  all.unshift(record);
  await saveToStorage(STORAGE_KEYS.ISSUED_TOKENS, all);
};

export const deleteIssuedToken = async (id: string) => {
  const all = await getIssuedTokens();
  await saveToStorage(STORAGE_KEYS.ISSUED_TOKENS, all.filter(t => t.id !== id));
};
