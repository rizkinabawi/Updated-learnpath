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
  X,
  Trash2,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Bot,
  Copy,
  Check,
  Download,
  PencilLine,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "@/utils/fs-compat";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { Button } from "@/components/Button";
import {
  getQuizzes,
  saveQuiz,
  deleteQuiz,
  getQuizPacks,
  saveQuizPack,
  deleteQuizPack,
  generateId,
  getLessons,
  type Quiz,
  type QuizPack,
} from "@/utils/storage";
import Colors from "@/constants/colors";
import { useTranslation } from "@/contexts/LanguageContext";
import { toast } from "@/components/Toast";
import { AIProviderSheet } from "@/components/AIProviderSheet";
import { callAI } from "@/utils/ai-providers";
import type { AIKey, AIProvider } from "@/utils/ai-keys";

const IMAGE_DIR = ((FileSystem as any).documentDirectory ?? "") + "quiz-images/";

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

const QUIZ_LANG_LABELS: Record<string, string> = {
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
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, " ")
    .replace(/[\u2028\u2029]/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

/** Robustly extract a JSON array or object from any AI response text */
const extractJsonFromText = (text: string): string => {
  const t = normalizeJsonText(text).trim();
  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return normalizeJsonText(fenceMatch[1]).trim();
  const arrStart = t.indexOf("[");
  const arrEnd = t.lastIndexOf("]");
  const objStart = t.indexOf("{");
  const objEnd = t.lastIndexOf("}");
  if (arrStart !== -1 && arrEnd !== -1 && (objStart === -1 || arrStart <= objStart)) {
    return t.slice(arrStart, arrEnd + 1);
  }
  if (objStart !== -1 && objEnd !== -1) {
    return t.slice(objStart, objEnd + 1);
  }
  return t;
};

const buildAIPrompt = (
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
  const langLabel = QUIZ_LANG_LABELS[language] ?? language;
  const noteSection = customNote.trim()
    ? `\nCatatan tambahan: ${customNote.trim()}`
    : "";

  return `Buatkan ${count} soal pilihan ganda tentang "${topic}" dengan tingkat kesulitan ${diffLabel}. Gunakan bahasa ${langLabel}.${noteSection}

PENTING: Balas HANYA dengan array JSON murni. Jangan tambahkan teks, penjelasan, markdown, atau blok kode (\`\`\`). Langsung mulai dengan tanda [ dan akhiri dengan ].

Format JSON yang WAJIB digunakan (contoh):
[
  {
    "question": "Apa fungsi dari useEffect di React?",
    "options": [
      "Mengelola side effects setelah render",
      "Menyimpan state lokal komponen",
      "Membuat komponen baru",
      "Menghapus elemen dari DOM"
    ],
    "correct_answer": "Mengelola side effects setelah render",
    "explanation": "useEffect dijalankan setelah setiap render dan digunakan untuk side effects seperti fetching data, subscription, atau manipulasi DOM."
  }
]

ATURAN WAJIB — wajib diikuti untuk setiap soal:
1. Field "question": string berisi pertanyaan yang jelas
2. Field "options": array berisi TEPAT 4 string pilihan jawaban (teks lengkap, BUKAN huruf A/B/C/D)
3. Field "correct_answer": string yang IDENTIK SAMA PERSIS (huruf, spasi, tanda baca) dengan salah satu elemen di array "options"
4. Field "explanation": string penjelasan singkat mengapa jawaban tersebut benar
5. JANGAN gunakan "A", "B", "C", "D" sebagai nilai "correct_answer" — gunakan teks lengkap opsinya
6. Tidak ada field lain selain "question", "options", "correct_answer", "explanation"
7. Minimum ${Math.max(count, 5)} soal
8. Topik: ${topic}`;
};

export default function CreateQuizScreen() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctOption, setCorrectOption] = useState<number | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [existing, setExisting] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState("");

  // Pack state
  const [packs, setPacks] = useState<QuizPack[]>([]);
  const [activePack, setActivePack] = useState<QuizPack | null>(null);
  const [showPackModal, setShowPackModal] = useState(false);
  const [newPackName, setNewPackName] = useState("");
  const [pendingImportItems, setPendingImportItems] = useState<any[]>([]);

  // Edit modal state
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editOptions, setEditOptions] = useState(["", "", "", ""]);
  const [editCorrectOption, setEditCorrectOption] = useState<number | null>(null);
  const [editImageUri, setEditImageUri] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

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
      const data = await getQuizzes(lessonId);
      setExisting(data);
      const packData = await getQuizPacks(lessonId);
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
    if (!question.trim()) {
      Alert.alert(t.create_qz.question_ph, t.create_qz.fill_question);
      return;
    }
    const filledOptions = options.filter((o) => o.trim());
    if (filledOptions.length < 2) {
      Alert.alert(t.create_qz.question_ph, t.create_qz.fill_options);
      return;
    }
    if (correctOption === null || !options[correctOption]?.trim()) {
      Alert.alert(t.create_qz.answer_label, t.create_qz.pick_answer);
      return;
    }
    const confirmed = await new Promise<boolean>((res) =>
      Alert.alert(
        "Konfirmasi Tambah Soal",
        `Tambahkan soal ini?\n\n"${question.trim()}"`,
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
    const quiz: Quiz = {
      id,
      lessonId: lessonId ?? "",
      question: question.trim(),
      options: options.filter((o) => o.trim()),
      answer: options[correctOption].trim(),
      type: "multiple-choice",
      image: savedImage,
      createdAt: new Date().toISOString(),
    };
    await saveQuiz(quiz);
    setExisting((prev) => [...prev, quiz]);
    setQuestion("");
    setOptions(["", "", "", ""]);
    setCorrectOption(null);
    setImageUri(null);
    setLoading(false);
    toast.success(t.create_qz.added);
  };

  const handleDelete = async (id: string) => {
    await deleteQuiz(id);
    setExisting((prev) => prev.filter((q) => q.id !== id));
    toast.info(t.create_qz.deleted);
  };

  const parseValidQuizItems = (rawItems: any[]) => {
    return rawItems.filter(
      (item) =>
        item.question &&
        Array.isArray(item.options) &&
        (item.correct_answer || item.answer)
    );
  };

  const processImportText = async (rawText: string) => {
    try {
      const extracted = extractJsonFromText(rawText);
      const parsed = JSON.parse(extracted);
      let rawItems: any[] = [];
      if (Array.isArray(parsed)) rawItems = parsed;
      else if (parsed && Array.isArray(parsed.items)) rawItems = parsed.items;
      else if (parsed && Array.isArray(parsed.quizzes)) rawItems = parsed.quizzes;
      else if (parsed && typeof parsed === "object") rawItems = [parsed];

      const validItems = parseValidQuizItems(rawItems);
      if (validItems.length === 0) {
        Alert.alert(
          "Tidak Ada Soal Valid",
          'Tidak ada soal valid ditemukan.\n\nField yang dikenali:\n- "question" (pertanyaan)\n- "options" (array pilihan)\n- "correct_answer" atau "answer" (jawaban benar)\n\nPastikan AI menghasilkan format yang benar.'
        );
        return;
      }
      const confirmed = await new Promise<boolean>((res) =>
        Alert.alert(
          "Konfirmasi Import",
          `Import ${validItems.length} soal ke pelajaran ini?`,
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
    } catch {
      Alert.alert(
        "JSON Tidak Valid",
        'Gagal membaca JSON.\n\nFormat yang didukung:\n[{"question":"...","options":["A","B","C","D"],"correct_answer":"A","explanation":"..."}]\n\nPastikan hasil dari AI sudah disalin lengkap.'
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

  const resolveAnswer = (item: any) => {
    const options: string[] = (item.options ?? []).map(String);
    const answerRaw = String(item.correct_answer ?? item.answer ?? "").trim();
    let answer = answerRaw;
    const exactMatch = options.find((o) => o === answerRaw);
    if (!exactMatch) {
      const letterMatch = answerRaw.match(/^([A-Da-d])[\.\):\s]/);
      if (letterMatch) {
        const idx = "abcd".indexOf(letterMatch[1].toLowerCase());
        if (idx >= 0 && options[idx]) answer = options[idx];
      } else {
        const partial = options.find(
          (o) =>
            o.toLowerCase().includes(answerRaw.toLowerCase()) ||
            answerRaw.toLowerCase().includes(o.toLowerCase())
        );
        if (partial) answer = partial;
      }
    }
    return { options, answer };
  };

  const doImport = async (items: any[], packId: string | undefined) => {
    const toAdd: Quiz[] = [];
    for (const item of items) {
      if (!item.question || !Array.isArray(item.options)) continue;
      const { options, answer } = resolveAnswer(item);
      if (!answer) continue;
      toAdd.push({
        id: generateId(),
        lessonId: lessonId ?? "",
        packId,
        question: String(item.question).trim(),
        options,
        answer,
        explanation: item.explanation ? String(item.explanation).trim() : undefined,
        type: "multiple-choice",
        createdAt: new Date().toISOString(),
      });
    }
    // Save all at once, then update state once (prevents per-item re-render lag)
    try {
      await Promise.all(toAdd.map((q) => saveQuiz(q)));
    } catch {
      toast.error("Gagal menyimpan beberapa soal, coba lagi.");
      return;
    }
    setExisting((prev) => [...prev, ...toAdd]);
    setPendingImportItems([]);
    setImportJson("");
    setShowImport(false);
    setShowPackModal(false);
    setNewPackName("");
    if (toAdd.length > 0) {
      toast.success(t.create_qz.import_done(toAdd.length));
    } else {
      toast.error(t.create_qz.no_saved);
    }
  };

  /** Open edit modal pre-filled with the quiz data */
  const openEdit = (quiz: Quiz) => {
    const opts = [...quiz.options];
    while (opts.length < 4) opts.push("");
    const correctIdx = opts.findIndex((o) => o === quiz.answer);
    setEditingQuiz(quiz);
    setEditQuestion(quiz.question);
    setEditOptions(opts);
    setEditCorrectOption(correctIdx >= 0 ? correctIdx : null);
    setEditImageUri(quiz.image ?? null);
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
    if (!editingQuiz) return;
    if (!editQuestion.trim()) {
      Alert.alert("Pertanyaan kosong", "Isi pertanyaan terlebih dahulu.");
      return;
    }
    const filledOptions = editOptions.filter((o) => o.trim());
    if (filledOptions.length < 2) {
      Alert.alert("Pilihan kurang", "Isi minimal 2 pilihan jawaban.");
      return;
    }
    if (editCorrectOption === null || !editOptions[editCorrectOption]?.trim()) {
      Alert.alert("Jawaban belum dipilih", "Pilih jawaban yang benar.");
      return;
    }
    const confirmed = await new Promise<boolean>((res) =>
      Alert.alert(
        "Simpan Perubahan?",
        "Perubahan pada soal ini akan disimpan permanen.",
        [
          { text: "Batal", style: "cancel", onPress: () => res(false) },
          { text: "Simpan", style: "default", onPress: () => res(true) },
        ]
      )
    );
    if (!confirmed) return;
    setEditLoading(true);
    let savedImage: string | undefined = editImageUri ?? undefined;
    if (editImageUri && editImageUri !== editingQuiz.image) {
      try {
        savedImage = await saveImageToLocal(editImageUri, editingQuiz.id);
      } catch {
        savedImage = editImageUri;
      }
    }
    const updated: Quiz = {
      ...editingQuiz,
      question: editQuestion.trim(),
      options: editOptions.filter((o) => o.trim()),
      answer: editOptions[editCorrectOption].trim(),
      image: savedImage,
    };
    try {
      await saveQuiz(updated);
      setExisting((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
      toast.success("Soal diperbarui!");
    } catch {
      toast.error("Gagal menyimpan perubahan.");
    }
    setEditLoading(false);
    setEditingQuiz(null);
  };

  const doImportToPack = async (packId: string) => {
    await doImport(pendingImportItems, packId);
  };

  const handleCreatePackAndImport = async () => {
    const name = newPackName.trim();
    if (!name) { Alert.alert("Nama Pack", "Masukkan nama pack quiz."); return; }
    const pack: QuizPack = {
      id: generateId(),
      lessonId: lessonId ?? "",
      name,
      createdAt: new Date().toISOString(),
    };
    await saveQuizPack(pack);
    setPacks((prev) => [...prev, pack]);
    await doImportToPack(pack.id);
  };

  const handleDeletePack = async (packId: string) => {
    Alert.alert(t.create_qz.delete_pack_title, t.create_qz.delete_pack_msg, [
      { text: t.common.cancel, style: "cancel" },
      {
        text: t.common.delete, style: "destructive", onPress: async () => {
          await deleteQuizPack(packId);
          setPacks((prev) => prev.filter((p) => p.id !== packId));
          if (activePack?.id === packId) setActivePack(null);
          toast.info(t.create_qz.pack_deleted);
        },
      },
    ]);
  };

  const handleGenerateAndCopyPrompt = async () => {
    if (!promptTopic.trim()) {
      toast.error(t.create_qz.prompt_fill_topic);
      return;
    }
    const count = parseInt(promptCount) || 10;
    const prompt = buildAIPrompt(promptTopic.trim(), count, promptDifficulty, promptLanguage, promptCustomNote);
    setGeneratedPrompt(prompt);
    await Clipboard.setStringAsync(prompt);
    setPromptCopied(true);
    toast.success(t.create_qz.prompt_copied);
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
        <Text style={styles.headerTitle}>{t.create_qz.add_quiz_btn}</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <X size={20} color={Colors.dark} />
        </TouchableOpacity>
      </View>
      <Text style={styles.count}>{existing.length} soal di pelajaran ini</Text>

      {/* ── QUIZ PACKS ── */}
      {packs.length > 0 && (
        <View style={styles.packsSection}>
          <Text style={styles.packsSectionTitle}>Pack Quiz</Text>
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
              const cnt = existing.filter((q) => q.packId === p.id).length;
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
            <Text style={styles.modalSub}>{pendingImportItems.length} soal akan diimport</Text>
            {packs.length > 0 && (
              <>
                <Text style={styles.modalLabel}>Tambah ke pack yang ada:</Text>
                {packs.map((p) => (
                  <TouchableOpacity key={p.id} style={styles.modalPackRow} onPress={() => doImportToPack(p.id)}>
                    <Text style={styles.modalPackName}>{p.name}</Text>
                    <Text style={styles.modalPackCount}>{existing.filter((q) => q.packId === p.id).length} soal</Text>
                  </TouchableOpacity>
                ))}
                <View style={styles.modalDivider} />
              </>
            )}
            <Text style={styles.modalLabel}>Buat pack baru:</Text>
            <TextInput
              value={newPackName}
              onChangeText={setNewPackName}
              placeholder="Nama pack (contoh: Bab 1, Latihan UTS)"
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

      {/* ── AI PROMPT GENERATOR ── */}
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
            <View>
              <Text style={styles.aiCardTitle}>{t.create_qz.section_import}</Text>
              <Text style={styles.aiCardSub}>{t.create_qz.section_prompt}</Text>
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
            {/* Step 1 */}
            <View style={styles.stepRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepNum}>1</Text>
              </View>
              <Text style={styles.stepLabel}>Isi detail soal yang ingin dibuat</Text>
            </View>

            <Text style={styles.fieldLabel}>Topik / Materi</Text>
            <TextInput
              value={promptTopic}
              onChangeText={setPromptTopic}
              placeholder="Contoh: React Hooks, Fotosintesis, Perkalian"
              style={styles.aiInput}
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Jumlah Soal</Text>
            <View style={styles.countRow}>
              {["5", "10", "15", "20"].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[
                    styles.countBtn,
                    promptCount === n && styles.countBtnActive,
                  ]}
                  onPress={() => setPromptCount(n)}
                >
                  <Text
                    style={[
                      styles.countBtnText,
                      promptCount === n && styles.countBtnTextActive,
                    ]}
                  >
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
                  style={[
                    styles.diffBtn,
                    promptDifficulty === d.key && styles.diffBtnActive,
                  ]}
                  onPress={() => setPromptDifficulty(d.key)}
                >
                  <Text
                    style={[
                      styles.diffBtnText,
                      promptDifficulty === d.key && styles.diffBtnTextActive,
                    ]}
                  >
                    {d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Bahasa Soal</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
              {Object.entries(QUIZ_LANG_LABELS).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.diffBtn,
                    promptLanguage === key && styles.diffBtnActive,
                    { paddingHorizontal: 10 },
                  ]}
                  onPress={() => setPromptLanguage(key)}
                >
                  <Text
                    style={[
                      styles.diffBtnText,
                      promptLanguage === key && styles.diffBtnTextActive,
                      { fontSize: 12 },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Catatan Tambahan (opsional)</Text>
            <TextInput
              value={promptCustomNote}
              onChangeText={setPromptCustomNote}
              placeholder="Contoh: Fokus pada konsep X, buat soal kontekstual, dll."
              style={[styles.aiInput, { minHeight: 60, textAlignVertical: "top" }]}
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={3}
            />

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

            {/* Step 2 & 3 instructions */}
            <View style={styles.stepsGuide}>
              <View style={styles.stepRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepNum}>2</Text>
                </View>
                <Text style={styles.stepLabel}>
                  Tempel prompt ke{" "}
                  <Text style={{ fontWeight: "800", color: Colors.dark }}>
                    ChatGPT / Gemini / AI lainnya
                  </Text>
                </Text>
              </View>
              <View style={[styles.stepRow, { marginTop: 8 }]}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepNum}>3</Text>
                </View>
                <Text style={styles.stepLabel}>
                  Salin hasil JSON dari AI → tempel di bagian{" "}
                  <Text style={{ fontWeight: "800", color: Colors.primary }}>
                    "Import JSON dari AI"
                  </Text>{" "}
                  di bawah
                </Text>
              </View>
            </View>

            {/* Preview prompt */}
            {generatedPrompt !== "" && (
              <View style={styles.promptPreview}>
                <Text style={styles.promptPreviewLabel}>Preview Prompt:</Text>
                <Text style={styles.promptPreviewText} numberOfLines={5}>
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
        <View style={styles.importToggleLeft}>
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
          <Text style={styles.importHint}>
            Tempel hasil JSON dari AI di sini lalu tap Import
          </Text>
          <Text style={styles.importFormat}>
            Format: {`[{"question":"...","options":[...],"correct_answer":"..."}]`}
          </Text>
          <TextInput
            value={importJson}
            onChangeText={setImportJson}
            style={[styles.input, { height: 140, textAlignVertical: "top" }]}
            placeholder={`[\n  {\n    "question": "...",\n    "options": ["A","B","C","D"],\n    "correct_answer": "A"\n  }\n]`}
            placeholderTextColor={Colors.textMuted}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button
            label="Import Soal"
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
          <Text style={styles.fieldLabel}>{t.create_qz.question_ph.split("?")[0]}</Text>
          <TextInput
            placeholder="Contoh: Apa yang dikembalikan useState?"
            value={question}
            onChangeText={setQuestion}
            style={[styles.input, { height: 80, textAlignVertical: "top" }]}
            placeholderTextColor={Colors.textMuted}
            multiline
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Gambar Soal (opsional)</Text>
          <TouchableOpacity
            onPress={pickImage}
            style={styles.imagePicker}
            activeOpacity={0.75}
          >
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={styles.imagePreview}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.imagePlaceholder}>
                <ImagePlus size={28} color={Colors.textMuted} />
                <Text style={styles.imagePlaceholderText}>
                  Tap untuk upload gambar soal
                </Text>
              </View>
            )}
          </TouchableOpacity>
          {imageUri && (
            <TouchableOpacity onPress={() => setImageUri(null)} style={styles.removeImage}>
              <Text style={styles.removeImageText}>Hapus gambar</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.fieldLabel}>{t.create_qz.answer_label}</Text>
        <Text style={styles.fieldHint}>
          Tap salah satu pilihan untuk menandai sebagai jawaban benar
        </Text>
        {options.map((opt, idx) => (
          <TouchableOpacity
            key={idx}
            onPress={() => setCorrectOption(idx)}
            style={[
              styles.optionRow,
              correctOption === idx && styles.optionRowActive,
            ]}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.optionBadge,
                correctOption === idx && styles.optionBadgeActive,
              ]}
            >
              <Text
                style={[
                  styles.optionBadgeText,
                  correctOption === idx && { color: Colors.white },
                ]}
              >
                {String.fromCharCode(65 + idx)}
              </Text>
            </View>
            <TextInput
              placeholder={`Pilihan ${String.fromCharCode(65 + idx)}`}
              value={opt}
              onChangeText={(text) => {
                const updated = [...options];
                updated[idx] = text;
                setOptions(updated);
              }}
              style={styles.optionInput}
              placeholderTextColor={Colors.textMuted}
            />
          </TouchableOpacity>
        ))}

        <Button
          label="Tambah Soal"
          loading={loading}
          onPress={handleSave}
          size="lg"
          style={{ borderRadius: 18 }}
        />
      </View>

      {/* ── EXISTING QUIZZES ── */}
      {existing.length > 0 && (
        <View style={styles.existingSection}>
          <Text style={styles.sectionTitle}>
            Soal yang Ada ({existing.length})
          </Text>
          {(activePack ? existing.filter((q) => q.packId === activePack.id) : existing)
            .filter((q) =>
              q.question?.trim() &&
              q.answer?.trim() &&
              Array.isArray(q.options) &&
              q.options.filter((o) => o?.trim()).length >= 2
            )
            .map((q, i) => (
            <View key={q.id} style={styles.questionRow}>
              {!!q.image && (
                <Image
                  source={{ uri: q.image }}
                  style={styles.cardThumb}
                  resizeMode="cover"
                />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.questionNum}>Soal {i + 1}</Text>
                <Text style={styles.questionText}>{q.question}</Text>
                {!!q.answer?.trim() && (
                  <Text style={styles.questionAnswer}>✓ {q.answer}</Text>
                )}
                {q.options
                  .filter((o) => o?.trim())
                  .map((o, oi) => (
                    <Text key={oi} style={[styles.questionAnswer, { color: Colors.textMuted, fontWeight: "500" }]}>
                      {String.fromCharCode(65 + oi)}. {o}
                    </Text>
                  ))}
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  onPress={() => openEdit(q)}
                  style={styles.editBtn}
                >
                  <PencilLine size={14} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert(t.create_qz.delete_quiz_title, t.create_qz.delete_quiz_msg, [
                      { text: t.common.cancel, style: "cancel" },
                      {
                        text: t.common.delete,
                        style: "destructive",
                        onPress: () => handleDelete(q.id),
                      },
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

      {/* ── EDIT QUIZ MODAL ── */}
      {editingQuiz && (
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
                <Text style={styles.editModalTitle}>Edit Soal</Text>
                <TouchableOpacity onPress={() => setEditingQuiz(null)} style={styles.closeBtn}>
                  <X size={18} color={Colors.dark} />
                </TouchableOpacity>
              </View>

              {/* Question */}
              <Text style={styles.editFieldLabel}>Pertanyaan</Text>
              <TextInput
                value={editQuestion}
                onChangeText={setEditQuestion}
                placeholder="Tulis pertanyaan di sini..."
                style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
                placeholderTextColor={Colors.textMuted}
                multiline
              />

              {/* Image */}
              <Text style={[styles.editFieldLabel, { marginTop: 12 }]}>Foto Soal (opsional)</Text>
              <TouchableOpacity style={styles.imagePicker} onPress={pickEditImage} activeOpacity={0.8}>
                {editImageUri ? (
                  <Image source={{ uri: editImageUri }} style={styles.imagePreview} resizeMode="cover" />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <ImagePlus size={24} color={Colors.textMuted} />
                    <Text style={styles.imagePlaceholderText}>Tap untuk tambah foto</Text>
                  </View>
                )}
              </TouchableOpacity>
              {editImageUri && (
                <TouchableOpacity style={styles.removeImage} onPress={() => setEditImageUri(null)}>
                  <Text style={styles.removeImageText}>Hapus Foto</Text>
                </TouchableOpacity>
              )}

              {/* Options */}
              <Text style={[styles.editFieldLabel, { marginTop: 12 }]}>Pilihan Jawaban</Text>
              <Text style={styles.fieldHint}>Tap badge huruf untuk set jawaban benar</Text>
              {editOptions.map((opt, idx) => {
                const label = ["A", "B", "C", "D"][idx];
                const isCorrect = editCorrectOption === idx;
                return (
                  <View key={idx} style={[styles.optionRow, isCorrect && styles.optionRowActive, { marginBottom: 8 }]}>
                    <TouchableOpacity
                      style={[styles.optionBadge, isCorrect && styles.optionBadgeActive]}
                      onPress={() => setEditCorrectOption(idx)}
                    >
                      {isCorrect ? (
                        <Check size={14} color={Colors.white} />
                      ) : (
                        <Text style={styles.optionBadgeText}>{label}</Text>
                      )}
                    </TouchableOpacity>
                    <TextInput
                      value={opt}
                      onChangeText={(v) => {
                        const updated = [...editOptions];
                        updated[idx] = v;
                        setEditOptions(updated);
                      }}
                      placeholder={`Pilihan ${label}`}
                      style={styles.optionInput}
                      placeholderTextColor={Colors.textMuted}
                    />
                  </View>
                );
              })}

              {/* Save Button */}
              <TouchableOpacity
                style={[styles.editSaveBtn, editLoading && { opacity: 0.6 }]}
                onPress={handleEditSave}
                disabled={editLoading}
                activeOpacity={0.85}
              >
                <Text style={styles.editSaveBtnText}>{editLoading ? "Menyimpan..." : "Simpan Perubahan"}</Text>
              </TouchableOpacity>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  headerTitle: { fontSize: 22, fontWeight: "900", color: Colors.dark },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  count: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: "600",
    marginBottom: 16,
  },

  // AI Card
  aiCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Colors.primaryLight,
    marginBottom: 12,
    overflow: "hidden",
  },
  aiCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  aiCardLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  aiIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  aiCardTitle: { fontSize: 14, fontWeight: "800", color: Colors.dark },
  aiCardSub: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: "500",
    marginTop: 1,
  },
  aiCardBody: {
    paddingHorizontal: 14,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 14,
    gap: 6,
  },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNum: { fontSize: 11, fontWeight: "900", color: Colors.primary },
  stepLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: "600", flex: 1 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 4,
  },
  aiInput: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 4,
  },
  countRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
    alignItems: "center",
    flexWrap: "wrap",
  },
  countBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  countBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  countBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  countBtnTextActive: { color: Colors.white },
  countInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark,
    borderWidth: 1.5,
    borderColor: Colors.border,
    width: 72,
  },
  diffRow: { flexDirection: "row", gap: 6, marginTop: 4 },
  diffBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: "center",
  },
  diffBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  diffBtnText: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary },
  diffBtnTextActive: { color: Colors.white },
  promptActionRow: {
    flexDirection: "row", gap: 8, marginTop: 12,
  },
  copyPromptBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 12,
  },
  copyPromptBtnSmall: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, backgroundColor: Colors.primary,
    borderRadius: 12, paddingVertical: 13,
  },
  copyPromptBtnDone: { backgroundColor: Colors.success },
  copyPromptBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.white,
  },
  stepsGuide: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    gap: 0,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  promptPreview: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  promptPreviewLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.primary,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  promptPreviewText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: "500",
    lineHeight: 16,
  },

  // Import section
  importToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    paddingHorizontal: 14,
    backgroundColor: Colors.white,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  importToggleLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  importToggleText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.primary,
  },
  importBox: {
    gap: 8,
    marginBottom: 16,
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  importHint: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  importFormat: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: "500",
    fontStyle: "italic",
  },
  filePickBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, borderStyle: "dashed" },
  filePickText: { fontSize: 13, fontWeight: "600", color: Colors.primary, flex: 1 },
  importOr: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 2 },
  importOrLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  importOrText: { fontSize: 11, color: Colors.textMuted, fontWeight: "500" },

  // Divider
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 12,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Manual Form
  form: { gap: 12, marginBottom: 20 },
  field: { gap: 6 },
  fieldHint: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: "500",
    marginBottom: 4,
  },
  input: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  imagePicker: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: "dashed",
    backgroundColor: Colors.background,
  },
  imagePreview: { width: "100%", height: 180, borderRadius: 14 },
  imagePlaceholder: {
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  imagePlaceholderText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: "600",
  },
  removeImage: { alignSelf: "flex-end", marginTop: 4 },
  removeImageText: { fontSize: 12, color: Colors.danger, fontWeight: "700" },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.white,
    borderRadius: 14,
    paddingLeft: 12,
    paddingRight: 4,
    borderWidth: 2,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  optionRowActive: {
    borderColor: Colors.success,
    backgroundColor: Colors.successLight,
  },
  optionBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionBadgeActive: { backgroundColor: Colors.success, borderColor: Colors.success },
  optionBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.textSecondary,
  },
  optionInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark,
  },

  // Existing
  existingSection: { marginTop: 8 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: Colors.dark,
    marginBottom: 12,
  },
  questionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  cardThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: Colors.background,
  },
  questionNum: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  questionText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark,
    marginBottom: 4,
  },
  questionAnswer: { fontSize: 13, color: Colors.success, fontWeight: "600" },
  cardActions: {
    flexDirection: "column",
    gap: 6,
    alignItems: "center",
  },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.dangerLight,
    alignItems: "center",
    justifyContent: "center",
  },
  editModalCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  editModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: Colors.dark,
  },
  editFieldLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 4,
  },
  editSaveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  editSaveBtnText: {
    fontSize: 15,
    fontWeight: "900",
    color: Colors.white,
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

  // Modal overlay
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

  askAiBtn: { flex: 1, borderRadius: 12, overflow: "hidden" },
  askAiGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 13, borderRadius: 12,
  },
  askAiBtnText: { fontSize: 13, fontWeight: "900", color: "#fff" },
});
