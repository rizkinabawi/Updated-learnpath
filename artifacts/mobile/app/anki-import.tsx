import { useColors, useTheme } from "@/contexts/ThemeContext";
import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";

import {
  Flashcard,
  LearningPath,
  Lesson,
  Module,
  STANDALONE_COLLECTION_PREFIX,
  StandaloneCollection,
  getLearningPaths,
  getUser,
  saveFlashcard,
  saveFlashcardsBulkChunked,
  saveLearningPath,
  saveLesson,
  saveModule,
  saveStandaloneCollection,
} from "@/utils/storage";
import { shadow, shadowSm, type ColorScheme } from "@/constants/colors";
import { parseAnkiPackage, ParseProgress, AnkiImportError } from "@/utils/anki-parser";
import { isFeatureAllowed } from "@/utils/security/app-license";

interface ParsedDeck {
  name: string;
  cards: {
    front: string;
    back: string;
    tags?: string;
    imageUri?: string;
    audioUris?: string[];
    frontImageUris?: string[];
    backImageUris?: string[];
    frontAudioUris?: string[];
    backAudioUris?: string[];
  }[];
}

interface PickedFile {
  name: string;
  size?: number;
  kind: "apkg" | "text";
  /** Cached URI used to re-run the parser on retry. */
  uri?: string;
}

const generateId = () =>
  Date.now().toString() + Math.random().toString(36).substring(2, 9);

function formatBytes(bytes?: number): string {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Compute the longest common `::`-separated prefix of an array of deck names.
 * E.g. ["JLPT N5::Grammar", "JLPT N5::Vocab"] → "JLPT N5".
 * Returns "" if there is no shared prefix.
 */
function commonDeckPrefix(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) {
    const segs = names[0]!.split("::");
    return segs.length > 1 ? segs.slice(0, -1).join("::") : "";
  }
  const split = names.map((n) => n.split("::"));
  const minLen = Math.min(...split.map((s) => s.length));
  const out: string[] = [];
  for (let i = 0; i < minLen; i++) {
    const seg = split[0]![i]!;
    if (split.every((s) => s[i] === seg)) out.push(seg);
    else break;
  }
  // Don't consume the leaf as the module name when all decks are identical
  if (out.length === split[0]!.length) out.pop();
  return out.join("::");
}

/** Strip a leading prefix (with `::`) from a deck name to get the lesson's leaf name. */
function stripPrefix(name: string, prefix: string): string {
  if (!prefix) return name;
  if (name === prefix) return name.split("::").pop() ?? name;
  if (name.startsWith(prefix + "::")) return name.slice(prefix.length + 2);
  return name;
}

/** True when decks look hierarchical or there are multiple decks worth grouping. */
function looksHierarchical(decks: { name: string }[]): boolean {
  if (decks.length >= 2) return true;
  return decks.some((d) => d.name.includes("::"));
}

/**
 * Maximum number of cards we let live under one lessonId. Each lesson maps to
 * a single AsyncStorage row. Even with the database-size cap raised via the
 * `with-async-storage-size` Expo plugin, individual rows still need to stay
 * compact: real-world Anki cards include long media URIs (file://… paths
 * extracted from .apkg media), ruby/furigana HTML, and tag strings — easily
 * 3–8 KB per card. A 500-card cap keeps any one row under ~4 MB and leaves
 * room in the database for many lessons before hitting the (now 256 MB)
 * total cap. Tune lower if you see SQLITE_FULL on large overall libraries.
 */
const MAX_CARDS_PER_LESSON = 250;

/** Split an array into fixed-size chunks (last chunk may be smaller). */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Build a Flashcard from a parsed Anki card while preserving every image and
 * audio file referenced — front-side media stays on the question side, back-side
 * media on the answer side. Only adds non-empty media arrays so the AsyncStorage
 * payload stays small for cards without media.
 */
function buildFlashcardFromAnki(
  c: ParsedDeck["cards"][number],
  deckName: string,
  lessonId: string,
  now: string,
): Flashcard {
  const frontImages = c.frontImageUris ?? (c.imageUri ? [c.imageUri] : []);
  const backImages = c.backImageUris ?? [];
  // Fall back to legacy `audioUris` (front-only assumption) when the parser
  // didn't split front/back — e.g. for older imports.
  const frontAudios = c.frontAudioUris ?? c.audioUris ?? [];
  const backAudios = c.backAudioUris ?? [];

  const card: Flashcard = {
    id: generateId(),
    question: c.front,
    answer: c.back,
    tag: deckName,
    lessonId,
    createdAt: now,
  };
  if (frontImages.length > 0) {
    card.image = frontImages[0];
    if (frontImages.length > 1) card.images = frontImages;
  }
  if (backImages.length > 0) card.imagesBack = backImages;
  if (frontAudios.length > 0) {
    card.audio = frontAudios[0];
    if (frontAudios.length > 1) card.audios = frontAudios;
  }
  if (backAudios.length > 0) card.audiosBack = backAudios;
  return card;
}

function parseTxt(text: string): ParsedDeck {
  const lines = text.split(/\r?\n/);
  const cards: ParsedDeck["cards"] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    let parts: string[];
    if (line.includes("\t")) parts = line.split("\t");
    else if (line.includes(";")) parts = line.split(";");
    else if (line.includes("|")) parts = line.split("|");
    else continue;
    if (parts.length < 2) continue;
    const front = parts[0]!.trim();
    const back = parts[1]!.trim();
    const tags = parts[2]?.trim();
    // Data cleaning: Skip if either side is missing
    if (!front || !back) continue;
    cards.push({ front, back, tags });
  }
  return { name: "Imported Text Deck", cards };
}

export default function AnkiImportScreen() {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);

  const [busy, setBusy] = useState(false);
  const [decks, setDecks] = useState<ParsedDeck[]>([]);
  const [collectionName, setCollectionName] = useState("");
  const [status, setStatus] = useState<{ type: "ok" | "err" | "info"; msg: string } | null>(null);
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  const [expanded, setExpanded] = useState<number | null>(0);
  const [progress, setProgress] = useState<ParseProgress | null>(null);

  // Mode: "collection" → flat standalone collection; "module" → Path/Module/Lesson hierarchy
  const [mode, setMode] = useState<"collection" | "module">("collection");
  const [moduleName, setModuleName] = useState("");
  const [paths, setPaths] = useState<LearningPath[]>([]);
  // Selected path id, or "__new__" to create one inline
  const [selectedPathId, setSelectedPathId] = useState<string>("__new__");
  const [newPathName, setNewPathName] = useState("");
  const [engineOk, setEngineOk] = useState<boolean | null>(null);
  const [groupByTag, setGroupByTag] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      // System Health Audit: Check if native SQLite engine is functional.
      // If it fails, we guide the user to the Text (.txt) import backup.
      try {
        const SQLite = await import("expo-sqlite");
        const db = await SQLite.openDatabaseAsync("__health_check__");
        await db.closeAsync();
        setEngineOk(true);
      } catch (e) {
        console.warn("[AnkiImport] SQLite engine health check failed:", e);
        setEngineOk(false);
      }

      const ps = await getLearningPaths();
      if (!alive) return;
      setPaths(ps);
      // Default: pick first existing path if any, else create-new
      setSelectedPathId(ps[0]?.id ?? "__new__");
    })();
    return () => {
      alive = false;
    };
  }, []);

  const totalCards = decks.reduce((s, d) => s + d.cards.length, 0);

  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (busy) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    pulse.setValue(0);
    return undefined;
  }, [busy, pulse]);

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0.05],
  });

  const reset = () => {
    setDecks([]);
    setPickedFile(null);
    setCollectionName("");
    setStatus(null);
  };

  const pickFile = async () => {
    try {
      setStatus(null);
      // Trigger media permissions to ensure the app has broad file system access in Expo Go
      await MediaLibrary.requestPermissionsAsync();

      console.log("[AnkiImport] Opening document picker...");
      const result = await DocumentPicker.getDocumentAsync({
        type: ["*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) {
        console.log("[AnkiImport] Picker canceled.");
        return;
      }
      
      const asset = result.assets?.[0];
      if (!asset) {
        console.warn("[AnkiImport] No asset selected.");
        setStatus({ type: "err", msg: "Tidak ada file yang dipilih." });
        return;
      }

      console.log("[AnkiImport] Picked:", asset.name, "URI:", asset.uri);
      const name = (asset.name ?? "").toLowerCase();
      setBusy(true);
      setDecks([]);
      setPickedFile({
        name: asset.name ?? "file",
        size: asset.size,
        kind: name.endsWith(".apkg") || name.endsWith(".colpkg") ? "apkg" : "text",
      });

      if (name.endsWith(".txt") || name.endsWith(".csv") || name.endsWith(".tsv")) {
        console.log("[AnkiImport] Processing as text file...");
        const text = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: "utf8",
        });
        const deck = parseTxt(text);
        if (deck.cards.length === 0) {
          setStatus({
            type: "err",
            msg: "Tidak ada kartu valid. Format: front[TAB]back[TAB]tags per baris.",
          });
        } else {
          setDecks([deck]);
          setCollectionName(deck.name);
          setStatus({
            type: "ok",
            msg: `Berhasil parsing ${deck.cards.length} kartu dari file teks.`,
          });
        }
      } else if (name.endsWith(".apkg") || name.endsWith(".colpkg")) {
        console.log("[AnkiImport] Processing as Anki package...");
        setPickedFile((prev) => (prev ? { ...prev, uri: asset.uri } : prev));
        await runApkgParse(asset.uri);
        return;
      } else {
        setPickedFile(null);
        setStatus({
          type: "err",
          msg: "Format tidak dikenali. Gunakan .apkg, .colpkg, .txt, .tsv, atau .csv.",
        });
      }
    } catch (e) {
      console.error("[AnkiImport] Pick error:", e);
      const msg = e instanceof Error ? e.message : String(e);
      setStatus({ type: "err", msg: `Gagal: ${msg}` });
    } finally {
      setBusy(false);
    }
  };

  const runApkgParse = async (uri: string) => {
    try {
      setBusy(true);
      setStatus(null);
      // 100% client-side parser — no backend, no upload limit
      const importId = `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const data = await parseAnkiPackage(uri, (p) => setProgress(p), {
        importId,
        maxRetries: 2,
      });
      setProgress(null);
      if (!data.decks || data.decks.length === 0) {
        setStatus({
          type: "err",
          msg: "Tidak ada kartu ditemukan dalam .apkg. Coba file lain atau ekspor ulang dari Anki.",
        });
        return;
      }
      setDecks(data.decks);
      const isHier = looksHierarchical(data.decks);
      setCollectionName(
        data.decks.length === 1
          ? data.decks[0]!.name
          : `Anki Import (${data.totalCards} cards)`,
      );
      const prefix = commonDeckPrefix(data.decks.map((d) => d.name));
      setModuleName(
        prefix ||
          (data.decks.length === 1
            ? data.decks[0]!.name
            : `Anki Import (${data.decks.length} pelajaran)`),
      );
      setNewPathName(prefix || "Anki Import");
      setMode(isHier ? "module" : "collection");
      setStatus({
        type: "ok",
        msg: `Berhasil parsing ${data.totalCards} kartu dari ${data.decks.length} deck (lokal, tanpa server).`,
      });
    } catch (e) {
      setProgress(null);
      const isAnki = e instanceof AnkiImportError;
      const msg = e instanceof Error ? e.message : String(e);
      setStatus({
        type: "err",
        msg: isAnki ? msg : `Gagal: ${msg}`,
      });
    } finally {
      setBusy(false);
    }
  };

  const retryApkgParse = () => {
    if (pickedFile?.kind === "apkg" && pickedFile.uri) {
      runApkgParse(pickedFile.uri);
    } else {
      pickFile();
    }
  };

  /**
   * Single-collection import. If the combined deck has more cards than
   * MAX_CARDS_PER_LESSON we automatically split it into multiple sub-collections
   * ("Name (1/3)", "Name (2/3)", …) so no single AsyncStorage row blows past
   * the Android SQLite size cap and the open-deck path stays fast. Each
   * sub-collection is saved before moving on to the next so memory stays flat
   * even on imports of 50k+ cards.
   */
  const importAsCollection = async () => {
    const now = new Date().toISOString();
    const baseName = collectionName.trim() || "Anki Import";

    // Flatten every deck into one combined card list. We track the source deck
    // name on each card so the `tag` field still reflects the original deck.
    const combined: Array<{ deckName: string; card: ParsedDeck["cards"][number] }> = [];
    for (const deck of decks) {
      for (const c of deck.cards) combined.push({ deckName: deck.name, card: c });
    }

    if (combined.length <= MAX_CARDS_PER_LESSON) {
      // Fast path — single collection, single AsyncStorage row.
      const colId = `${STANDALONE_COLLECTION_PREFIX}${generateId()}`;
      const col: StandaloneCollection = {
        id: colId,
        name: baseName,
        description: `Imported from Anki — ${combined.length} cards`,
        type: "flashcard",
        createdAt: now,
      };
      await saveStandaloneCollection(col);
      const cards = combined.map((x) =>
        buildFlashcardFromAnki(x.card, x.deckName, colId, now),
      );
      await saveFlashcardsBulkChunked(cards, 50, (done, total) =>
        setProgress({ stage: "building-decks", message: `Menyimpan ${done}/${total}...`, percent: Math.round((done / total) * 100) }),
      );
      setProgress(null);
      return { name: col.name, target: "/(tabs)/practice" as const };
    }

    // Auto-split path — chunk into collections of MAX_CARDS_PER_LESSON each.
    const chunks = chunkArray(combined, MAX_CARDS_PER_LESSON);
    let savedTotal = 0;
    for (let i = 0; i < chunks.length; i++) {
      const colId = `${STANDALONE_COLLECTION_PREFIX}${generateId()}`;
      const col: StandaloneCollection = {
        id: colId,
        name: `${baseName} (${i + 1}/${chunks.length})`,
        description: `Auto-split chunk ${i + 1} of ${chunks.length} · ${chunks[i].length} cards`,
        type: "flashcard",
        createdAt: now,
      };
      await saveStandaloneCollection(col);
      const cards = chunks[i].map((x) =>
        buildFlashcardFromAnki(x.card, x.deckName, colId, now),
      );
      await saveFlashcardsBulkChunked(cards, 50);
      savedTotal += chunks[i].length;
      setProgress({
        stage: "building-decks",
        message: `Menyimpan koleksi ${i + 1}/${chunks.length} (${savedTotal}/${combined.length} kartu)...`,
        percent: Math.round((savedTotal / combined.length) * 100),
      });
      // Help the GC: drop the chunk reference once persisted.
      chunks[i] = [];
    }
    setProgress(null);
    return {
      name: `${baseName} (${chunks.length} koleksi)`,
      target: "/(tabs)/practice" as const,
    };
  };

  /**
   * Module import — each Anki deck becomes a lesson. If a deck has more cards
   * than MAX_CARDS_PER_LESSON we split it into multiple lessons named
   * "<leaf> (1/N)", "<leaf> (2/N)" so heavy decks stay openable. Lessons are
   * saved one by one (cards immediately persisted) instead of accumulating in
   * a single giant `allCards` array — that previous approach held every card
   * in JS memory until the very last save call.
   */
  const importAsModule = async () => {
    const now = new Date().toISOString();

    let pathId = selectedPathId;
    if (selectedPathId === "__new__") {
      const user = await getUser();
      const newPath: LearningPath = {
        id: generateId(),
        name: newPathName.trim() || "Anki Import",
        description: "Diimpor dari Anki",
        userId: user?.id ?? "local",
        icon: "layers",
        createdAt: now,
      };
      await saveLearningPath(newPath);
      pathId = newPath.id;
    }

    const mod: Module = {
      id: generateId(),
      name: moduleName.trim() || "Anki Import",
      description: `${decks.length} pelajaran · ${totalCards} kartu`,
      pathId,
      order: Date.now(),
      icon: "book-open",
      createdAt: now,
    };
    await saveModule(mod);

    if (groupByTag) {
      // New: Logic to group cards by their FIRST tag across all decks.
      // This is great for "One giant deck + many tags" Anki styles.
      const tagGroups = new Map<string, ParsedDeck["cards"][number][]>();
      for (const deck of decks) {
        for (const card of deck.cards) {
          const firstTag = (card.tags?.split(/\s+/)[0] || "No Tag").trim();
          if (!tagGroups.has(firstTag)) tagGroups.set(firstTag, []);
          tagGroups.get(firstTag)!.push(card);
        }
      }

      let order = 0;
      let savedTotal = 0;
      let lessonCount = 0;

      for (const [tagName, cards] of tagGroups) {
        const chunks = chunkArray(cards, MAX_CARDS_PER_LESSON);
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const lesson: Lesson = {
            id: generateId(),
            name: chunks.length === 1 ? tagName : `${tagName} (${i + 1}/${chunks.length})`,
            description: `${chunk.length} kartu (tag: ${tagName})`,
            moduleId: mod.id,
            order: order++,
            createdAt: now,
          };
          await saveLesson(lesson);
          const flashcards = chunk.map(c => buildFlashcardFromAnki(c, tagName, lesson.id, now));
          await saveFlashcardsBulkChunked(flashcards, 50);
          savedTotal += chunk.length;
          lessonCount++;
          setProgress({
            stage: "building-decks",
            message: `Tag "${tagName}" · ${savedTotal}/${totalCards} kartu`,
            percent: Math.round((savedTotal / Math.max(1, totalCards)) * 100),
          });
        }
      }
      setProgress(null);
      return { name: mod.name, target: `/course/${pathId}` as const };
    }

    // Default: Group by Anki Deck (existing logic)
    const prefix = commonDeckPrefix(decks.map((d) => d.name));

    let order = 0;
    let savedTotal = 0;
    let lessonCount = 0;

    // Pre-count expected lessons so the auto-split labels can show "X (1/3)".
    let expectedLessons = 0;
    for (const deck of decks) {
      expectedLessons += Math.max(
        1,
        Math.ceil(deck.cards.length / MAX_CARDS_PER_LESSON),
      );
    }

    for (const deck of decks) {
      const leafName = stripPrefix(deck.name, prefix) || deck.name;
      const deckChunks =
        deck.cards.length <= MAX_CARDS_PER_LESSON
          ? [deck.cards]
          : chunkArray(deck.cards, MAX_CARDS_PER_LESSON);

      for (let i = 0; i < deckChunks.length; i++) {
        const chunk = deckChunks[i];
        const lessonName =
          deckChunks.length === 1
            ? leafName
            : `${leafName} (${i + 1}/${deckChunks.length})`;
        const lesson: Lesson = {
          id: generateId(),
          name: lessonName,
          description: `${chunk.length} kartu`,
          moduleId: mod.id,
          order: order++,
          createdAt: now,
        };
        await saveLesson(lesson);

        const cards = chunk.map((c) =>
          buildFlashcardFromAnki(c, deck.name, lesson.id, now),
        );
        // Save THIS lesson's cards now, then drop the array. Doing it
        // per-lesson instead of building one global allCards[] keeps peak
        // memory bounded by the largest single lesson.
        await saveFlashcardsBulkChunked(cards, 50);
        savedTotal += chunk.length;
        lessonCount += 1;
        setProgress({
          stage: "building-decks",
          message: `Pelajaran ${lessonCount}/${expectedLessons} · ${savedTotal}/${totalCards} kartu`,
          percent: Math.round((savedTotal / Math.max(1, totalCards)) * 100),
        });
      }
    }
    setProgress(null);
    return { name: mod.name, target: `/course/${pathId}` as const };
  };

  /**
   * Top-level entry from the "Import" button. All save errors are caught
   * here, surfaced in the status banner AND a modal alert (with the full
   * message), so the user sees exactly what failed instead of staring at a
   * silent crash.
   */
  const importToCollection = async () => {
    if (decks.length === 0) return;
    
    // License Check
    const allowed = await isFeatureAllowed("anki");
    if (!allowed) {
      Alert.alert(
        "Fitur Terkunci",
        "Mode Trial tidak mendukung impor dari Anki. Silakan aktivasi lisensi penuh untuk membuka fitur ini selamanya.",
        [{ text: "OK" }]
      );
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      const result =
        mode === "module" ? await importAsModule() : await importAsCollection();
      setStatus({
        type: "ok",
        msg: `Berhasil impor ${totalCards} kartu ke "${result.name}".`,
      });
      // Free the parsed-deck arrays from React state — these can hold tens of
      // megabytes of card text + media URIs and would otherwise linger until
      // the user navigates away.
      setDecks([]);
      setPickedFile(null);
      setTimeout(() => router.push(result.target), 800);
    } catch (e) {
      setProgress(null);
      const msg = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error && e.stack ? `\n\n${e.stack.slice(0, 400)}` : "";
      setStatus({ type: "err", msg: `Gagal simpan: ${msg}` });
      Alert.alert(
        "Gagal menyimpan import",
        `${msg}${stack}\n\nCoba kurangi ukuran deck atau ekspor ulang dari Anki.`,
        [{ text: "OK" }],
      );
    } finally {
      setBusy(false);
    }
  };

  const statusColor =
    status?.type === "ok"
      ? colors.success
      : status?.type === "err"
      ? colors.danger
      : colors.primary;
  const statusBg =
    status?.type === "ok"
      ? colors.successLight
      : status?.type === "err"
      ? colors.dangerLight
      : colors.primaryLight;
  const statusIcon =
    status?.type === "ok" ? "check-circle" : status?.type === "err" ? "alert-circle" : "info";

  return (
    <>
      <Stack.Screen
        options={{
          title: "Import Anki",
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { color: colors.text, fontWeight: "700" },
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View>
          {/* Hero */}
          <LinearGradient
            colors={[colors.primary, colors.purple]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.hero, shadow]}
          >
            <View style={styles.heroIconWrap}>
              <Feather name="layers" size={26} color="#fff" />
            </View>
            <Text style={styles.heroTitle}>Import dari Anki</Text>
            <Text style={styles.heroSubtitle}>
              Bawa deck Anki kamu ke koleksi flashcard pribadi. Mendukung .apkg, .colpkg,
              dan teks (.txt/.tsv/.csv).
            </Text>
            <View style={styles.heroChips}>
              <View style={styles.chip}>
                <Feather name="package" size={12} color="#fff" />
                <Text style={styles.chipText}>.apkg</Text>
              </View>
              <View style={styles.chip}>
                <Feather name="archive" size={12} color="#fff" />
                <Text style={styles.chipText}>.colpkg</Text>
              </View>
              <View style={styles.chip}>
                <Feather name="file-text" size={12} color="#fff" />
                <Text style={styles.chipText}>.txt / .tsv</Text>
              </View>
            </View>
          </LinearGradient>

          {engineOk === false && (
            <View style={{ marginHorizontal: 20, marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: colors.dangerLight, flexDirection: "row", gap: 10, borderWidth: 1, borderColor: colors.danger + "22" }}>
              <Feather name="alert-triangle" size={18} color={colors.danger} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "900", color: colors.danger }}>Native SQLite Engine Tidak Tersedia</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
                  Versi sistem ini tidak mendukung file .apkg secara langsung. Gunakan backup metode:
                  <Text style={{ fontWeight: "bold" }}> Ekspor deck dari Anki sebagai file Teks (.txt) </Text>
                  dan import file tersebut sebagai gantinya.
                </Text>
              </View>
            </View>
          )}

          {/* Upload Zone */}
          <View style={[styles.card, shadowSm]}>
            <Pressable
              onPress={pickFile}
              disabled={busy}
              style={({ pressed }) => [
                styles.dropZone,
                pressed && !busy && styles.dropZonePressed,
              ]}
            >
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.dropPulse,
                  {
                    transform: [{ scale: pulseScale }],
                    opacity: pulseOpacity,
                  },
                ]}
              />
              <View style={styles.dropIconBox}>
                {busy ? (
                  <ActivityIndicator color={colors.primary} size="large" />
                ) : (
                  <Feather name="upload-cloud" size={34} color={colors.primary} />
                )}
              </View>
              <Text style={styles.dropTitle}>
                {busy
                  ? "Memproses file..."
                  : pickedFile
                  ? "Ganti File"
                  : "Pilih File untuk Diimpor"}
              </Text>
              <Text style={styles.dropSubtitle}>
                {busy
                  ? progress?.message ?? "Sedang membaca dan parsing kartu"
                  : "Tap di sini untuk membuka file picker (100% offline)"}
              </Text>

              {pickedFile && !busy && (
                <View style={styles.fileChip}>
                  <View
                    style={[
                      styles.fileBadge,
                      {
                        backgroundColor:
                          pickedFile.kind === "apkg" ? colors.purpleLight : colors.tealLight,
                      },
                    ]}
                  >
                    <Feather
                      name={pickedFile.kind === "apkg" ? "package" : "file-text"}
                      size={14}
                      color={pickedFile.kind === "apkg" ? colors.purple : colors.teal}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {pickedFile.name}
                    </Text>
                    <Text style={styles.fileMeta}>{formatBytes(pickedFile.size)}</Text>
                  </View>
                  <TouchableOpacity onPress={reset} hitSlop={10}>
                    <Feather name="x" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              )}
            </Pressable>

            {status && (
              <View style={[styles.statusBox, { backgroundColor: statusBg }]}>
                <Feather name={statusIcon as any} size={16} color={statusColor} />
                <Text style={[styles.statusText, { color: statusColor }]}>{status.msg}</Text>
                {status.type === "err" && pickedFile?.kind === "apkg" && !busy && (
                  <TouchableOpacity
                    onPress={retryApkgParse}
                    style={[styles.retryBtn, { borderColor: statusColor }]}
                    hitSlop={6}
                  >
                    <Feather name="refresh-cw" size={13} color={statusColor} />
                    <Text style={[styles.retryBtnText, { color: statusColor }]}>Coba lagi</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* Stats + Preview */}
          {decks.length > 0 && (
            <View style={[styles.card, shadowSm]}>
              <View style={styles.statsRow}>
                <StatPill
                  icon="layers"
                  value={String(decks.length)}
                  label="Deck"
                  color={colors.primary}
                  bg={colors.primaryLight}
                />
                <StatPill
                  icon="credit-card"
                  value={String(totalCards)}
                  label="Kartu"
                  color={colors.emerald}
                  bg={colors.emeraldLight}
                />
                <StatPill
                  icon="tag"
                  value={String(
                    new Set(decks.flatMap((d) => d.cards.map((c) => c.tags ?? ""))).size,
                  )}
                  label="Tag"
                  color={colors.amber}
                  bg={colors.amberLight}
                />
              </View>

              <View style={styles.divider} />

              <Text style={styles.label}>Cara Impor</Text>
              <View style={styles.modeRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setMode("collection")}
                  style={[
                    styles.modeBtn,
                    mode === "collection" && styles.modeBtnActive,
                  ]}
                >
                  <Feather
                    name="folder"
                    size={16}
                    color={mode === "collection" ? "#fff" : colors.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.modeTitle,
                        mode === "collection" && styles.modeTitleActive,
                      ]}
                    >
                      Koleksi tunggal
                    </Text>
                    <Text
                      style={[
                        styles.modeDesc,
                        mode === "collection" && styles.modeDescActive,
                      ]}
                    >
                      Semua kartu masuk ke 1 koleksi
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setMode("module")}
                  style={[
                    styles.modeBtn,
                    mode === "module" && styles.modeBtnActive,
                  ]}
                >
                  <Feather
                    name="layers"
                    size={16}
                    color={mode === "module" ? "#fff" : colors.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.modeTitle,
                        mode === "module" && styles.modeTitleActive,
                      ]}
                    >
                      Modul (kelompokan)
                    </Text>
                    <Text
                      style={[
                        styles.modeDesc,
                        mode === "module" && styles.modeDescActive,
                      ]}
                    >
                      Tiap deck/tag jadi pelajaran
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {mode === "module" && (
                <View style={[styles.optionRow, { marginTop: 12 }]}>
                  <Text style={styles.optionLabel}>Otomatis kelompokan berdasarkan Tag?</Text>
                  <TouchableOpacity 
                    onPress={() => setGroupByTag(!groupByTag)}
                    style={[styles.switchContainer, groupByTag && styles.switchActive]}
                  >
                    <View style={[styles.switchThumb, groupByTag && styles.switchThumbActive]} />
                  </TouchableOpacity>
                </View>
              )}

              {mode === "collection" ? (
                <>
                  <Text style={[styles.label, { marginTop: 16 }]}>Nama Koleksi</Text>
                  <View style={styles.inputWrap}>
                    <Feather name="bookmark" size={16} color={colors.textMuted} />
                    <TextInput
                      value={collectionName}
                      onChangeText={setCollectionName}
                      style={styles.input}
                      placeholder="Beri nama koleksi…"
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                </>
              ) : (
                <>
                  <Text style={[styles.label, { marginTop: 16 }]}>Path Belajar</Text>
                  <View style={styles.pathChips}>
                    {paths.map((p) => (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => setSelectedPathId(p.id)}
                        style={[
                          styles.pathChip,
                          selectedPathId === p.id && styles.pathChipActive,
                        ]}
                      >
                        <Feather
                          name="bookmark"
                          size={12}
                          color={
                            selectedPathId === p.id ? "#fff" : colors.textMuted
                          }
                        />
                        <Text
                          style={[
                            styles.pathChipText,
                            selectedPathId === p.id && styles.pathChipTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {p.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      onPress={() => setSelectedPathId("__new__")}
                      style={[
                        styles.pathChip,
                        selectedPathId === "__new__" && styles.pathChipActive,
                      ]}
                    >
                      <Feather
                        name="plus"
                        size={12}
                        color={
                          selectedPathId === "__new__" ? "#fff" : colors.textMuted
                        }
                      />
                      <Text
                        style={[
                          styles.pathChipText,
                          selectedPathId === "__new__" && styles.pathChipTextActive,
                        ]}
                      >
                        Buat baru
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {selectedPathId === "__new__" && (
                    <View style={[styles.inputWrap, { marginTop: 8 }]}>
                      <Feather name="plus-circle" size={16} color={colors.textMuted} />
                      <TextInput
                        value={newPathName}
                        onChangeText={setNewPathName}
                        style={styles.input}
                        placeholder="Nama path baru…"
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                  )}

                  <Text style={[styles.label, { marginTop: 14 }]}>Nama Modul</Text>
                  <View style={styles.inputWrap}>
                    <Feather name="layers" size={16} color={colors.textMuted} />
                    <TextInput
                      value={moduleName}
                      onChangeText={setModuleName}
                      style={styles.input}
                      placeholder="Beri nama modul…"
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  <Text style={styles.helperText}>
                    {decks.length} deck akan jadi {decks.length} pelajaran di dalam modul ini.
                  </Text>
                </>
              )}

              <Text style={[styles.label, { marginTop: 18 }]}>Pratinjau Deck</Text>
              {decks.map((d, i) => {
                const isOpen = expanded === i;
                return (
                  <View key={i} style={styles.deckBlock}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setExpanded(isOpen ? null : i)}
                      style={styles.deckHeader}
                    >
                      <View style={styles.deckHeaderLeft}>
                        <View
                          style={[
                            styles.deckIndex,
                            { backgroundColor: colors.primaryLight },
                          ]}
                        >
                          <Text style={[styles.deckIndexText, { color: colors.primary }]}>
                            {i + 1}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.deckName} numberOfLines={1}>
                            {d.name}
                          </Text>
                          <Text style={styles.deckMeta}>{d.cards.length} kartu</Text>
                        </View>
                      </View>
                      <Feather
                        name={isOpen ? "chevron-up" : "chevron-down"}
                        size={18}
                        color={colors.textMuted}
                      />
                    </TouchableOpacity>

                    {isOpen && (
                      <View style={styles.cardsList}>
                        {d.cards.slice(0, 3).map((c, j) => (
                          <View key={j} style={styles.cardPreview}>
                            <View style={styles.qaRow}>
                              <Text style={styles.qaLabel}>Q</Text>
                              <Text style={styles.cardFront} numberOfLines={2}>
                                {c.front}
                              </Text>
                            </View>
                            <View style={styles.qaRow}>
                              <Text style={[styles.qaLabel, styles.qaLabelA]}>A</Text>
                              <Text style={styles.cardBack} numberOfLines={2}>
                                {c.back}
                              </Text>
                            </View>
                          </View>
                        ))}
                        {d.cards.length > 3 && (
                          <Text style={styles.more}>+ {d.cards.length - 3} kartu lainnya</Text>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}

              <TouchableOpacity
                style={styles.cta}
                onPress={importToCollection}
                disabled={busy}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={
                    busy
                      ? ["#94A3B8", "#94A3B8"]
                      : [colors.emerald, "#059669"]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.ctaGradient}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Feather name="check-circle" size={18} color="#fff" />
                      <Text style={styles.ctaText}>
                        Simpan {totalCards} Kartu ke Koleksi
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* Tips */}
          <View style={[styles.card, shadowSm]}>
            <View style={styles.tipsHeader}>
              <View style={[styles.iconBox, { backgroundColor: colors.amberLight }]}>
                <Feather name="zap" size={16} color={colors.amber} />
              </View>
              <Text style={styles.sectionTitle}>Tips & Format</Text>
            </View>
            <TipRow
              icon="package"
              color={colors.purple}
              bg={colors.purpleLight}
              title=".apkg / .colpkg"
              body="File ekspor standar Anki desktop. Berisi koleksi kartu dan deck."
            />
            <TipRow
              icon="file-text"
              color={colors.teal}
              bg={colors.tealLight}
              title=".txt / .tsv / .csv"
              body="Format teks per baris: front[TAB]back[TAB]tags"
            />
            <TipRow
              icon="shield"
              color={colors.emerald}
              bg={colors.emeraldLight}
              title="HTML otomatis dibersihkan"
              body="Tag HTML dan referensi audio dihapus saat impor."
            />
          </View>
        </View>
      </ScrollView>
    </>
  );
}

function StatPill({
  icon,
  value,
  label,
  color,
  bg,
}: {
  icon: keyof typeof Feather.glyphMap;
  value: string;
  label: string;
  color: string;
  bg: string;
}) {
  const { isDark, palette } = useTheme();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  return (
    <View style={[styles.statPill, { backgroundColor: bg }]}>
      <Feather name={icon} size={14} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color }]}>{label}</Text>
    </View>
  );
}

function TipRow({
  icon,
  color,
  bg,
  title,
  body,
}: {
  icon: keyof typeof Feather.glyphMap;
  color: string;
  bg: string;
  title: string;
  body: string;
}) {
  const { isDark, palette } = useTheme();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  return (
    <View style={styles.tipRow}>
      <View style={[styles.tipIcon, { backgroundColor: bg }]}>
        <Feather name={icon} size={14} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.tipTitle}>{title}</Text>
        <Text style={styles.tipBody}>{body}</Text>
      </View>
    </View>
  );
}

const makeStyles = (c: ColorScheme, isDark: boolean, palette: string) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: 16, paddingBottom: 80 },

  hero: {
    borderRadius: 20,
    padding: 22,
    marginBottom: 16,
    overflow: "hidden",
  },
  heroIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 13.5,
    marginTop: 6,
    lineHeight: 19,
  },
  heroChips: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    flexWrap: "wrap",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  chipText: { color: "#fff", fontSize: 11, fontWeight: "600" },

  card: {
    backgroundColor: c.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: c.borderLight,
  },

  dropZone: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: c.border,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.background,
    overflow: "hidden",
  },
  dropZonePressed: {
    backgroundColor: c.primaryLight,
    borderColor: c.primary,
  },
  dropPulse: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: c.primary,
  },
  dropIconBox: {
    width: 70,
    height: 70,
    borderRadius: 18,
    backgroundColor: c.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  dropTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: c.text,
  },
  dropSubtitle: {
    fontSize: 12.5,
    color: c.textSecondary,
    marginTop: 4,
    textAlign: "center",
  },

  fileChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.surface,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 14,
    width: "100%",
    borderWidth: 1,
    borderColor: c.border,
  },
  fileBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  fileName: { fontSize: 13, fontWeight: "600", color: c.text },
  fileMeta: { fontSize: 11, color: c.textMuted, marginTop: 1 },

  statusBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
  },
  statusText: { fontSize: 13, flex: 1, lineHeight: 18, fontWeight: "500", color: c.text },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "transparent",
  },
  retryBtnText: { fontSize: 12, fontWeight: "700" },

  statsRow: { flexDirection: "row", gap: 8 },
  statPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  statValue: { fontSize: 16, fontWeight: "800" },
  statLabel: { fontSize: 11, fontWeight: "600", opacity: 0.8 },

  divider: { height: 1, backgroundColor: c.borderLight, marginVertical: 16 },

  label: {
    fontSize: 12.5,
    fontWeight: "700",
    color: c.textSecondary,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: c.background,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: c.text,
  },

  deckBlock: {
    backgroundColor: c.background,
    borderRadius: 12,
    marginTop: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.borderLight,
  },
  deckHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
  },
  deckHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  deckIndex: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  deckIndexText: { fontSize: 12, fontWeight: "800" },
  deckName: { fontSize: 14, fontWeight: "700", color: c.text },
  deckMeta: { fontSize: 11.5, color: c.textSecondary, marginTop: 2 },

  cardsList: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  cardPreview: {
    backgroundColor: c.surface,
    borderRadius: 10,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: c.borderLight,
  },
  qaRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  qaLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: c.primary,
    backgroundColor: c.primaryLight,
    width: 18,
    height: 18,
    borderRadius: 4,
    textAlign: "center",
    lineHeight: 18,
  },
  qaLabelA: {
    color: c.emerald,
    backgroundColor: c.emeraldLight,
  },
  cardFront: { fontSize: 12.5, color: c.text, fontWeight: "600", flex: 1, lineHeight: 17 },
  cardBack: { fontSize: 12.5, color: c.textSecondary, flex: 1, lineHeight: 17 },
  more: {
    fontSize: 11.5,
    color: c.textMuted,
    textAlign: "center",
    paddingVertical: 6,
    fontStyle: "italic",
  },

  cta: {
    marginTop: 18,
    borderRadius: 14,
    overflow: "hidden",
  },
  ctaGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  ctaText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  tipsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: c.text },

  tipRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 8,
    alignItems: "flex-start",
  },
  tipIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  tipTitle: { fontSize: 13, fontWeight: "700", color: c.text },
  tipBody: { fontSize: 12.5, color: c.textSecondary, marginTop: 2, lineHeight: 17 },

  modeRow: { gap: 8, marginTop: 8 },
  modeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.background,
  },
  modeBtnActive: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  modeTitle: { fontSize: 13.5, fontWeight: "700", color: c.text },
  modeTitleActive: { color: "#fff" },
  modeDesc: { fontSize: 11.5, color: c.textMuted, marginTop: 1 },
  modeDescActive: { color: "rgba(255,255,255,0.85)" },

  pathChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  pathChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.background,
    maxWidth: 200,
  },
  pathChipActive: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  pathChipText: { fontSize: 12, color: c.textSecondary, fontWeight: "600" },
  pathChipTextActive: { color: "#fff" },

  helperText: {
    fontSize: 11.5,
    color: c.textMuted,
    marginTop: 6,
    fontStyle: "italic",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: c.background,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.borderLight,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: c.textSecondary,
  },
  switchContainer: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: c.border,
    padding: 2,
  },
  switchActive: {
    backgroundColor: c.emerald,
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  switchThumbActive: {
    transform: [{ translateX: 20 }],
  },
});
