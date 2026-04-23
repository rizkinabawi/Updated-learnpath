import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import * as FileSystem from "expo-file-system";

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
  saveFlashcardsBulk,
  saveLearningPath,
  saveLesson,
  saveModule,
  saveStandaloneCollection,
} from "@/utils/storage";
import Colors, { shadow, shadowSm } from "@/constants/colors";
import { parseAnkiPackage, ParseProgress } from "@/utils/anki-parser";

interface ParsedDeck {
  name: string;
  cards: { front: string; back: string; tags?: string; imageUri?: string; audioUris?: string[] }[];
}

interface PickedFile {
  name: string;
  size?: number;
  kind: "apkg" | "text";
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
    if (!front || !back) continue;
    cards.push({ front, back, tags });
  }
  return { name: "Imported Text Deck", cards };
}

export default function AnkiImportScreen() {
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

  useEffect(() => {
    let alive = true;
    (async () => {
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
      const result = await DocumentPicker.getDocumentAsync({
        type: ["*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0]!;
      const name = (asset.name ?? "").toLowerCase();
      setBusy(true);
      setDecks([]);
      setPickedFile({
        name: asset.name ?? "file",
        size: asset.size,
        kind: name.endsWith(".apkg") || name.endsWith(".colpkg") ? "apkg" : "text",
      });

      if (name.endsWith(".txt") || name.endsWith(".csv") || name.endsWith(".tsv")) {
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
        // 100% client-side parser — no backend, no upload limit
        const importId = `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const data = await parseAnkiPackage(asset.uri, (p) => setProgress(p), { importId });
        setProgress(null);
        if (!data.decks || data.decks.length === 0) {
          setStatus({ type: "err", msg: "Tidak ada kartu ditemukan dalam .apkg." });
        } else {
          setDecks(data.decks);
          const isHier = looksHierarchical(data.decks);
          setCollectionName(
            data.decks.length === 1
              ? data.decks[0]!.name
              : `Anki Import (${data.totalCards} cards)`,
          );
          // Auto-pick a sensible Module name + default to Module mode when hierarchical
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
        }
      } else {
        setPickedFile(null);
        setStatus({
          type: "err",
          msg: "Format tidak dikenali. Gunakan .apkg, .colpkg, .txt, .tsv, atau .csv.",
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus({ type: "err", msg: `Gagal: ${msg}` });
    } finally {
      setBusy(false);
    }
  };

  const importAsCollection = async () => {
    const now = new Date().toISOString();
    const colId = `${STANDALONE_COLLECTION_PREFIX}${generateId()}`;
    const col: StandaloneCollection = {
      id: colId,
      name: collectionName.trim() || "Anki Import",
      description: `Imported from Anki — ${totalCards} cards`,
      type: "flashcard",
      createdAt: now,
    };
    await saveStandaloneCollection(col);

    const allCards: Flashcard[] = [];
    for (const deck of decks) {
      for (const c of deck.cards) {
        const card: Flashcard = {
          id: generateId(),
          question: c.front,
          answer: c.back,
          tag: deck.name,
          lessonId: colId,
          ...(c.imageUri ? { image: c.imageUri } : {}),
          ...(c.audioUris && c.audioUris.length > 0
            ? { audio: c.audioUris[0] }
            : {}),
          createdAt: now,
        };
        allCards.push(card);
      }
    }
    await saveFlashcardsBulk(allCards);
    return { name: col.name, target: "/(tabs)/practice" as const };
  };

  const importAsModule = async () => {
    const now = new Date().toISOString();

    // Resolve the path: existing or freshly-created
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

    // Create the module
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

    // Strip the common deck prefix so each lesson uses its leaf-level name
    const prefix = commonDeckPrefix(decks.map((d) => d.name));

    let order = 0;
    const allCards: Flashcard[] = [];
    for (const deck of decks) {
      const leafName = stripPrefix(deck.name, prefix) || deck.name;
      const lesson: Lesson = {
        id: generateId(),
        name: leafName,
        description: `${deck.cards.length} kartu`,
        moduleId: mod.id,
        order: order++,
        createdAt: now,
      };
      await saveLesson(lesson);

      for (const c of deck.cards) {
        const card: Flashcard = {
          id: generateId(),
          question: c.front,
          answer: c.back,
          tag: deck.name,
          lessonId: lesson.id,
          ...(c.imageUri ? { image: c.imageUri } : {}),
          ...(c.audioUris && c.audioUris.length > 0
            ? { audio: c.audioUris[0] }
            : {}),
          createdAt: now,
        };
        allCards.push(card);
      }
    }
    await saveFlashcardsBulk(allCards);
    return { name: mod.name, target: `/course/${pathId}` as const };
  };

  const importToCollection = async () => {
    if (decks.length === 0) return;
    setBusy(true);
    try {
      const result =
        mode === "module" ? await importAsModule() : await importAsCollection();
      setStatus({
        type: "ok",
        msg: `Berhasil impor ${totalCards} kartu ke "${result.name}".`,
      });
      setDecks([]);
      setPickedFile(null);
      setTimeout(() => router.push(result.target), 800);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus({ type: "err", msg: `Gagal simpan: ${msg}` });
    } finally {
      setBusy(false);
    }
  };

  const statusColor =
    status?.type === "ok"
      ? Colors.success
      : status?.type === "err"
      ? Colors.danger
      : Colors.primary;
  const statusBg =
    status?.type === "ok"
      ? Colors.successLight
      : status?.type === "err"
      ? Colors.dangerLight
      : Colors.primaryLight;
  const statusIcon =
    status?.type === "ok" ? "check-circle" : status?.type === "err" ? "alert-circle" : "info";

  return (
    <>
      <Stack.Screen
        options={{
          title: "Import Anki",
          headerStyle: { backgroundColor: Colors.background },
          headerTitleStyle: { color: Colors.text, fontWeight: "700" },
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
            colors={[Colors.primary, Colors.purple]}
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
                  <ActivityIndicator color={Colors.primary} size="large" />
                ) : (
                  <Feather name="upload-cloud" size={34} color={Colors.primary} />
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
                          pickedFile.kind === "apkg" ? Colors.purpleLight : Colors.tealLight,
                      },
                    ]}
                  >
                    <Feather
                      name={pickedFile.kind === "apkg" ? "package" : "file-text"}
                      size={14}
                      color={pickedFile.kind === "apkg" ? Colors.purple : Colors.teal}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {pickedFile.name}
                    </Text>
                    <Text style={styles.fileMeta}>{formatBytes(pickedFile.size)}</Text>
                  </View>
                  <TouchableOpacity onPress={reset} hitSlop={10}>
                    <Feather name="x" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              )}
            </Pressable>

            {status && (
              <View style={[styles.statusBox, { backgroundColor: statusBg }]}>
                <Feather name={statusIcon as any} size={16} color={statusColor} />
                <Text style={[styles.statusText, { color: statusColor }]}>{status.msg}</Text>
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
                  color={Colors.primary}
                  bg={Colors.primaryLight}
                />
                <StatPill
                  icon="credit-card"
                  value={String(totalCards)}
                  label="Kartu"
                  color={Colors.emerald}
                  bg={Colors.emeraldLight}
                />
                <StatPill
                  icon="tag"
                  value={String(
                    new Set(decks.flatMap((d) => d.cards.map((c) => c.tags ?? ""))).size,
                  )}
                  label="Tag"
                  color={Colors.amber}
                  bg={Colors.amberLight}
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
                    color={mode === "collection" ? "#fff" : Colors.textMuted}
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
                    color={mode === "module" ? "#fff" : Colors.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.modeTitle,
                        mode === "module" && styles.modeTitleActive,
                      ]}
                    >
                      Modul (deck → pelajaran)
                    </Text>
                    <Text
                      style={[
                        styles.modeDesc,
                        mode === "module" && styles.modeDescActive,
                      ]}
                    >
                      Tiap deck jadi pelajaran terpisah
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {mode === "collection" ? (
                <>
                  <Text style={[styles.label, { marginTop: 16 }]}>Nama Koleksi</Text>
                  <View style={styles.inputWrap}>
                    <Feather name="bookmark" size={16} color={Colors.textMuted} />
                    <TextInput
                      value={collectionName}
                      onChangeText={setCollectionName}
                      style={styles.input}
                      placeholder="Beri nama koleksi…"
                      placeholderTextColor={Colors.textMuted}
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
                            selectedPathId === p.id ? "#fff" : Colors.textMuted
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
                          selectedPathId === "__new__" ? "#fff" : Colors.textMuted
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
                      <Feather name="plus-circle" size={16} color={Colors.textMuted} />
                      <TextInput
                        value={newPathName}
                        onChangeText={setNewPathName}
                        style={styles.input}
                        placeholder="Nama path baru…"
                        placeholderTextColor={Colors.textMuted}
                      />
                    </View>
                  )}

                  <Text style={[styles.label, { marginTop: 14 }]}>Nama Modul</Text>
                  <View style={styles.inputWrap}>
                    <Feather name="layers" size={16} color={Colors.textMuted} />
                    <TextInput
                      value={moduleName}
                      onChangeText={setModuleName}
                      style={styles.input}
                      placeholder="Beri nama modul…"
                      placeholderTextColor={Colors.textMuted}
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
                            { backgroundColor: Colors.primaryLight },
                          ]}
                        >
                          <Text style={[styles.deckIndexText, { color: Colors.primary }]}>
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
                        color={Colors.textMuted}
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
                      : [Colors.emerald, "#059669"]
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
              <View style={[styles.iconBox, { backgroundColor: Colors.amberLight }]}>
                <Feather name="zap" size={16} color={Colors.amber} />
              </View>
              <Text style={styles.sectionTitle}>Tips & Format</Text>
            </View>
            <TipRow
              icon="package"
              color={Colors.purple}
              bg={Colors.purpleLight}
              title=".apkg / .colpkg"
              body="File ekspor standar Anki desktop. Berisi koleksi kartu dan deck."
            />
            <TipRow
              icon="file-text"
              color={Colors.teal}
              bg={Colors.tealLight}
              title=".txt / .tsv / .csv"
              body="Format teks per baris: front[TAB]back[TAB]tags"
            />
            <TipRow
              icon="shield"
              color={Colors.emerald}
              bg={Colors.emeraldLight}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },

  dropZone: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    overflow: "hidden",
  },
  dropZonePressed: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  dropPulse: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.primary,
  },
  dropIconBox: {
    width: 70,
    height: 70,
    borderRadius: 18,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  dropTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.text,
  },
  dropSubtitle: {
    fontSize: 12.5,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: "center",
  },

  fileChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 14,
    width: "100%",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fileBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  fileName: { fontSize: 13, fontWeight: "600", color: Colors.text },
  fileMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },

  statusBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
  },
  statusText: { fontSize: 13, flex: 1, lineHeight: 18, fontWeight: "500" },

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

  divider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 16 },

  label: {
    fontSize: 12.5,
    fontWeight: "700",
    color: Colors.textSecondary,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: Colors.background,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.text,
  },

  deckBlock: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    marginTop: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.borderLight,
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
  deckName: { fontSize: 14, fontWeight: "700", color: Colors.text },
  deckMeta: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2 },

  cardsList: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  cardPreview: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  qaRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  qaLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.primary,
    backgroundColor: Colors.primaryLight,
    width: 18,
    height: 18,
    borderRadius: 4,
    textAlign: "center",
    lineHeight: 18,
  },
  qaLabelA: {
    color: Colors.emerald,
    backgroundColor: Colors.emeraldLight,
  },
  cardFront: { fontSize: 12.5, color: Colors.text, fontWeight: "600", flex: 1, lineHeight: 17 },
  cardBack: { fontSize: 12.5, color: Colors.textSecondary, flex: 1, lineHeight: 17 },
  more: {
    fontSize: 11.5,
    color: Colors.textMuted,
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
  sectionTitle: { fontSize: 15, fontWeight: "700", color: Colors.text },

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
  tipTitle: { fontSize: 13, fontWeight: "700", color: Colors.text },
  tipBody: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 2, lineHeight: 17 },

  modeRow: { gap: 8, marginTop: 8 },
  modeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  modeBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  modeTitle: { fontSize: 13.5, fontWeight: "700", color: Colors.text },
  modeTitleActive: { color: "#fff" },
  modeDesc: { fontSize: 11.5, color: Colors.textMuted, marginTop: 1 },
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
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    maxWidth: 200,
  },
  pathChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pathChipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: "600" },
  pathChipTextActive: { color: "#fff" },

  helperText: {
    fontSize: 11.5,
    color: Colors.textMuted,
    marginTop: 6,
    fontStyle: "italic",
  },
});
