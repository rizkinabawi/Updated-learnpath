import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";

import {
  Flashcard,
  STANDALONE_COLLECTION_PREFIX,
  StandaloneCollection,
  saveFlashcard,
  saveStandaloneCollection,
} from "@/utils/storage";

interface ParsedDeck {
  name: string;
  cards: { front: string; back: string; tags?: string }[];
}

const generateId = () =>
  Date.now().toString() + Math.random().toString(36).substring(2, 9);

function getApiBase(): string {
  // On web (RN web served from same proxy), relative URL works.
  // On native (Expo Go), use injected EXPO_PUBLIC_DOMAIN.
  if (Platform.OS === "web") return "";
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) return "";
  return `https://${domain.replace(/^https?:\/\//, "")}`;
}

function parseTxt(text: string): ParsedDeck {
  const lines = text.split(/\r?\n/);
  const cards: ParsedDeck["cards"] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    // Anki text export uses TAB by default. Allow ';' or '|' fallback.
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
  const [status, setStatus] = useState<string>("");

  const totalCards = decks.reduce((s, d) => s + d.cards.length, 0);

  const pickFile = async () => {
    try {
      setStatus("");
      const result = await DocumentPicker.getDocumentAsync({
        type: ["*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0]!;
      const name = (asset.name ?? "").toLowerCase();
      setBusy(true);
      setDecks([]);

      if (name.endsWith(".txt") || name.endsWith(".csv") || name.endsWith(".tsv")) {
        const text = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        const deck = parseTxt(text);
        if (deck.cards.length === 0) {
          setStatus("Tidak ada kartu valid. Pastikan format: front[TAB]back per baris.");
        } else {
          setDecks([deck]);
          setCollectionName(deck.name);
        }
      } else if (name.endsWith(".apkg") || name.endsWith(".colpkg")) {
        // Upload to backend for parsing
        const form = new FormData();
        // React Native fetch FormData supports {uri, name, type} for files
        // On web, we need the actual blob.
        if (Platform.OS === "web") {
          const resp = await fetch(asset.uri);
          const blob = await resp.blob();
          form.append("file", blob, asset.name ?? "deck.apkg");
        } else {
          form.append("file", {
            // @ts-expect-error RN-specific FormData file shape
            uri: asset.uri,
            name: asset.name ?? "deck.apkg",
            type: "application/zip",
          });
        }
        const res = await fetch(`${getApiBase()}/api/anki/parse`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Server: ${err}`);
        }
        const data = (await res.json()) as {
          totalCards: number;
          decks: ParsedDeck[];
        };
        if (!data.decks || data.decks.length === 0) {
          setStatus("Tidak ada kartu ditemukan dalam .apkg.");
        } else {
          setDecks(data.decks);
          setCollectionName(
            data.decks.length === 1
              ? data.decks[0]!.name
              : `Anki Import (${data.totalCards} cards)`,
          );
        }
      } else {
        setStatus("Format tidak dikenali. Gunakan .apkg, .colpkg, .txt, .tsv, atau .csv.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Gagal: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const importToCollection = async () => {
    if (decks.length === 0) return;
    setBusy(true);
    try {
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

      for (const deck of decks) {
        for (const c of deck.cards) {
          const card: Flashcard = {
            id: generateId(),
            question: c.front,
            answer: c.back,
            tag: deck.name,
            lessonId: colId,
            createdAt: now,
          };
          await saveFlashcard(card);
        }
      }
      setStatus(`Berhasil impor ${totalCards} kartu ke "${col.name}".`);
      setDecks([]);
      setTimeout(() => router.push("/(tabs)/practice"), 800);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Gagal simpan: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Import Anki Deck" }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={[styles.iconBox, { backgroundColor: "#E0F2FE" }]}>
              <Feather name="download" size={22} color="#0EA5E9" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Import dari Anki</Text>
              <Text style={styles.subtitle}>
                Dukung file .apkg, .colpkg, atau text export (.txt/.tsv/.csv)
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={pickFile}
            disabled={busy}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Feather name="folder" size={18} color="#fff" />
                <Text style={styles.buttonText}>Pilih File Anki</Text>
              </>
            )}
          </TouchableOpacity>

          {status ? <Text style={styles.status}>{status}</Text> : null}
        </View>

        {decks.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Pratinjau</Text>
            <Text style={styles.meta}>
              {decks.length} deck • {totalCards} kartu
            </Text>

            <Text style={styles.label}>Nama Koleksi</Text>
            <TextInput
              value={collectionName}
              onChangeText={setCollectionName}
              style={styles.input}
              placeholder="Nama koleksi"
              placeholderTextColor="#94A3B8"
            />

            {decks.slice(0, 3).map((d, i) => (
              <View key={i} style={styles.deckPreview}>
                <Text style={styles.deckName}>{d.name}</Text>
                <Text style={styles.deckMeta}>{d.cards.length} kartu</Text>
                {d.cards.slice(0, 2).map((c, j) => (
                  <View key={j} style={styles.cardPreview}>
                    <Text style={styles.cardFront} numberOfLines={2}>
                      Q: {c.front}
                    </Text>
                    <Text style={styles.cardBack} numberOfLines={2}>
                      A: {c.back}
                    </Text>
                  </View>
                ))}
              </View>
            ))}

            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary, busy && styles.buttonDisabled]}
              onPress={importToCollection}
              disabled={busy}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Feather name="check" size={18} color="#fff" />
                  <Text style={styles.buttonText}>
                    Simpan {totalCards} Kartu ke Koleksi
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Tips</Text>
          <Text style={styles.tip}>
            • <Text style={styles.bold}>.apkg/.colpkg</Text> — file ekspor standar Anki desktop. Berisi koleksi kartu dan media.
          </Text>
          <Text style={styles.tip}>
            • <Text style={styles.bold}>.txt/.tsv</Text> — format teks: <Text style={styles.code}>front[TAB]back[TAB]tags</Text> per baris.
          </Text>
          <Text style={styles.tip}>
            • Format HTML dalam kartu otomatis dibersihkan saat impor.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  content: { padding: 16, paddingBottom: 80 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "700", color: "#0F172A" },
  subtitle: { fontSize: 13, color: "#64748B", marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#0F172A", marginBottom: 6 },
  meta: { fontSize: 13, color: "#475569", marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "600", color: "#334155", marginTop: 8, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
    marginBottom: 12,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0EA5E9",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 4,
  },
  buttonPrimary: { backgroundColor: "#16A34A", marginTop: 14 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  status: { marginTop: 12, fontSize: 13, color: "#0F172A", textAlign: "center" },
  deckPreview: {
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    padding: 12,
    marginVertical: 6,
  },
  deckName: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  deckMeta: { fontSize: 12, color: "#64748B", marginBottom: 6 },
  cardPreview: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#E2E8F0" },
  cardFront: { fontSize: 12, color: "#0F172A", fontWeight: "600" },
  cardBack: { fontSize: 12, color: "#475569", marginTop: 2 },
  tip: { fontSize: 13, color: "#475569", marginVertical: 4, lineHeight: 19 },
  bold: { fontWeight: "700", color: "#0F172A" },
  code: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 4,
    fontSize: 12,
  },
});
