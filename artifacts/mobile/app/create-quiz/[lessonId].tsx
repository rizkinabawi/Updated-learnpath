import { useColors } from "@/contexts/ThemeContext";
import React, { useEffect, useState, useMemo } from "react";
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
  Music,
  Volume2,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "@/utils/fs-compat";
import { resolveAssetUri } from "@/utils/path-resolver";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { useAudioPlayer } from "expo-audio";
import { Button } from "@/components/Button";
import {
  getQuizzes,
  saveQuiz,
  saveQuizzesBulk,
  deleteQuiz,
  getQuizPacks,
  saveQuizPack,
  deleteQuizPack,
  generateId,
  getLessons,
  ensureLocalAsset,
  type Quiz,
  type QuizPack,
} from "@/utils/storage";
import { type ColorScheme, isDarkActive } from "@/constants/colors";
import { useTranslation } from "@/contexts/LanguageContext";
import { toast } from "@/components/Toast";
import { AIProviderSheet } from "@/components/AIProviderSheet";
import { callAI } from "@/utils/ai-providers";
import type { AIKey, AIProvider } from "@/utils/ai-keys";

const IMAGE_DIR = ((FileSystem as any).documentDirectory ?? "") + "quiz-images/";
const AUDIO_DIR = ((FileSystem as any).documentDirectory ?? "") + "quiz-audio/";

const ensureImageDir = async () => {
  if (Platform.OS === "web") return;
  const info = await FileSystem.getInfoAsync(IMAGE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(IMAGE_DIR, { intermediates: true });
  }
};

const ensureAudioDir = async () => {
  if (Platform.OS === "web") return;
  const info = await FileSystem.getInfoAsync(AUDIO_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(AUDIO_DIR, { intermediates: true });
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

const saveAudioToLocal = async (uri: string, id: string): Promise<string> => {
  if (Platform.OS === "web") return uri;
  await ensureAudioDir();
  const ext = uri.split(".").pop()?.split("?")[0] ?? "mp3";
  const dest = AUDIO_DIR + id + "." + ext;
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
  customNote: string = "",
  forceTemplate: "standard" | "listening" = "standard"
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
    "question": "What is 2+2?",
    "options": ["3", "4", "5", "6"],
    "correct_answer": "4",
    "explanation": "Simple arithmetic.",
    "template": "standard"
  },
  {
    "question": "Listen and identify the word.",
    "options": ["Apple", "Banana", "Orange", "Grape"],
    "correct_answer": "Apple",
    "explanation": "The audio says 'Apple'.",
    "template": "listening",
    "ttsScript": "Apple"
  }
]

ATURAN WAJIB — wajib diikuti untuk setiap soal:
1. Field "question": string pertanyaan.
2. Field "options": array TEPAT 4 string pilihan jawaban.
3. Field "correct_answer": string identik dengan salah satu elemen di "options".
4. Field "explanation": string penjelasan.
5. Field "template" (Wajib): isi dengan "${forceTemplate}" untuk tipe soal ini.
6. Field "ttsScript" (${forceTemplate === "listening" ? "Wajib" : "Opsional"}): naskah suara yang akan dibacakan sistem.
7. Minimum ${Math.max(count, 5)} soal.
8. Topik: ${topic}`;
};

export default function CreateQuizScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctOption, setCorrectOption] = useState<number | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [existing, setExisting] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(false);
  const [template, setTemplate] = useState<"standard" | "listening">("standard");
  const [ttsScript, setTtsScript] = useState("");

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
  const [editAudioUri, setEditAudioUri] = useState<string | null>(null);
  const [editTemplate, setEditTemplate] = useState<"standard" | "listening">("standard");
  const [editTtsScript, setEditTtsScript] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const previewPlayer = useAudioPlayer(audioUri ?? null);
  const editPreviewPlayer = useAudioPlayer(editAudioUri ?? null);
  const playPreview = (which: "new" | "edit") => {
    try {
      const p = which === "new" ? previewPlayer : editPreviewPlayer;
      p.seekTo(0);
      p.play();
    } catch {}
  };

  const pickAudio = async (mode: "new" | "edit") => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["audio/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      if (mode === "new") setAudioUri(asset.uri);
      else setEditAudioUri(asset.uri);
    } catch {
      Alert.alert("Gagal Memilih Audio", "Tidak dapat memilih file audio.");
    }
  };

  const [showPrompt, setShowPrompt] = useState(false);
  const [promptTopic, setPromptTopic] = useState("");
  const [promptCount, setPromptCount] = useState("10");
  const [promptDifficulty, setPromptDifficulty] = useState("medium");
  const [promptTemplate, setPromptTemplate] = useState<"standard" | "listening">("standard");
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
    let savedAudio: string | undefined;
    if (audioUri) {
      try {
        savedAudio = await saveAudioToLocal(audioUri, id);
      } catch {
        savedAudio = audioUri;
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
      audio: savedAudio,
      template: template,
      ttsScript: template === "listening" ? ttsScript.trim() : undefined,
      createdAt: new Date().toISOString(),
    };
    await saveQuiz(quiz);
    setExisting((prev) => [...prev, quiz]);
    setQuestion("");
    setOptions(["", "", "", ""]);
    setCorrectOption(null);
    setImageUri(null);
    setAudioUri(null);
    setTemplate("standard");
    setTtsScript("");
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

      const audioField = item.audio || item.audioUrl || item.audio_url;
      const imageField = item.image || item.imageUrl || item.image_url;

      let localAudio: string | undefined;
      if (audioField) {
        localAudio = await ensureLocalAsset(String(audioField).trim(), "quiz-audio");
      }
      let localImage: string | undefined;
      if (imageField) {
        localImage = await ensureLocalAsset(String(imageField).trim(), "quiz-images");
      }

      toAdd.push({
        id: generateId(),
        lessonId: lessonId ?? "",
        packId,
        question: String(item.question).trim(),
        options,
        answer,
        explanation: item.explanation ? String(item.explanation).trim() : undefined,
        type: "multiple-choice",
        template: (item.template || item.tipe || item.mode || item.type) === "listening" ? "listening" : "standard",
        ttsScript: (item.ttsScript || item.script || item.naskah) 
          ? String(item.ttsScript || item.script || item.naskah).trim() 
          : (((item.template || item.tipe || item.mode || item.type) === "listening") ? String(item.question).trim() : undefined),
        audio: localAudio,
        image: localImage,
        createdAt: new Date().toISOString(),
      });
    }
    // Save all at once (much faster than individual calls)
    try {
      await saveQuizzesBulk(toAdd);
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
    setEditAudioUri(quiz.audio ?? null);
    setEditTemplate(quiz.template ?? "standard");
    setEditTtsScript(quiz.ttsScript ?? "");
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
    let savedAudio: string | undefined = editAudioUri ?? undefined;
    if (editAudioUri && editAudioUri !== editingQuiz.audio) {
      try {
        savedAudio = await saveAudioToLocal(editAudioUri, editingQuiz.id);
      } catch {
        savedAudio = editAudioUri;
      }
    }
    const updated: Quiz = {
      ...editingQuiz,
      question: editQuestion.trim(),
      options: editOptions.filter((o) => o.trim()),
      answer: editOptions[editCorrectOption].trim(),
      image: savedImage,
      audio: savedAudio,
      template: editTemplate,
      ttsScript: editTemplate === "listening" ? editTtsScript.trim() : undefined,
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
    const prompt = buildAIPrompt(promptTopic.trim(), count, promptDifficulty, promptLanguage, promptCustomNote, promptTemplate);
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
          <X size={20} color={colors.dark} />
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
              placeholderTextColor={colors.textMuted}
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
              <Bot size={18} color={colors.white} />
            </View>
            <View>
              <Text style={styles.aiCardTitle}>{t.create_qz.section_import}</Text>
              <Text style={styles.aiCardSub}>{t.create_qz.section_prompt}</Text>
            </View>
          </View>
          {showPrompt ? (
            <ChevronUp size={18} color={colors.primary} />
          ) : (
            <ChevronDown size={18} color={colors.primary} />
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
              placeholderTextColor={colors.textMuted}
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
                placeholderTextColor={colors.textMuted}
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

            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Tipe Soal yang Diinginkan</Text>
            <View style={styles.templateRow}>
              <TouchableOpacity
                style={[styles.templateBtn, promptTemplate === "standard" && styles.templateBtnActive, { flex: 1 }]}
                onPress={() => setPromptTemplate("standard")}
              >
                <Text style={[styles.templateBtnText, promptTemplate === "standard" && styles.templateBtnTextActive]}>Standar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.templateBtn, promptTemplate === "listening" && styles.templateBtnActive, { flex: 1 }]}
                onPress={() => setPromptTemplate("listening")}
              >
                <Volume2 size={16} color={promptTemplate === "listening" ? "#fff" : colors.primary} />
                <Text style={[styles.templateBtnText, promptTemplate === "listening" && styles.templateBtnTextActive]}>Listening</Text>
              </TouchableOpacity>
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
              placeholderTextColor={colors.textMuted}
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
                  <Check size={14} color={colors.white} />
                ) : (
                  <Copy size={14} color={colors.white} />
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
                  <Text style={{ fontWeight: "800", color: colors.dark }}>
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
                  <Text style={{ fontWeight: "800", color: colors.primary }}>
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Download size={15} color={colors.primary} />
          <Text style={styles.importToggleText}>Import JSON dari AI</Text>
        </View>
        {showImport ? (
          <ChevronUp size={16} color={colors.primary} />
        ) : (
          <ChevronDown size={16} color={colors.primary} />
        )}
      </TouchableOpacity>

      {showImport && (
        <View style={styles.importBox}>
          {/* Upload file button */}
          <TouchableOpacity onPress={handlePickJsonFile} style={styles.filePickBtn} activeOpacity={0.8}>
            <Download size={16} color={colors.primary} />
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
            placeholderTextColor={colors.textMuted}
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
          <Text style={styles.fieldLabel}>Tipe Soal (Template)</Text>
          <View style={styles.templateRow}>
            <TouchableOpacity 
              onPress={() => setTemplate("standard")}
              style={[styles.templateBtn, template === "standard" && styles.templateBtnActive]}
            >
              <PencilLine size={16} color={template === "standard" ? "#fff" : colors.primary} />
              <Text style={[styles.templateBtnText, template === "standard" && styles.templateBtnTextActive]}>Standar</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => setTemplate("listening")}
              style={[styles.templateBtn, template === "listening" && styles.templateBtnActive]}
            >
              <Volume2 size={16} color={template === "listening" ? "#fff" : colors.primary} />
              <Text style={[styles.templateBtnText, template === "listening" && styles.templateBtnTextActive]}>Listening (TTS)</Text>
            </TouchableOpacity>
          </View>
        </View>

        {template === "listening" && (
          <View style={[styles.field, styles.listeningBox]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Bot size={16} color={colors.primary} />
              <Text style={[styles.fieldLabel, { marginBottom: 0 }]}>Voice Script (Naskah Suara)</Text>
            </View>
            <TextInput
              placeholder="Teks yang akan dibacakan otomatis. Biarkan kosong jika sama dengan pertanyaan."
              value={ttsScript}
              onChangeText={setTtsScript}
              style={[styles.input, { height: 70, textAlignVertical: "top", backgroundColor: "#fff" }]}
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <Text style={styles.fieldInfo}>💡 Di Listening Mode, teks pertanyaan akan disembunyikan sampai user menekan "Lihat Script".</Text>
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t.create_qz.question_ph.split("?")[0]}</Text>
          <TextInput
            placeholder="Contoh: Apa yang dikembalikan useState?"
            value={question}
            onChangeText={setQuestion}
            style={[styles.input, { height: 80, textAlignVertical: "top" }]}
            placeholderTextColor={colors.textMuted}
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
                <ImagePlus size={28} color={colors.textMuted} />
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

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Audio Soal (opsional)</Text>
          <View style={styles.audioPickedRow}>
            <TouchableOpacity
              onPress={() => pickAudio("new")}
              style={styles.audioPickerBtn}
              activeOpacity={0.75}
            >
              <Music size={18} color={colors.primary} />
              <Text style={styles.audioPickerText} numberOfLines={1}>
                {audioUri ? "Ganti audio" : "Pilih file audio"}
              </Text>
            </TouchableOpacity>
            {audioUri && (
              <>
                <TouchableOpacity
                  onPress={() => playPreview("new")}
                  style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#22c55e", alignItems: "center", justifyContent: "center" }}
                  activeOpacity={0.75}
                >
                  <Volume2 size={18} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setAudioUri(null)}
                  style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#fee2e2", alignItems: "center", justifyContent: "center" }}
                  activeOpacity={0.75}
                >
                  <X size={18} color={colors.danger} />
                </TouchableOpacity>
              </>
            )}
          </View>
          {audioUri && (
            <Text style={styles.audioHint} numberOfLines={1}>
              {audioUri.split("/").pop()}
            </Text>
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
                  correctOption === idx && { color: colors.white },
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
              placeholderTextColor={colors.textMuted}
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
            <View key={q.id} style={styles.cardRow}>
              {!!q.image && (
                <Image
                  source={{ uri: resolveAssetUri(q.image) }}
                  style={styles.cardThumb}
                  resizeMode="cover"
                />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.cardQ}>Soal {i + 1}</Text>
                <Text style={styles.questionText}>{q.question}</Text>
                {!!q.answer?.trim() && (
                  <Text style={styles.cardA}>✓ {q.answer}</Text>
                )}
                {q.options
                  .filter((o) => o?.trim())
                  .map((o, oi) => (
                    <Text key={oi} style={[styles.cardA, { color: colors.textMuted, fontWeight: "500" }]}>
                      {String.fromCharCode(65 + oi)}. {o}
                    </Text>
                  ))}
                {q.template === "listening" && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 }}>
                    <Volume2 size={12} color={colors.primary} />
                    <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "700" }}>Listening Mode</Text>
                  </View>
                )}
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  onPress={() => openEdit(q)}
                  style={styles.editBtn}
                >
                  <PencilLine size={14} color={colors.primary} />
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
                  <Trash2 size={14} color={colors.danger} />
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
                  <X size={18} color={colors.dark} />
                </TouchableOpacity>
              </View>

              {/* Question */}
              <Text style={styles.editFieldLabel}>Pertanyaan</Text>
              <TextInput
                value={editQuestion}
                onChangeText={setEditQuestion}
                placeholder="Tulis pertanyaan di sini..."
                style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
                placeholderTextColor={colors.textMuted}
                multiline
              />

              {/* Template Selection */}
              <Text style={[styles.editFieldLabel, { marginTop: 16 }]}>Mode Soal</Text>
              <View style={styles.templateRow}>
                <TouchableOpacity
                  style={[styles.templateBtn, editTemplate === "standard" && styles.templateBtnActive]}
                  onPress={() => setEditTemplate("standard")}
                >
                  <Text style={[styles.templateBtnText, editTemplate === "standard" && styles.templateBtnTextActive]}>Standar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.templateBtn, editTemplate === "listening" && styles.templateBtnActive]}
                  onPress={() => setEditTemplate("listening")}
                >
                  <Volume2 size={16} color={editTemplate === "listening" ? "#fff" : colors.primary} />
                  <Text style={[styles.templateBtnText, editTemplate === "listening" && styles.templateBtnTextActive]}>Listening</Text>
                </TouchableOpacity>
              </View>

              {editTemplate === "listening" && (
                <View style={styles.listeningBox}>
                  <Text style={styles.editFieldLabel}>Naskah Suara (TTS)</Text>
                  <TextInput
                    value={editTtsScript}
                    onChangeText={setEditTtsScript}
                    placeholder="Contoh: Ohayou gozaimasu"
                    style={[styles.input, { backgroundColor: colors.white }]}
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={styles.fieldInfo}>Teks ini akan dibacakan oleh sistem sebagai soal.</Text>
                </View>
              )}

              {/* Image */}
              <Text style={[styles.editFieldLabel, { marginTop: 12 }]}>Foto Soal (opsional)</Text>
              <TouchableOpacity style={styles.imagePicker} onPress={pickEditImage} activeOpacity={0.8}>
                {editImageUri ? (
                  <Image source={{ uri: editImageUri }} style={styles.imagePreview} resizeMode="cover" />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <ImagePlus size={24} color={colors.textMuted} />
                    <Text style={styles.imagePlaceholderText}>Tap untuk tambah foto</Text>
                  </View>
                )}
              </TouchableOpacity>
              {editImageUri && (
                <TouchableOpacity style={styles.removeImage} onPress={() => setEditImageUri(null)}>
                  <Text style={styles.removeImageText}>Hapus Foto</Text>
                </TouchableOpacity>
              )}

              {/* Audio */}
              <Text style={[styles.editFieldLabel, { marginTop: 12 }]}>Audio Soal (opsional)</Text>
              <View style={styles.audioPickedRow}>
                <TouchableOpacity
                  onPress={() => pickAudio("edit")}
                  style={styles.audioPickerBtn}
                  activeOpacity={0.75}
                >
                  <Music size={18} color={colors.primary} />
                  <Text style={styles.audioPickerText} numberOfLines={1}>
                    {editAudioUri ? "Ganti audio" : "Pilih file audio"}
                  </Text>
                </TouchableOpacity>
                {editAudioUri && (
                  <>
                    <TouchableOpacity
                      onPress={() => playPreview("edit")}
                      style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#22c55e", alignItems: "center", justifyContent: "center" }}
                      activeOpacity={0.75}
                    >
                      <Volume2 size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setEditAudioUri(null)}
                      style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#fee2e2", alignItems: "center", justifyContent: "center" }}
                      activeOpacity={0.75}
                    >
                      <X size={18} color={colors.danger} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
              {editAudioUri && (
                <Text style={styles.audioHint} numberOfLines={1}>
                  {editAudioUri.split("/").pop()}
                </Text>
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
                        <Check size={14} color={colors.white} />
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
                      placeholderTextColor={colors.textMuted}
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
                <Text style={styles.editSaveText}>{editLoading ? "Menyimpan..." : "Simpan Perubahan"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      )}
      <AIProviderSheet
        visible={showAISheet}
        loading={aiLoading}
        onClose={() => {
          if (!aiLoading) setShowAISheet(false);
        }}
        onSelect={handleAskAI}
      />
    </KeyboardAwareScrollViewCompat>
  );
}

const makeStyles = (c: ColorScheme) => {
  const isDark = isDarkActive();
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 20 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 4,
    },
    headerTitle: { fontSize: 22, fontWeight: "900", color: c.dark },
    closeBtn: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: c.background,
      alignItems: "center",
      justifyContent: "center",
    },
    count: {
      fontSize: 13,
      color: c.textMuted,
      fontWeight: "600",
      marginBottom: 16,
    },
    packsSection: { marginBottom: 16 },
    packsSectionTitle: { fontSize: 11, fontWeight: "800", color: c.textSecondary, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
    packChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.white },
    packChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    packChipText: { fontSize: 13, fontWeight: "700", color: c.textMuted },
    packChipTextActive: { color: c.white },
    aiCard: { backgroundColor: c.white, borderRadius: 18, borderWidth: 1.5, borderColor: c.primaryLight, marginBottom: 20, overflow: "hidden" },
    aiCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
    aiCardLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
    aiIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
    aiCardTitle: { fontSize: 14, fontWeight: "800", color: c.dark },
    aiCardSub: { fontSize: 11, color: c.textMuted, fontWeight: "500", marginTop: 1 },
    aiCardBody: { paddingHorizontal: 14, paddingBottom: 16, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10, backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "#fff" },
    templateRow: { flexDirection: "row", gap: 10, marginTop: 4 },
    templateBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: c.primary, backgroundColor: "transparent" },
    templateBtnActive: { backgroundColor: c.primary },
    templateBtnText: { color: c.primary, fontWeight: "800", fontSize: 13 },
    templateBtnTextActive: { color: "#fff" },
    listeningBox: { backgroundColor: isDark ? "rgba(79, 70, 229, 0.05)" : c.primaryLight, padding: 14, borderRadius: 16, marginTop: 8, marginBottom: 16, borderWidth: 1, borderColor: c.primary, borderStyle: "dashed" },
    fieldInfo: { fontSize: 11, color: c.textMuted, marginTop: 6, fontStyle: "italic" },
    stepRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    stepBadge: { width: 22, height: 22, borderRadius: 7, backgroundColor: c.primaryLight, alignItems: "center", justifyContent: "center" },
    stepNum: { fontSize: 11, fontWeight: "900", color: c.primary },
    stepLabel: { fontSize: 13, color: c.textSecondary, fontWeight: "600" },
    fieldLabel: { fontSize: 11, fontWeight: "800", color: c.textSecondary, textTransform: "uppercase", letterSpacing: 1 },
    aiInput: { backgroundColor: c.background, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontWeight: "600", color: c.dark, borderWidth: 1.5, borderColor: c.border },
    countRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
    countBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: c.background, borderWidth: 1.5, borderColor: c.border },
    countBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    countBtnText: { fontSize: 13, fontWeight: "700", color: c.textSecondary },
    countBtnTextActive: { color: c.white },
    countInput: { flex: 1, minWidth: 70, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: c.background, borderWidth: 1.5, borderColor: c.border, fontSize: 13, fontWeight: "600", color: c.dark },
    diffRow: { flexDirection: "row", gap: 6 },
    diffBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: c.background, borderWidth: 1.5, borderColor: c.border, alignItems: "center" },
    diffBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    diffBtnText: { fontSize: 12, fontWeight: "700", color: c.textSecondary },
    diffBtnTextActive: { color: c.white },
    formatBox: { backgroundColor: c.background, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: c.border, gap: 4, marginVertical: 4 },
    formatLabel: { fontSize: 10, fontWeight: "800", color: c.textMuted, textTransform: "uppercase" },
    formatCode: { fontSize: 11, color: c.dark, fontWeight: "600", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", lineHeight: 17 },
    promptActionRow: { flexDirection: "row", gap: 8, marginTop: 4 },
    copyPromptBtnSmall: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: c.primary, borderRadius: 12, paddingVertical: 13 },
    copyPromptBtnDone: { backgroundColor: c.success },
    copyPromptBtnText: { fontSize: 13, fontWeight: "900", color: c.white },
    askAiBtn: { flex: 1, borderRadius: 12, overflow: "hidden" },
    askAiGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 12 },
    askAiBtnText: { fontSize: 13, fontWeight: "900", color: "#fff" },
    stepsGuide: { backgroundColor: c.background, borderRadius: 12, padding: 12, marginTop: 10 },
    promptPreview: { backgroundColor: "#1E1E2E", borderRadius: 10, padding: 12, marginTop: 12 },
    promptPreviewLabel: { fontSize: 10, fontWeight: "800", color: "#A9B1D6", textTransform: "uppercase", marginBottom: 6 },
    promptPreviewText: { fontSize: 11, color: "#CDD6F4", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", lineHeight: 17 },
    importToggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderTopWidth: 1, borderTopColor: c.border, marginBottom: 8 },
    importToggleText: { fontSize: 14, fontWeight: "700", color: c.primary },
    importBox: { gap: 8, marginBottom: 20 },
    filePickBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.card1, borderWidth: 1.5, borderColor: c.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, borderStyle: "dashed" },
    filePickText: { fontSize: 13, fontWeight: "600", color: c.primary, flex: 1 },
    importOr: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 2 },
    importOrLine: { flex: 1, height: 1, backgroundColor: c.border },
    importOrText: { fontSize: 11, color: c.textMuted, fontWeight: "500" },
    importHint: { fontSize: 12, color: c.textMuted, fontWeight: "500", fontStyle: "italic" },
    importFormat: { fontSize: 11, color: c.textSecondary, fontWeight: "600", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
    divider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 16 },
    dividerLine: { flex: 1, height: 1, backgroundColor: c.border },
    dividerText: { fontSize: 12, color: c.textMuted, fontWeight: "600" },
    form: { gap: 14, marginBottom: 20 },
    field: { gap: 6 },
    input: { backgroundColor: c.white, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontWeight: "600", color: c.dark, borderWidth: 1, borderColor: c.border },
    optionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: c.background, borderWidth: 1.5, borderColor: c.border },
    optionRowActive: { borderColor: c.success, backgroundColor: c.successLight },
    optionBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: c.border, alignItems: "center", justifyContent: "center" },
    optionBadgeActive: { backgroundColor: c.primary },
    optionBadgeText: { fontSize: 14, fontWeight: "800", color: c.textSecondary },
    optionInput: { flex: 1, fontSize: 14, fontWeight: "600", color: c.dark, paddingVertical: 8 },
    imagePicker: { borderRadius: 16, overflow: "hidden", borderWidth: 1.5, borderColor: c.border, borderStyle: "dashed", backgroundColor: c.background },
    imagePreview: { width: "100%", height: 180, borderRadius: 14 },
    imagePlaceholder: { height: 120, alignItems: "center", justifyContent: "center", gap: 8 },
    imagePlaceholderText: { fontSize: 13, color: c.textMuted, fontWeight: "600" },
    removeImage: { alignSelf: "flex-end", marginTop: 4 },
    removeImageText: { fontSize: 12, color: c.danger, fontWeight: "700" },
    audioPickerBtn: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.primaryLight },
    audioPickerText: { fontSize: 13, fontWeight: "700", color: c.primary },
    audioPickedRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, backgroundColor: c.white, borderWidth: 1, borderColor: c.border },
    audioPickedText: { flex: 1, fontSize: 12, color: c.dark, fontWeight: "600" },
    audioHint: { fontSize: 10, color: c.textMuted, marginTop: 4 },
    existingSection: { marginTop: 8 },
    sectionTitle: { fontSize: 16, fontWeight: "900", color: c.dark, marginBottom: 12 },
    cardRow: { flexDirection: "row", alignItems: "center", backgroundColor: c.white, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.border, gap: 12 },
    cardThumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: c.background },
    cardQ: { fontSize: 14, fontWeight: "700", color: c.dark, marginBottom: 4 },
    cardA: { fontSize: 13, color: c.textSecondary, fontWeight: "500" },
    questionText: { fontSize: 14, fontWeight: "600", color: c.dark, marginBottom: 4 },
    cardActions: { flexDirection: "row", gap: 8 },
    editBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: c.primaryLight, alignItems: "center", justifyContent: "center" },
    deleteBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: c.dangerLight, alignItems: "center", justifyContent: "center" },
    modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", zIndex: 100, paddingHorizontal: 24 },
    modalCard: { backgroundColor: c.white, borderRadius: 20, padding: 20, width: "100%", gap: 10 },
    modalTitle: { fontSize: 17, fontWeight: "900", color: c.dark },
    modalSub: { fontSize: 13, color: c.textMuted, fontWeight: "500" },
    modalLabel: { fontSize: 11, fontWeight: "800", color: c.textSecondary, textTransform: "uppercase", letterSpacing: 1 },
    modalPackRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: c.background, borderWidth: 1, borderColor: c.border },
    modalPackName: { fontSize: 14, fontWeight: "700", color: c.dark },
    modalPackCount: { fontSize: 12, color: c.textMuted, fontWeight: "600" },
    modalDivider: { height: 1, backgroundColor: c.border, marginVertical: 4 },
    modalInput: { backgroundColor: c.background, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontWeight: "600", color: c.dark, borderWidth: 1.5, borderColor: c.border },
    modalCreateBtn: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
    modalCreateBtnText: { fontSize: 14, fontWeight: "900", color: c.white },
    modalCancelBtn: { alignItems: "center", paddingVertical: 8 },
    modalCancelText: { fontSize: 14, fontWeight: "700", color: c.textMuted },
    editModalCard: { backgroundColor: c.white, borderRadius: 24, padding: 20, width: "100%", elevation: 12 },
    editModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
    editModalTitle: { fontSize: 18, fontWeight: "900", color: c.dark },
    editFieldLabel: { fontSize: 11, fontWeight: "800", color: c.textSecondary, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },
    editSaveBtn: { backgroundColor: c.primary, paddingVertical: 14, borderRadius: 14, alignItems: "center", marginTop: 20 },
    editSaveText: { fontSize: 14, fontWeight: "800", color: c.white },
    fieldHint: { fontSize: 12, color: c.textMuted, marginBottom: 10 },
  });
};
