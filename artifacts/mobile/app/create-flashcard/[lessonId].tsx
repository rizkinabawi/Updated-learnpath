import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Platform,
  Image,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import {
  X, Trash2, ChevronDown, ChevronUp, ImagePlus, Bot,
  Copy, Check, Download, PencilLine,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "@/utils/fs-compat";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { Button } from "@/components/Button";
import {
  getFlashcards, saveFlashcard, deleteFlashcard,
  getFlashcardPacks, saveFlashcardPack, deleteFlashcardPack,
  generateId, getLessons, type Flashcard, type FlashcardPack,
} from "@/utils/storage";
import Colors from "@/constants/colors";
import { useTranslation } from "@/contexts/LanguageContext";
import { toast } from "@/components/Toast";
import { AIProviderSheet } from "@/components/AIProviderSheet";
import { callAI } from "@/utils/ai-providers";
import type { AIKey, AIProvider } from "@/utils/ai-keys";

const IMAGE_DIR = (FileSystem.documentDirectory ?? "") + "flashcard-images/";

const ensureImageDir = async () => {
  if (Platform.OS === "web") return;
  const info = await FileSystem.getInfoAsync(IMAGE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(IMAGE_DIR, { intermediates: true });
  }
};

const saveImageToLocal = async (uri: string, id: string): Promise<string> => {
  if (Platform.OS === "web") return uri;
  await ensureImageDir();
  const ext = uri.split(".").pop()?.split("?")[0] ?? "jpg";
  const dest = IMAGE_DIR + id + "." + ext;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
};

const FC_LANG_LABELS: Record<string, string> = {
  "Bahasa Indonesia": "Bahasa Indonesia",
  "English": "English",
  "Japanese": "Japanese (日本語)",
  "Mandarin": "Mandarin (中文)",
  "Arabic": "Arabic (العربية)",
  "French": "French (Français)",
  "German": "German (Deutsch)",
  "Korean": "Korean (한국어)",
};

/** Normalize iOS smart quotes and invisible characters to plain ASCII */
const normalizeJsonText = (raw: string): string =>
  raw
    // Smart/curly double quotes → straight double quotes
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    // Smart/curly single quotes → straight single quotes
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    // Non-breaking spaces, zero-width chars, BOM → regular space / nothing
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, " ")
    // Unicode line/paragraph separators → newline
    .replace(/[\u2028\u2029]/g, "\n")
    // Windows CRLF → LF
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

/** Robustly extract a JSON array or object from any AI response text */
const extractJsonFromText = (text: string): string => {
  const t = normalizeJsonText(text).trim();
  // 1. Strip markdown code fences (with optional text before them)
  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return normalizeJsonText(fenceMatch[1]).trim();
  // 2. Find first '[' or '{' and last ']' or '}'
  const arrStart = t.indexOf("[");
  const arrEnd = t.lastIndexOf("]");
  const objStart = t.indexOf("{");
  const objEnd = t.lastIndexOf("}");
  // Prefer array if it appears first or if no object found
  if (arrStart !== -1 && arrEnd !== -1 && (objStart === -1 || arrStart <= objStart)) {
    return t.slice(arrStart, arrEnd + 1);
  }
  if (objStart !== -1 && objEnd !== -1) {
    return t.slice(objStart, objEnd + 1);
  }
  return t;
};

const buildFlashcardPrompt = (
  topic: string,
  count: number,
  difficulty: string,
  language: string = "Bahasa Indonesia",
  customNote: string = ""
) => {
  const diffLabel =
    difficulty === "easy"
      ? "mudah (untuk pemula)"
      : difficulty === "hard"
      ? "sulit (level lanjut)"
      : "sedang (level menengah)";
  const langLabel = FC_LANG_LABELS[language] ?? language;
  const noteSection = customNote.trim()
    ? `\nCatatan tambahan: ${customNote.trim()}`
    : "";

  return `Buatkan ${count} flashcard belajar tentang "${topic}" dengan tingkat kesulitan ${diffLabel}. Gunakan bahasa ${langLabel}.${noteSection}

PENTING: Balas HANYA dengan array JSON murni. Jangan tambahkan teks, penjelasan, markdown, atau blok kode (\`\`\`). Langsung mulai dengan tanda [ dan akhiri dengan ].

Format JSON yang WAJIB digunakan (contoh):
[
  {
    "question": "Apa yang dimaksud dengan fotosintesis?",
    "answer": "Fotosintesis adalah proses di mana tumbuhan mengubah cahaya matahari, air, dan CO₂ menjadi glukosa dan oksigen menggunakan klorofil.",
    "tag": "biologi-dasar"
  }
]

ATURAN WAJIB — wajib diikuti untuk setiap kartu:
1. Field "question": string berisi pertanyaan atau konsep yang ingin diuji
2. Field "answer": string berisi jawaban lengkap dan jelas (boleh beberapa kalimat)
3. Field "tag": string kata kunci singkat tanpa spasi (gunakan tanda hubung jika perlu, contoh: "reaksi-kimia", "hukum-newton")
4. Tidak ada field lain selain "question", "answer", "tag"
5. Jawaban harus informatif dan edukatif, bukan sekadar satu kata
6. Minimum ${Math.max(count, 3)} kartu
7. Topik: ${topic}`;
};

export default function CreateFlashcardScreen() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [tag, setTag] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [existing, setExisting] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState("");

  // Pack state
  const [packs, setPacks] = useState<FlashcardPack[]>([]);
  const [activePack, setActivePack] = useState<FlashcardPack | null>(null);
  const [showPackModal, setShowPackModal] = useState(false);
  const [newPackName, setNewPackName] = useState("");
  const [pendingImportItems, setPendingImportItems] = useState<any[]>([]);

  // Edit card state
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [editTag, setEditTag] = useState("");
  const [editImageUri, setEditImageUri] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  // AI Prompt Builder state
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptTopic, setPromptTopic] = useState("");
  const [promptCount, setPromptCount] = useState("10");
  const [promptDifficulty, setPromptDifficulty] = useState("medium");
  const [promptLanguage, setPromptLanguage] = useState("Bahasa Indonesia");
  const [promptCustomNote, setPromptCustomNote] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [showAISheet, setShowAISheet] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await getFlashcards(lessonId);
      setExisting(data);
      const packData = await getFlashcardPacks(lessonId);
      setPacks(packData);
      if (lessonId) {
        const lessons = await getLessons();
        const lesson = lessons.find((l) => l.id === lessonId);
        if (lesson?.name) setPromptTopic(lesson.name);
      }
    })();
  }, [lessonId]);

  const pickImage = async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Izin Diperlukan", "Izinkan akses galeri untuk upload gambar.");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!question.trim() || !answer.trim()) {
      Alert.alert(t.create_fc.question_ph, t.create_fc.fill_form);
      return;
    }
    const confirmed = await new Promise<boolean>((res) =>
      Alert.alert(
        "Konfirmasi Tambah Kartu",
        `Tambahkan flashcard ini?\n\nDepan: "${question.trim()}"`,
        [
          { text: "Batal", style: "cancel", onPress: () => res(false) },
          { text: "Tambah", style: "default", onPress: () => res(true) },
        ]
      )
    );
    if (!confirmed) return;
    setLoading(true);
    const id = generateId();
    let savedImage: string | undefined;
    if (imageUri) {
      try {
        savedImage = await saveImageToLocal(imageUri, id);
      } catch {
        savedImage = imageUri;
      }
    }
    const card: Flashcard = {
      id,
      lessonId: lessonId ?? "",
      question: question.trim(),
      answer: answer.trim(),
      tag: tag.trim(),
      image: savedImage,
      createdAt: new Date().toISOString(),
    };
    await saveFlashcard(card);
    setExisting((prev) => [...prev, card]);
    setQuestion("");
    setAnswer("");
    setTag("");
    setImageUri(null);
    setLoading(false);
    toast.success(t.create_fc.added);
  };

  const handleDelete = async (id: string) => {
    await deleteFlashcard(id);
    setExisting((prev) => prev.filter((c) => c.id !== id));
    toast.info(t.create_fc.deleted);
  };

  const openEdit = (card: Flashcard) => {
    setEditingCard(card);
    setEditQuestion(card.question);
    setEditAnswer(card.answer);
    setEditTag(card.tag ?? "");
    setEditImageUri(card.image ?? null);
  };

  const pickEditImage = async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Izin Diperlukan", "Izinkan akses galeri untuk upload gambar.");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setEditImageUri(result.assets[0].uri);
    }
  };

  const handleEditSave = async () => {
    if (!editingCard) return;
    if (!editQuestion.trim() || !editAnswer.trim()) {
      Alert.alert("Form Tidak Lengkap", "Pertanyaan dan jawaban wajib diisi.");
      return;
    }
    const confirmed = await new Promise<boolean>((res) =>
      Alert.alert(
        "Simpan Perubahan?",
        "Perubahan pada kartu ini akan disimpan permanen.",
        [
          { text: "Batal", style: "cancel", onPress: () => res(false) },
          { text: "Simpan", style: "default", onPress: () => res(true) },
        ]
      )
    );
    if (!confirmed) return;
    setEditLoading(true);
    let savedImage: string | undefined = editImageUri ?? undefined;
    if (editImageUri && editImageUri !== editingCard.image) {
      try {
        savedImage = await saveImageToLocal(editImageUri, editingCard.id);
      } catch {
        savedImage = editImageUri;
      }
    }
    const updated: Flashcard = {
      ...editingCard,
      question: editQuestion.trim(),
      answer: editAnswer.trim(),
      tag: editTag.trim(),
      image: savedImage,
    };
    await saveFlashcard(updated);
    setExisting((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    setEditingCard(null);
    setEditLoading(false);
    toast.success("Kartu diperbarui");
  };

  const processImportText = async (rawText: string) => {
    try {
      const extracted = extractJsonFromText(rawText);
      const parsed = JSON.parse(extracted);

      let rawItems: any[] = [];
      if (Array.isArray(parsed)) {
        rawItems = parsed;
      } else if (parsed && Array.isArray(parsed.items)) {
        rawItems = parsed.items;
      } else if (parsed && Array.isArray(parsed.flashcards)) {
        rawItems = parsed.flashcards;
      } else if (parsed && typeof parsed === "object") {
        rawItems = [parsed];
      }

      const validItems = rawItems.filter(
        (item) => (item.question ?? item.front ?? item.pertanyaan) &&
                  (item.answer ?? item.back ?? item.jawaban)
      );

      if (validItems.length === 0) {
        Alert.alert(
          "Tidak Ada Data Valid",
          "Tidak ada flashcard valid ditemukan.\n\nField yang dikenali: \"question\"/\"front\", \"answer\"/\"back\", \"tag\".\n\nPastikan AI menghasilkan array JSON dengan field yang benar."
        );
        return;
      }

      const confirmed = await new Promise<boolean>((res) =>
        Alert.alert(
          "Konfirmasi Import",
          `Import ${validItems.length} flashcard ke pelajaran ini?`,
          [
            { text: "Batal", style: "cancel", onPress: () => res(false) },
            { text: "Import", style: "default", onPress: () => res(true) },
          ]
        )
      );
      if (!confirmed) return;
      if (packs.length > 0) {
        setPendingImportItems(validItems);
        setShowPackModal(true);
      } else {
        await doImport(validItems, undefined);
      }
    } catch (e) {
      Alert.alert(
        "JSON Tidak Valid",
        'Gagal membaca JSON.\n\nFormat yang didukung:\n[{"question":"...","answer":"...","tag":"..."}]\n\nPastikan hasil dari AI sudah disalin lengkap dan tidak ada teks tambahan.'
      );
    }
  };

  const handleImportJson = () => processImportText(importJson);

  const handlePickJsonFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/plain", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      await processImportText(text);
    } catch {
      Alert.alert("Gagal Membaca File", "Tidak dapat membaca file JSON. Pastikan file berformat JSON yang valid.");
    }
  };

  const doImport = async (items: any[], packId: string | undefined) => {
    let count = 0;
    for (const item of items) {
      const q = item.question ?? item.front ?? item.pertanyaan ?? "";
      const a = item.answer ?? item.back ?? item.jawaban ?? "";
      const t = item.tag ?? item.kategori ?? "";
      if (!String(q).trim()) continue;
      const card: Flashcard = {
        id: generateId(),
        lessonId: lessonId ?? "",
        packId,
        question: String(q).trim(),
        answer: String(a).trim(),
        tag: String(t).trim(),
        createdAt: new Date().toISOString(),
      };
      await saveFlashcard(card);
      setExisting((prev) => [...prev, card]);
      count++;
    }
    setPendingImportItems([]);
    setImportJson("");
    setShowImport(false);
    setShowPackModal(false);
    setNewPackName("");
    if (count > 0) {
      toast.success(t.create_fc.import_done(count));
    } else {
      toast.error(t.create_fc.no_saved);
    }
  };

  const doImportToPack = async (packId: string) => {
    await doImport(pendingImportItems, packId);
  };

  const handleCreatePackAndImport = async () => {
    const name = newPackName.trim();
    if (!name) { Alert.alert("Nama Pack", "Masukkan nama pack flashcard."); return; }
    const pack: FlashcardPack = {
      id: generateId(),
      lessonId: lessonId ?? "",
      name,
      createdAt: new Date().toISOString(),
    };
    await saveFlashcardPack(pack);
    setPacks((prev) => [...prev, pack]);
    await doImportToPack(pack.id);
  };

  const handleDeletePack = async (packId: string) => {
    Alert.alert(t.create_fc.delete_pack_title, t.create_fc.delete_pack_msg, [
      { text: t.common.cancel, style: "cancel" },
      {
        text: t.common.delete, style: "destructive", onPress: async () => {
          await deleteFlashcardPack(packId);
          setPacks((prev) => prev.filter((p) => p.id !== packId));
          if (activePack?.id === packId) setActivePack(null);
          toast.info(t.create_fc.pack_deleted);
        },
      },
    ]);
  };

  const handleGenerateAndCopyPrompt = async () => {
    if (!promptTopic.trim()) {
      toast.error(t.create_fc.prompt_fill_topic);
      return;
    }
    const count = parseInt(promptCount) || 10;
    const prompt = buildFlashcardPrompt(promptTopic.trim(), count, promptDifficulty, promptLanguage, promptCustomNote);
    setGeneratedPrompt(prompt);
    await Clipboard.setStringAsync(prompt);
    setPromptCopied(true);
    toast.success(t.create_fc.prompt_copied);
    setTimeout(() => setPromptCopied(false), 3000);
  };

  const handleAskAI = async (provider: AIProvider, key: AIKey) => {
    if (!generatedPrompt) return;
    setAiLoading(true);
    try {
      const { content } = await callAI(provider, generatedPrompt, key.apiKey, key.model);
      await processImportText(content);
      setShowAISheet(false);
      setShowImport(false);
    } catch (e: any) {
      const msg: string = e?.message ?? "Terjadi kesalahan. Coba lagi.";
      const title = msg.toLowerCase().includes("koneksi") || msg.toLowerCase().includes("internet")
        ? "Koneksi Error"
        : msg.toLowerCase().includes("kuota") || msg.toLowerCase().includes("kredit")
        ? "Kuota Habis"
        : "AI Error";
      Alert.alert(title, msg);
    } finally {
      setAiLoading(false);
    }
  };

  const difficulties = [
    { key: "easy", label: "Mudah" },
    { key: "medium", label: "Sedang" },
    { key: "hard", label: "Sulit" },
  ];

  return (
    <KeyboardAwareScrollViewCompat
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Platform.OS === "web" ? 80 : insets.top + 16,
          paddingBottom: 60,
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.create_fc.add_card_btn}</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <X size={20} color={Colors.dark} />
        </TouchableOpacity>
      </View>
      <Text style={styles.count}>{existing.length} kartu di pelajaran ini</Text>

      {/* ── FLASHCARD PACKS ── */}
      {packs.length > 0 && (
        <View style={styles.packsSection}>
          <Text style={styles.packsSectionTitle}>{t.create_fc.section_packs}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
            <TouchableOpacity
              style={[styles.packChip, !activePack && styles.packChipActive]}
              onPress={() => setActivePack(null)}
            >
              <Text style={[styles.packChipText, !activePack && styles.packChipTextActive]}>
                Semua ({existing.length})
              </Text>
            </TouchableOpacity>
            {packs.map((p) => {
              const cnt = existing.filter((c) => c.packId === p.id).length;
              const isActive = activePack?.id === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.packChip, isActive && styles.packChipActive]}
                  onPress={() => setActivePack(isActive ? null : p)}
                  onLongPress={() => handleDeletePack(p.id)}
                >
                  <Text style={[styles.packChipText, isActive && styles.packChipTextActive]}>
                    {p.name} ({cnt})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── PACK SELECTION MODAL ── */}
      {showPackModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Simpan ke Pack</Text>
            <Text style={styles.modalSub}>{pendingImportItems.length} flashcard akan diimport</Text>

            {packs.length > 0 && (
              <>
                <Text style={styles.modalLabel}>Tambah ke pack yang ada:</Text>
                {packs.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.modalPackRow}
                    onPress={() => doImportToPack(p.id)}
                  >
                    <Text style={styles.modalPackName}>{p.name}</Text>
                    <Text style={styles.modalPackCount}>
                      {existing.filter((c) => c.packId === p.id).length} kartu
                    </Text>
                  </TouchableOpacity>
                ))}
                <View style={styles.modalDivider} />
              </>
            )}

            <Text style={styles.modalLabel}>Buat pack baru:</Text>
            <TextInput
              value={newPackName}
              onChangeText={setNewPackName}
              placeholder="Nama pack (contoh: Bab 1, Set Latihan)"
              style={styles.modalInput}
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />
            <TouchableOpacity style={styles.modalCreateBtn} onPress={handleCreatePackAndImport}>
              <Text style={styles.modalCreateBtnText}>Buat Pack & Import</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setShowPackModal(false); setPendingImportItems([]); }}>
              <Text style={styles.modalCancelText}>Batal</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── AI PROMPT BUILDER ── */}
      <View style={styles.aiCard}>
        <TouchableOpacity
          style={styles.aiCardHeader}
          onPress={() => setShowPrompt(!showPrompt)}
          activeOpacity={0.8}
        >
          <View style={styles.aiCardLeft}>
            <View style={styles.aiIcon}>
              <Bot size={18} color={Colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.aiCardTitle}>{t.create_fc.section_import}</Text>
              <Text style={styles.aiCardSub}>{t.create_fc.section_prompt}</Text>
            </View>
          </View>
          {showPrompt ? (
            <ChevronUp size={18} color={Colors.primary} />
          ) : (
            <ChevronDown size={18} color={Colors.primary} />
          )}
        </TouchableOpacity>

        {showPrompt && (
          <View style={styles.aiCardBody}>
            <View style={styles.stepRow}>
              <View style={styles.stepBadge}><Text style={styles.stepNum}>1</Text></View>
              <Text style={styles.stepLabel}>Isi detail flashcard yang ingin dibuat</Text>
            </View>

            <Text style={styles.fieldLabel}>Topik / Materi</Text>
            <TextInput
              value={promptTopic}
              onChangeText={setPromptTopic}
              placeholder="Contoh: Fotosintesis, Hukum Newton, React Hooks"
              style={styles.aiInput}
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Jumlah Kartu</Text>
            <View style={styles.countRow}>
              {["5", "10", "15", "20"].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.countBtn, promptCount === n && styles.countBtnActive]}
                  onPress={() => setPromptCount(n)}
                >
                  <Text style={[styles.countBtnText, promptCount === n && styles.countBtnTextActive]}>
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
              <TextInput
                value={promptCount}
                onChangeText={setPromptCount}
                keyboardType="numeric"
                style={styles.countInput}
                placeholderTextColor={Colors.textMuted}
                placeholder="Lainnya"
                maxLength={3}
              />
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Tingkat Kesulitan</Text>
            <View style={styles.diffRow}>
              {difficulties.map((d) => (
                <TouchableOpacity
                  key={d.key}
                  style={[styles.diffBtn, promptDifficulty === d.key && styles.diffBtnActive]}
                  onPress={() => setPromptDifficulty(d.key)}
                >
                  <Text style={[styles.diffBtnText, promptDifficulty === d.key && styles.diffBtnTextActive]}>
                    {d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Bahasa Kartu</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
              {Object.entries(FC_LANG_LABELS).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.diffBtn, promptLanguage === key && styles.diffBtnActive, { paddingHorizontal: 10 }]}
                  onPress={() => setPromptLanguage(key)}
                >
                  <Text style={[styles.diffBtnText, promptLanguage === key && styles.diffBtnTextActive, { fontSize: 12 }]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Catatan Tambahan (opsional)</Text>
            <TextInput
              value={promptCustomNote}
              onChangeText={setPromptCustomNote}
              placeholder="Contoh: Fokus pada kosakata teknis, sertakan contoh kalimat, dll."
              style={[styles.aiInput, { minHeight: 60, textAlignVertical: "top" }]}
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={3}
            />

            {/* Format reminder */}
            <View style={styles.formatBox}>
              <Text style={styles.formatLabel}>Format output yang dihasilkan:</Text>
              <Text style={styles.formatCode}>
                {`[{\n  "question": "Pertanyaan?",\n  "answer": "Jawaban lengkap",\n  "tag": "kata-kunci"\n}]`}
              </Text>
            </View>

            {/* Action buttons row */}
            <View style={styles.promptActionRow}>
              <TouchableOpacity
                style={[styles.copyPromptBtnSmall, promptCopied && styles.copyPromptBtnDone]}
                onPress={handleGenerateAndCopyPrompt}
                activeOpacity={0.85}
              >
                {promptCopied ? (
                  <Check size={14} color={Colors.white} />
                ) : (
                  <Copy size={14} color={Colors.white} />
                )}
                <Text style={styles.copyPromptBtnText}>
                  {promptCopied ? "Tersalin!" : "Salin Prompt"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.askAiBtn}
                onPress={() => setShowAISheet(true)}
                activeOpacity={0.85}
                disabled={aiLoading}
              >
                <LinearGradient
                  colors={["#10A37F", "#4285F4"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.askAiGrad}
                >
                  {aiLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Text style={{ fontSize: 14 }}>🤖</Text>
                      <Text style={styles.askAiBtnText}>Ask Your AI</Text>
                      <Text style={{ fontSize: 11, color: "#fff" }}>⚡</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <View style={styles.stepsGuide}>
              <View style={styles.stepRow}>
                <View style={styles.stepBadge}><Text style={styles.stepNum}>2</Text></View>
                <Text style={styles.stepLabel}>
                  Tempel prompt ke{" "}
                  <Text style={{ fontWeight: "800", color: Colors.dark }}>ChatGPT / Gemini / AI lainnya</Text>
                </Text>
              </View>
              <View style={[styles.stepRow, { marginTop: 8 }]}>
                <View style={styles.stepBadge}><Text style={styles.stepNum}>3</Text></View>
                <Text style={styles.stepLabel}>
                  Salin hasil JSON dari AI → tempel di{" "}
                  <Text style={{ fontWeight: "800", color: Colors.primary }}>"Import JSON dari AI"</Text>
                  {" "}di bawah
                </Text>
              </View>
            </View>

            {generatedPrompt !== "" && (
              <View style={styles.promptPreview}>
                <Text style={styles.promptPreviewLabel}>Preview Prompt:</Text>
                <Text style={styles.promptPreviewText} numberOfLines={6}>
                  {generatedPrompt}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* ── IMPORT JSON ── */}
      <TouchableOpacity
        style={styles.importToggle}
        onPress={() => setShowImport(!showImport)}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Download size={15} color={Colors.primary} />
          <Text style={styles.importToggleText}>Import JSON dari AI</Text>
        </View>
        {showImport ? (
          <ChevronUp size={16} color={Colors.primary} />
        ) : (
          <ChevronDown size={16} color={Colors.primary} />
        )}
      </TouchableOpacity>

      {showImport && (
        <View style={styles.importBox}>
          {/* Upload file button */}
          <TouchableOpacity onPress={handlePickJsonFile} style={styles.filePickBtn} activeOpacity={0.8}>
            <Download size={16} color={Colors.primary} />
            <Text style={styles.filePickText}>Upload File JSON (.json / .txt)</Text>
          </TouchableOpacity>
          <View style={styles.importOr}>
            <View style={styles.importOrLine} /><Text style={styles.importOrText}>atau tempel teks</Text><View style={styles.importOrLine} />
          </View>
          <Text style={styles.importHint}>Tempel hasil JSON dari AI di sini lalu tap Import</Text>
          <Text style={styles.importFormat}>
            Format: {`[{"question":"...","answer":"...","tag":"..."}]`}
          </Text>
          <TextInput
            value={importJson}
            onChangeText={setImportJson}
            style={[styles.input, { height: 140, textAlignVertical: "top" }]}
            placeholder={`[\n  {\n    "question": "Apa itu...",\n    "answer": "Adalah...",\n    "tag": "kata-kunci"\n  }\n]`}
            placeholderTextColor={Colors.textMuted}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button
            label="Import Flashcard"
            onPress={handleImportJson}
            style={{ borderRadius: 14, marginTop: 4 }}
          />
        </View>
      )}

      {/* Divider */}
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>atau tambah manual</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* ── MANUAL FORM ── */}
      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t.create_fc.question_ph.split("?")[0]}</Text>
          <TextInput
            placeholder="Contoh: Apa itu JSX?"
            value={question}
            onChangeText={setQuestion}
            style={[styles.input, { height: 80, textAlignVertical: "top" }]}
            placeholderTextColor={Colors.textMuted}
            multiline
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t.flashcard.card_hint}</Text>
          <TextInput
            placeholder="Contoh: JSX adalah ekstensi sintaks JavaScript..."
            value={answer}
            onChangeText={setAnswer}
            style={[styles.input, { height: 90, textAlignVertical: "top" }]}
            placeholderTextColor={Colors.textMuted}
            multiline
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Tag (opsional)</Text>
          <TextInput
            placeholder="Contoh: dasar, syntax"
            value={tag}
            onChangeText={setTag}
            style={styles.input}
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Gambar (opsional)</Text>
          <TouchableOpacity onPress={pickImage} style={styles.imagePicker} activeOpacity={0.75}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
            ) : (
              <View style={styles.imagePlaceholder}>
                <ImagePlus size={28} color={Colors.textMuted} />
                <Text style={styles.imagePlaceholderText}>Tap untuk upload gambar</Text>
              </View>
            )}
          </TouchableOpacity>
          {imageUri && (
            <TouchableOpacity onPress={() => setImageUri(null)} style={styles.removeImage}>
              <Text style={styles.removeImageText}>Hapus gambar</Text>
            </TouchableOpacity>
          )}
        </View>

        <Button
          label="Tambah Flashcard"
          loading={loading}
          onPress={handleSave}
          size="lg"
          style={{ borderRadius: 18 }}
        />
      </View>

      {/* ── EXISTING CARDS ── */}
      {existing.length > 0 && (
        <View style={styles.existingSection}>
          <Text style={styles.sectionTitle}>Flashcard yang Ada ({existing.length})</Text>
          {(activePack ? existing.filter((c) => c.packId === activePack.id) : existing)
            .filter((card) => card.question?.trim() && card.answer?.trim())
            .map((card) => (
            <View key={card.id} style={styles.cardRow}>
              {!!card.image && (
                <Image source={{ uri: card.image }} style={styles.cardThumb} resizeMode="cover" />
              )}
              <View style={{ flex: 1 }}>
                {!!card.tag?.trim() && <Text style={styles.cardTag}>{card.tag}</Text>}
                <Text style={styles.cardQ}>{card.question}</Text>
                <Text style={styles.cardA}>{card.answer}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                <TouchableOpacity
                  onPress={() => openEdit(card)}
                  style={[styles.deleteBtn, { backgroundColor: Colors.primaryLight }]}
                >
                  <PencilLine size={14} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert(t.create_fc.delete_card_title, t.create_fc.delete_card_msg, [
                      { text: t.common.cancel, style: "cancel" },
                      { text: t.common.delete, style: "destructive", onPress: () => handleDelete(card.id) },
                    ]);
                  }}
                  style={styles.deleteBtn}
                >
                  <Trash2 size={14} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ── EDIT CARD MODAL ── */}
      {editingCard && (
        <View style={styles.modalOverlay}>
          <ScrollView
            style={{ width: "100%" }}
            contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.editModalCard}>
              {/* Header */}
              <View style={styles.editModalHeader}>
                <Text style={styles.editModalTitle}>Edit Flashcard</Text>
                <TouchableOpacity onPress={() => setEditingCard(null)} style={styles.closeBtn}>
                  <X size={18} color={Colors.dark} />
                </TouchableOpacity>
              </View>

              {/* Question */}
              <Text style={styles.editFieldLabel}>Pertanyaan (Depan)</Text>
              <TextInput
                value={editQuestion}
                onChangeText={setEditQuestion}
                placeholder="Pertanyaan atau istilah..."
                style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
                placeholderTextColor={Colors.textMuted}
                multiline
              />

              {/* Answer */}
              <Text style={[styles.editFieldLabel, { marginTop: 12 }]}>Jawaban (Belakang)</Text>
              <TextInput
                value={editAnswer}
                onChangeText={setEditAnswer}
                placeholder="Jawaban atau definisi..."
                style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
                placeholderTextColor={Colors.textMuted}
                multiline
              />

              {/* Tag */}
              <Text style={[styles.editFieldLabel, { marginTop: 12 }]}>Tag / Kategori (opsional)</Text>
              <TextInput
                value={editTag}
                onChangeText={setEditTag}
                placeholder="Misal: Biologi, Bab 3..."
                style={styles.input}
                placeholderTextColor={Colors.textMuted}
              />

              {/* Image */}
              <Text style={[styles.editFieldLabel, { marginTop: 12 }]}>Foto (opsional)</Text>
              {editImageUri ? (
                <View style={{ marginBottom: 8 }}>
                  <Image source={{ uri: editImageUri }} style={{ width: "100%", height: 160, borderRadius: 12 }} resizeMode="cover" />
                  <TouchableOpacity onPress={() => setEditImageUri(null)} style={{ marginTop: 6, alignSelf: "flex-end" }}>
                    <Text style={{ color: Colors.danger, fontWeight: "700", fontSize: 13 }}>Hapus Foto</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={pickEditImage} style={styles.imgPickerBtn}>
                  <ImagePlus size={18} color={Colors.primary} />
                  <Text style={styles.imgPickerText}>Pilih Foto</Text>
                </TouchableOpacity>
              )}

              {/* Actions */}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
                <TouchableOpacity
                  onPress={() => setEditingCard(null)}
                  style={[styles.editActionBtn, { backgroundColor: Colors.background, flex: 1 }]}
                >
                  <Text style={[styles.editActionText, { color: Colors.textSecondary }]}>Batal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleEditSave}
                  disabled={editLoading}
                  style={[styles.editActionBtn, { backgroundColor: Colors.primary, flex: 2 }]}
                >
                  <Text style={[styles.editActionText, { color: Colors.white }]}>
                    {editLoading ? "Menyimpan..." : "Simpan Perubahan"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      )}
      <AIProviderSheet
        visible={showAISheet}
        loading={aiLoading}
        onClose={() => { if (!aiLoading) setShowAISheet(false); }}
        onSelect={handleAskAI}
      />
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 20 },
  header: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 4,
  },
  headerTitle: { fontSize: 22, fontWeight: "900", color: Colors.dark },
  closeBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: Colors.background, alignItems: "center",
    justifyContent: "center",
  },
  count: { fontSize: 13, color: Colors.textMuted, fontWeight: "600", marginBottom: 16 },

  // AI Card
  aiCard: {
    backgroundColor: Colors.white, borderRadius: 18,
    borderWidth: 1.5, borderColor: Colors.primaryLight,
    marginBottom: 12, overflow: "hidden",
  },
  aiCardHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", padding: 14,
  },
  aiCardLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  aiIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center",
  },
  aiCardTitle: { fontSize: 14, fontWeight: "800", color: Colors.dark },
  aiCardSub: { fontSize: 11, color: Colors.textMuted, fontWeight: "500", marginTop: 1 },
  aiCardBody: {
    paddingHorizontal: 14, paddingBottom: 16,
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingTop: 14, gap: 6,
  },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBadge: {
    width: 22, height: 22, borderRadius: 7,
    backgroundColor: Colors.primaryLight,
    alignItems: "center", justifyContent: "center",
  },
  stepNum: { fontSize: 11, fontWeight: "900", color: Colors.primary },
  stepLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: "600", flex: 1 },
  fieldLabel: {
    fontSize: 11, fontWeight: "800", color: Colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 1,
  },
  aiInput: {
    backgroundColor: Colors.background, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontWeight: "600", color: Colors.dark,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  countRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  countBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border,
  },
  countBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  countBtnText: { fontSize: 13, fontWeight: "700", color: Colors.textSecondary },
  countBtnTextActive: { color: Colors.white },
  countInput: {
    flex: 1, minWidth: 70, paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 10, backgroundColor: Colors.background,
    borderWidth: 1.5, borderColor: Colors.border,
    fontSize: 13, fontWeight: "600", color: Colors.dark,
  },
  diffRow: { flexDirection: "row", gap: 6 },
  diffBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 10,
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border,
    alignItems: "center",
  },
  diffBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  diffBtnText: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary },
  diffBtnTextActive: { color: Colors.white },
  formatBox: {
    backgroundColor: Colors.background, borderRadius: 12,
    padding: 10, borderWidth: 1, borderColor: Colors.border, gap: 4,
  },
  formatLabel: { fontSize: 10, fontWeight: "800", color: Colors.textMuted, textTransform: "uppercase" },
  formatCode: {
    fontSize: 11, color: Colors.dark, fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 17,
  },
  promptActionRow: {
    flexDirection: "row", gap: 8, marginTop: 4,
  },
  copyPromptBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: Colors.primary,
    borderRadius: 12, paddingVertical: 13, marginTop: 4,
  },
  copyPromptBtnSmall: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, backgroundColor: Colors.primary,
    borderRadius: 12, paddingVertical: 13,
  },
  copyPromptBtnDone: { backgroundColor: Colors.success },
  copyPromptBtnText: { fontSize: 13, fontWeight: "900", color: Colors.white },
  stepsGuide: { backgroundColor: Colors.background, borderRadius: 12, padding: 12, gap: 0 },
  promptPreview: {
    backgroundColor: "#1E1E2E", borderRadius: 10, padding: 12,
  },
  promptPreviewLabel: {
    fontSize: 10, fontWeight: "800", color: "#A9B1D6",
    textTransform: "uppercase", marginBottom: 6,
  },
  promptPreviewText: {
    fontSize: 11, color: "#CDD6F4",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", lineHeight: 17,
  },

  // Import
  importToggle: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14, borderTopWidth: 1, borderTopColor: Colors.border, marginBottom: 8,
  },
  importToggleText: { fontSize: 14, fontWeight: "700", color: Colors.primary },
  importBox: { gap: 8, marginBottom: 20 },
  importHint: { fontSize: 12, color: Colors.textMuted, fontWeight: "500", fontStyle: "italic" },
  importFormat: { fontSize: 11, color: Colors.textSecondary, fontWeight: "600", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  filePickBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.card1, borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, borderStyle: "dashed" },
  filePickText: { fontSize: 13, fontWeight: "600", color: Colors.primary, flex: 1 },
  importOr: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 2 },
  importOrLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  importOrText: { fontSize: 11, color: Colors.textMuted, fontWeight: "500" },

  // Divider
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { fontSize: 12, color: Colors.textMuted, fontWeight: "600" },

  // Manual Form
  form: { gap: 14, marginBottom: 20 },
  field: { gap: 6 },
  input: {
    backgroundColor: Colors.white, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontWeight: "600", color: Colors.dark,
    borderWidth: 1, borderColor: Colors.border,
  },
  imagePicker: {
    borderRadius: 16, overflow: "hidden",
    borderWidth: 1.5, borderColor: Colors.border,
    borderStyle: "dashed", backgroundColor: Colors.background,
  },
  imagePreview: { width: "100%", height: 180, borderRadius: 14 },
  imagePlaceholder: { height: 100, alignItems: "center", justifyContent: "center", gap: 8 },
  imagePlaceholderText: { fontSize: 13, color: Colors.textMuted, fontWeight: "600" },
  removeImage: { alignSelf: "flex-end", marginTop: 4 },
  removeImageText: { fontSize: 12, color: Colors.danger, fontWeight: "700" },

  // Existing
  existingSection: { marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: Colors.dark, marginBottom: 12 },
  cardRow: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: Colors.white, borderRadius: 16,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border, gap: 12,
  },
  cardThumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: Colors.background },
  cardTag: {
    fontSize: 10, fontWeight: "800", color: Colors.primary,
    textTransform: "uppercase", letterSpacing: 1, marginBottom: 4,
  },
  cardQ: { fontSize: 14, fontWeight: "700", color: Colors.dark, marginBottom: 4 },
  cardA: { fontSize: 13, color: Colors.textSecondary, fontWeight: "500" },
  deleteBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: Colors.dangerLight,
    alignItems: "center", justifyContent: "center",
  },

  // Packs
  packsSection: { marginBottom: 12 },
  packsSectionTitle: {
    fontSize: 11, fontWeight: "800", color: Colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 1, marginBottom: 8,
  },
  packChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white,
  },
  packChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  packChipText: { fontSize: 13, fontWeight: "700", color: Colors.textMuted },
  packChipTextActive: { color: Colors.white },

  // Modal
  modalOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center",
    zIndex: 100, paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: Colors.white, borderRadius: 20, padding: 20, width: "100%", gap: 10,
  },
  modalTitle: { fontSize: 17, fontWeight: "900", color: Colors.dark },
  modalSub: { fontSize: 13, color: Colors.textMuted, fontWeight: "500", marginBottom: 4 },
  modalLabel: {
    fontSize: 11, fontWeight: "800", color: Colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 1,
  },
  modalPackRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  modalPackName: { fontSize: 14, fontWeight: "700", color: Colors.dark },
  modalPackCount: { fontSize: 12, color: Colors.textMuted, fontWeight: "600" },
  modalDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 4 },
  modalInput: {
    backgroundColor: Colors.background, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontWeight: "600", color: Colors.dark,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  modalCreateBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingVertical: 13, alignItems: "center",
  },
  modalCreateBtnText: { fontSize: 14, fontWeight: "900", color: Colors.white },
  modalCancelBtn: { alignItems: "center", paddingVertical: 8 },
  modalCancelText: { fontSize: 14, fontWeight: "700", color: Colors.textMuted },

  // Edit modal
  editModalCard: {
    backgroundColor: Colors.white, borderRadius: 24,
    padding: 20, width: "100%",
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  editModalHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 16,
  },
  editModalTitle: { fontSize: 18, fontWeight: "900", color: Colors.dark },
  editFieldLabel: {
    fontSize: 11, fontWeight: "800", color: Colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 1, marginBottom: 6,
  },
  editActionBtn: {
    paddingVertical: 14, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: Colors.border,
  },
  editActionText: { fontSize: 14, fontWeight: "800" },
  imgPickerBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1.5, borderColor: Colors.primary, borderStyle: "dashed",
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: Colors.primaryLight, marginBottom: 4,
  },
  imgPickerText: { fontSize: 13, fontWeight: "700", color: Colors.primary },

  askAiBtn: { flex: 1, borderRadius: 12, overflow: "hidden" },
  askAiGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 13, borderRadius: 12,
  },
  askAiBtnText: { fontSize: 13, fontWeight: "900", color: "#fff" },
});
