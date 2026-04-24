import { useColors } from "@/contexts/ThemeContext";
import React, { useEffect, useState, useMemo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Modal, ScrollView, ActivityIndicator, Platform, KeyboardAvoidingView, Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "@/utils/fs-compat";
import {
  getLearningPaths, getModules, getLessons, saveQuiz, generateId,
  saveStandaloneCollection, STANDALONE_COLLECTION_PREFIX,
  type LearningPath, type Module, type Lesson, type Quiz,
} from "@/utils/storage";
import {
  getApiKeys, PROVIDER_META,
  type AIKey, type AIProvider,
} from "@/utils/ai-keys";
import { callAI } from "@/utils/ai-providers";
import { shadowSm, type ColorScheme } from "@/constants/colors";
import { toast } from "@/components/Toast";

// ─── AI Prompt utils ────────────────────────────────────────────
const LANG_LABELS: Record<string, string> = {
  "Bahasa Indonesia": "Bahasa Indonesia",
  "English": "English",
  "Japanese": "Japanese (日本語)",
  "Mandarin": "Mandarin (中文)",
  "Arabic": "Arabic (العربية)",
  "French": "French (Français)",
  "German": "German (Deutsch)",
  "Korean": "Korean (한국어)",
};

const buildQuizPrompt = (topic: string, count: number, difficulty: string, language: string, customNote: string) => {
  const diffLabel = difficulty === "easy" ? "mudah (untuk pemula)" : difficulty === "hard" ? "sulit (level lanjut)" : "sedang (level menengah)";
  const langLabel = LANG_LABELS[language] ?? language;
  const noteSection = customNote.trim() ? `\nCatatan tambahan: ${customNote.trim()}` : "";
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
3. Field "correct_answer": string yang IDENTIK SAMA PERSIS dengan salah satu elemen di "options"
4. Field "explanation": string penjelasan singkat mengapa jawaban tersebut benar
5. JANGAN gunakan "A","B","C","D" sebagai nilai "correct_answer" — gunakan teks lengkap opsinya
6. Tidak ada field lain selain "question", "options", "correct_answer", "explanation"
7. Minimum ${Math.max(count, 5)} soal
8. Topik: ${topic}`;
};

const normalizeJsonText = (raw: string) =>
  raw.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
     .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
     .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, " ")
     .replace(/[\u2028\u2029]/g, "\n")
     .replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const extractJson = (text: string): string => {
  const t = normalizeJsonText(text).trim();
  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return normalizeJsonText(fenceMatch[1]).trim();
  const arrStart = t.indexOf("["), arrEnd = t.lastIndexOf("]");
  const objStart = t.indexOf("{"), objEnd = t.lastIndexOf("}");
  if (arrStart !== -1 && arrEnd !== -1 && (objStart === -1 || arrStart <= objStart)) return t.slice(arrStart, arrEnd + 1);
  if (objStart !== -1 && objEnd !== -1) return t.slice(objStart, objEnd + 1);
  return t;
};

const resolveAnswer = (item: any) => {
  const opts: string[] = (item.options ?? []).map(String);
  const answerRaw = String(item.correct_answer ?? item.answer ?? "").trim();
  let answer = answerRaw;
  if (!opts.find((o) => o === answerRaw)) {
    const letterMatch = answerRaw.match(/^([A-Da-d])[\.\):\s]/);
    if (letterMatch) {
      const idx = "abcd".indexOf(letterMatch[1].toLowerCase());
      if (idx >= 0 && opts[idx]) answer = opts[idx];
    } else {
      const partial = opts.find((o) => o.toLowerCase().includes(answerRaw.toLowerCase()) || answerRaw.toLowerCase().includes(o.toLowerCase()));
      if (partial) answer = partial;
    }
  }
  return { opts, answer };
};

// ─── Types ──────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type Tab = "manual" | "ai" | "import";
type QuizType = "multiple-choice" | "true-false";
const LETTERS = ["A", "B", "C", "D"];

// ─── PickerSheet ─────────────────────────────────────────────────
function PickerSheet<T extends { id: string }>({
  title, items, getLabel, getSub, onSelect, onClose, onBack,
}: {
  title: string; items: T[]; getLabel: (item: T) => string; getSub: (item: T) => string;
  onSelect: (item: T) => void; onClose: () => void; onBack?: () => void;
}) {
  return (
    <View style={pickerStyles.overlay}>
      <View style={pickerStyles.sheet}>
        <View style={styles.handle} />
        <View style={pickerStyles.header}>
          {onBack ? <TouchableOpacity style={pickerStyles.iconBtn} onPress={onBack}><Feather name="arrow-left" size={18} color={colors.dark} /></TouchableOpacity> : <View style={{ width: 34 }} />}
          <Text style={pickerStyles.title} numberOfLines={1}>{title}</Text>
          <TouchableOpacity style={pickerStyles.iconBtn} onPress={onClose}><Feather name="x" size={18} color={colors.dark} /></TouchableOpacity>
        </View>
        {items.length === 0 ? (
          <View style={pickerStyles.empty}><Feather name="inbox" size={32} color={colors.textMuted} /><Text style={pickerStyles.emptyText}>Tidak ada data</Text></View>
        ) : (
          <ScrollView contentContainerStyle={pickerStyles.list}>
            {items.map((item) => (
              <TouchableOpacity key={item.id} style={[pickerStyles.item, shadowSm]} onPress={() => onSelect(item)}>
                <View style={{ flex: 1 }}>
                  <Text style={pickerStyles.itemLabel}>{getLabel(item)}</Text>
                  {getSub(item) ? <Text style={pickerStyles.itemSub} numberOfLines={1}>{getSub(item)}</Text> : null}
                </View>
                <Feather name="chevron-right" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

// ─── Main Modal ──────────────────────────────────────────────────
export function QuickAddQuizModal({ visible, onClose, onSaved }: Props) {
  const colors = useColors();
  const pickerStyles = useMemo(() => makePickerStyles(colors), [colors]);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [activeTab, setActiveTab] = useState<Tab>("manual");

  // Manual form
  const [quizType, setQuizType] = useState<QuizType>("multiple-choice");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [answerIndex, setAnswerIndex] = useState<number | null>(null);
  const [tfAnswer, setTfAnswer] = useState<"Benar" | "Salah" | null>(null);
  const [explanation, setExplanation] = useState("");
  const [saving, setSaving] = useState(false);

  // Lesson picker
  const [courses, setCourses] = useState<LearningPath[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selCourse, setSelCourse] = useState<LearningPath | null>(null);
  const [selModule, setSelModule] = useState<Module | null>(null);
  const [selLesson, setSelLesson] = useState<Lesson | null>(null);
  const [pickerStep, setPickerStep] = useState<"course" | "module" | "lesson" | null>(null);

  // AI Prompt
  const [promptTopic, setPromptTopic] = useState("");
  const [promptCount, setPromptCount] = useState("10");
  const [promptDifficulty, setPromptDifficulty] = useState("medium");
  const [promptLanguage, setPromptLanguage] = useState("Bahasa Indonesia");
  const [promptCustomNote, setPromptCustomNote] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [showAISheet, setShowAISheet] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiKeys, setAiKeys] = useState<AIKey[]>([]);

  // Collection name (when saving standalone without a lesson)
  const [collectionName, setCollectionName] = useState("");

  // JSON Import
  const [importJson, setImportJson] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    reset();
    getLearningPaths().then(setCourses);
    getApiKeys().then(setAiKeys);
  }, [visible]);

  useEffect(() => {
    if (!selCourse) { setModules([]); setLessons([]); return; }
    getModules(selCourse.id).then((m) => setModules(m.sort((a, b) => a.order - b.order)));
  }, [selCourse]);

  useEffect(() => {
    if (!selModule) { setLessons([]); return; }
    getLessons(selModule.id).then((l) => setLessons(l.sort((a, b) => a.order - b.order)));
  }, [selModule]);

  const reset = () => {
    setActiveTab("manual");
    setQuizType("multiple-choice"); setQuestion(""); setOptions(["", "", "", ""]);
    setAnswerIndex(null); setTfAnswer(null); setExplanation("");
    setSelCourse(null); setSelModule(null); setSelLesson(null); setPickerStep(null);
    setCollectionName("");
    setPromptTopic(""); setPromptCount("10"); setPromptDifficulty("medium");
    setPromptLanguage("Bahasa Indonesia"); setPromptCustomNote(""); setGeneratedPrompt(""); setPromptCopied(false);
    setImportJson("");
    setShowAISheet(false); setAiLoading(false);
  };

  const handleAskAI = async (provider: AIProvider, key: AIKey) => {
    if (!promptTopic.trim()) { toast.error("Isi topik terlebih dahulu"); return; }
    const count = parseInt(promptCount) || 10;
    const prompt = buildQuizPrompt(promptTopic.trim(), count, promptDifficulty, promptLanguage, promptCustomNote);
    setGeneratedPrompt(prompt);
    setShowAISheet(false);
    setAiLoading(true);
    try {
      const { content } = await callAI(provider, prompt, key.apiKey, key.model);
      await processImport(content, true);
    } catch (e: any) {
      const msg: string = e?.message ?? "Terjadi kesalahan. Coba lagi.";
      const title = msg.toLowerCase().includes("koneksi") || msg.toLowerCase().includes("internet")
        ? "Koneksi Error"
        : msg.toLowerCase().includes("kuota") || msg.toLowerCase().includes("kredit")
        ? "Kuota Habis"
        : "AI Error";
      Alert.alert(title, msg);
    } finally { setAiLoading(false); }
  };

  const updateOption = (i: number, val: string) => setOptions((prev) => { const next = [...prev]; next[i] = val; return next; });
  const lessonLabel = selLesson ? `${selCourse?.name} › ${selModule?.name} › ${selLesson.name}` : "Pilih pelajaran tujuan";

  /** Resolve or create a lessonId for the target location */
  const resolveTargetId = async (autoName: string): Promise<string> => {
    if (selLesson) return selLesson.id;
    const colId = STANDALONE_COLLECTION_PREFIX + generateId();
    const name = collectionName.trim() || autoName;
    await saveStandaloneCollection({ id: colId, name, type: "quiz", createdAt: new Date().toISOString() });
    return colId;
  };

  const handleSave = async () => {
    if (!question.trim()) { toast.error("Pertanyaan wajib diisi"); return; }
    let finalOptions: string[] = [];
    let finalAnswer = "";
    if (quizType === "multiple-choice") {
      finalOptions = options.map((o) => o.trim()).filter(Boolean);
      if (finalOptions.length < 2) { toast.error("Minimal 2 pilihan jawaban"); return; }
      if (answerIndex === null || !options[answerIndex]?.trim()) { toast.error("Pilih jawaban yang benar"); return; }
      finalAnswer = options[answerIndex].trim();
    } else {
      finalOptions = ["Benar", "Salah"];
      if (!tfAnswer) { toast.error("Pilih Benar atau Salah"); return; }
      finalAnswer = tfAnswer;
    }
    setSaving(true);
    try {
      const lessonId = await resolveTargetId("Koleksi Soal Baru");
      const quiz: Quiz = { id: generateId(), lessonId, question: question.trim(), options: finalOptions, answer: finalAnswer, type: quizType, explanation: explanation.trim() || undefined, createdAt: new Date().toISOString() };
      await saveQuiz(quiz);
      toast.success(selLesson ? "Soal berhasil ditambahkan!" : "Soal disimpan ke koleksi baru!");
      onSaved(); onClose();
    } catch (e: any) { toast.error("Gagal menyimpan: " + (e?.message ?? "")); }
    finally { setSaving(false); }
  };

  const handleGeneratePrompt = async () => {
    if (!promptTopic.trim()) { toast.error("Isi topik terlebih dahulu"); return; }
    const count = parseInt(promptCount) || 10;
    const prompt = buildQuizPrompt(promptTopic.trim(), count, promptDifficulty, promptLanguage, promptCustomNote);
    setGeneratedPrompt(prompt);
    await Clipboard.setStringAsync(prompt);
    setPromptCopied(true);
    toast.success("Prompt disalin! Tempel ke AI favoritmu, lalu import hasilnya di tab Import JSON.");
    setTimeout(() => setPromptCopied(false), 3000);
  };

  const processImport = async (rawText: string, skipConfirm = false) => {
    setImporting(true);
    try {
      const parsed = JSON.parse(extractJson(rawText));
      let rawItems: any[] = Array.isArray(parsed) ? parsed : parsed?.items ?? parsed?.quizzes ?? (typeof parsed === "object" ? [parsed] : []);
      const valid = rawItems.filter((item) => item.question && Array.isArray(item.options) && (item.correct_answer || item.answer));
      if (valid.length === 0) {
        Alert.alert("Tidak Ada Soal Valid", 'Pastikan JSON memiliki field "question", "options" (array), dan "correct_answer".');
        setImporting(false); return;
      }
      if (!skipConfirm) {
        const dest = selLesson ? `"${selLesson.name}"` : `koleksi baru${collectionName.trim() ? ` "${collectionName.trim()}"` : ""}`;
        const ok = await new Promise<boolean>((res) => Alert.alert("Konfirmasi Import", `Import ${valid.length} soal ke ${dest}?`, [{ text: "Batal", style: "cancel", onPress: () => res(false) }, { text: "Import", onPress: () => res(true) }]));
        if (!ok) { setImporting(false); return; }
      }
      const lessonId = await resolveTargetId(`Koleksi ${valid.length} Soal`);
      for (const item of valid) {
        const { opts, answer } = resolveAnswer(item);
        if (!answer) continue;
        await saveQuiz({ id: generateId(), lessonId, question: String(item.question).trim(), options: opts, answer, explanation: item.explanation ? String(item.explanation).trim() : undefined, type: "multiple-choice", createdAt: new Date().toISOString() });
      }
      toast.success(`${valid.length} soal berhasil diimport!`);
      onSaved(); onClose();
    } catch { Alert.alert("JSON Tidak Valid", 'Gagal membaca JSON.\n\nFormat:\n[{"question":"...","options":["A","B","C","D"],"correct_answer":"A","explanation":"..."}]'); }
    finally { setImporting(false); }
  };

  const handleImportText = () => processImport(importJson);

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/plain", "*/*"], copyToCacheDirectory: true });
      if (result.canceled) return;
      const text = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
      await processImport(text);
    } catch { Alert.alert("Gagal Membaca File", "Pastikan file berformat JSON yang valid."); }
  };

  const TABS: { key: Tab; icon: string; label: string }[] = [
    { key: "manual", icon: "edit-3", label: "Manual" },
    { key: "ai", icon: "cpu", label: "AI Prompt" },
    { key: "import", icon: "download", label: "Import JSON" },
  ];
  const DIFFICULTIES = [{ key: "easy", label: "Mudah" }, { key: "medium", label: "Sedang" }, { key: "hard", label: "Sulit" }];
  const LANGUAGES = Object.keys(LANG_LABELS);
  const QUIZ_COLOR = colors.danger;
  const QUIZ_LIGHT = colors.dangerLight;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.title}>Tambah Soal Quiz</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={onClose}><Feather name="x" size={20} color={colors.dark} /></TouchableOpacity>
            </View>

            {/* ── Tabs ── */}
            <View style={styles.tabRow}>
              {TABS.map((tab) => (
                <TouchableOpacity key={tab.key} style={[styles.tab, activeTab === tab.key && { ...styles.tabActive, borderColor: QUIZ_COLOR, backgroundColor: QUIZ_LIGHT }]} onPress={() => setActiveTab(tab.key)} activeOpacity={0.8}>
                  <Feather name={tab.icon as any} size={14} color={activeTab === tab.key ? QUIZ_COLOR : colors.textMuted} />
                  <Text style={[styles.tabText, activeTab === tab.key && { color: QUIZ_COLOR }]}>{tab.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

              {/* ── Lesson Picker (shared) ── */}
              <Text style={styles.label}>Assign ke Pelajaran <Text style={styles.optional}>(opsional)</Text></Text>
              <TouchableOpacity style={[styles.pickerBtn, selLesson ? { ...styles.pickerBtnActive, borderColor: QUIZ_COLOR, backgroundColor: QUIZ_LIGHT } : null]} onPress={() => setPickerStep("course")}>
                <Feather name="book-open" size={16} color={selLesson ? QUIZ_COLOR : colors.textMuted} />
                <Text style={[styles.pickerBtnText, selLesson ? { color: QUIZ_COLOR } : null]} numberOfLines={1}>{lessonLabel}</Text>
                <Feather name="chevron-right" size={16} color={colors.textMuted} />
              </TouchableOpacity>
              {!selLesson && (
                <>
                  <View style={styles.standaloneBadge}>
                    <Feather name="folder" size={12} color={QUIZ_COLOR} />
                    <Text style={[styles.standaloneBadgeText, { color: QUIZ_COLOR }]}>Akan dibuat sebagai koleksi tersendiri</Text>
                  </View>
                  <Text style={[styles.label, { marginTop: 6 }]}>Nama Koleksi <Text style={styles.optional}>(opsional)</Text></Text>
                  <TextInput
                    style={[styles.input, { minHeight: 44 }]}
                    placeholder="Contoh: Soal Matematika, Ujian Kimia…"
                    placeholderTextColor={colors.textMuted}
                    value={collectionName}
                    onChangeText={setCollectionName}
                  />
                </>
              )}

              {/* ══════════ MANUAL TAB ══════════ */}
              {activeTab === "manual" && (
                <>
                  <Text style={[styles.label, { marginTop: 14 }]}>Tipe Soal</Text>
                  <View style={styles.typeRow}>
                    {(["multiple-choice", "true-false"] as QuizType[]).map((t) => (
                      <TouchableOpacity key={t} style={[styles.typeBtn, quizType === t && { ...styles.typeBtnActive, backgroundColor: QUIZ_COLOR, borderColor: QUIZ_COLOR }]} onPress={() => { setQuizType(t); setAnswerIndex(null); setTfAnswer(null); }}>
                        <Feather name={t === "multiple-choice" ? "list" : "toggle-right"} size={15} color={quizType === t ? "#fff" : colors.textMuted} />
                        <Text style={[styles.typeBtnText, quizType === t && styles.typeBtnTextActive]}>{t === "multiple-choice" ? "Pilihan Ganda" : "Benar / Salah"}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.label}>Pertanyaan *</Text>
                  <TextInput style={[styles.input, { minHeight: 72 }]} multiline placeholder="Tulis pertanyaan..." placeholderTextColor={colors.textMuted} value={question} onChangeText={setQuestion} textAlignVertical="top" />

                  {quizType === "multiple-choice" && (
                    <>
                      <Text style={styles.label}>Pilihan Jawaban <Text style={styles.optional}>(tap radio = jawaban benar)</Text></Text>
                      {options.map((opt, i) => (
                        <View key={i} style={styles.optRow}>
                          <TouchableOpacity style={[styles.radio, answerIndex === i && { ...styles.radioActive, backgroundColor: colors.success, borderColor: colors.success }]} onPress={() => setAnswerIndex(i)}>
                            {answerIndex === i ? <Feather name="check" size={12} color="#fff" /> : <Text style={styles.radioLetter}>{LETTERS[i]}</Text>}
                          </TouchableOpacity>
                          <TextInput style={[styles.optInput, answerIndex === i && styles.optInputActive]} placeholder={`Pilihan ${LETTERS[i]}`} placeholderTextColor={colors.textMuted} value={opt} onChangeText={(v) => updateOption(i, v)} />
                        </View>
                      ))}
                    </>
                  )}

                  {quizType === "true-false" && (
                    <>
                      <Text style={styles.label}>Jawaban yang Benar</Text>
                      <View style={styles.tfRow}>
                        {(["Benar", "Salah"] as const).map((v) => (
                          <TouchableOpacity key={v} style={[styles.tfBtn, tfAnswer === v && (v === "Benar" ? styles.tfTrue : styles.tfFalse)]} onPress={() => setTfAnswer(v)}>
                            <Feather name={v === "Benar" ? "check-circle" : "x-circle"} size={18} color={tfAnswer === v ? "#fff" : colors.textMuted} />
                            <Text style={[styles.tfBtnText, tfAnswer === v && { color: "#fff" }]}>{v}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}

                  <Text style={styles.label}>Penjelasan (opsional)</Text>
                  <TextInput style={[styles.input, { minHeight: 60 }]} multiline placeholder="Penjelasan jawaban..." placeholderTextColor={colors.textMuted} value={explanation} onChangeText={setExplanation} textAlignVertical="top" />

                  <TouchableOpacity style={[styles.saveBtn, { backgroundColor: QUIZ_COLOR }, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="check" size={18} color="#fff" />}
                    <Text style={styles.saveBtnText}>{saving ? "Menyimpan..." : "Simpan Soal"}</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* ══════════ AI PROMPT TAB ══════════ */}
              {activeTab === "ai" && (
                <>
                  <View style={[styles.aiInfoBox, { backgroundColor: QUIZ_LIGHT }]}>
                    <Feather name="cpu" size={16} color={QUIZ_COLOR} />
                    <Text style={[styles.aiInfoText, { color: QUIZ_COLOR }]}>Buat prompt untuk AI (ChatGPT, Gemini, Claude, dll), lalu tempel hasilnya di tab <Text style={{ fontWeight: "800" }}>Import JSON</Text>.</Text>
                  </View>

                  <Text style={[styles.label, { marginTop: 12 }]}>Topik / Materi *</Text>
                  <TextInput style={styles.input} placeholder="Contoh: Fotosintesis, Hukum Newton, React Hooks" placeholderTextColor={colors.textMuted} value={promptTopic} onChangeText={setPromptTopic} />

                  <Text style={styles.label}>Jumlah Soal</Text>
                  <View style={styles.countRow}>
                    {["5", "10", "15", "20", "30"].map((n) => (
                      <TouchableOpacity key={n} style={[styles.countChip, promptCount === n && { ...styles.countChipActive, borderColor: QUIZ_COLOR, backgroundColor: QUIZ_LIGHT }]} onPress={() => setPromptCount(n)}>
                        <Text style={[styles.countChipText, promptCount === n && { color: QUIZ_COLOR }]}>{n}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.label}>Tingkat Kesulitan</Text>
                  <View style={styles.diffRow}>
                    {DIFFICULTIES.map((d) => (
                      <TouchableOpacity key={d.key} style={[styles.diffChip, promptDifficulty === d.key && { ...styles.diffChipActive, borderColor: QUIZ_COLOR, backgroundColor: QUIZ_LIGHT }]} onPress={() => setPromptDifficulty(d.key)}>
                        <Text style={[styles.diffChipText, promptDifficulty === d.key && { color: QUIZ_COLOR }]}>{d.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.label}>Bahasa Output</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                    {LANGUAGES.map((lang) => (
                      <TouchableOpacity key={lang} style={[styles.langChip, promptLanguage === lang && { ...styles.langChipActive, borderColor: QUIZ_COLOR, backgroundColor: QUIZ_LIGHT }]} onPress={() => setPromptLanguage(lang)}>
                        <Text style={[styles.langChipText, promptLanguage === lang && { color: QUIZ_COLOR }]}>{lang}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <Text style={styles.label}>Catatan Tambahan (opsional)</Text>
                  <TextInput style={[styles.input, { minHeight: 60 }]} multiline placeholder="Contoh: buat soal analisis kasus, gunakan contoh Indonesia" placeholderTextColor={colors.textMuted} value={promptCustomNote} onChangeText={setPromptCustomNote} textAlignVertical="top" />

                  {/* Action buttons row */}
                  <View style={styles.aiActionRow}>
                    <TouchableOpacity
                      style={[styles.copyPromptBtn, { backgroundColor: promptCopied ? colors.success : QUIZ_COLOR }]}
                      onPress={handleGeneratePrompt}
                      activeOpacity={0.85}
                      disabled={aiLoading}
                    >
                      <Feather name={promptCopied ? "check" : "copy"} size={14} color="#fff" />
                      <Text style={styles.copyPromptBtnText}>{promptCopied ? "Tersalin!" : "Salin Prompt"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.askAiBtn}
                      onPress={() => setShowAISheet(true)}
                      activeOpacity={0.85}
                      disabled={aiLoading}
                    >
                      <LinearGradient
                        colors={[colors.success, colors.primary]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.askAiGrad}
                      >
                        {aiLoading ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Text style={{ fontSize: 13 }}>🤖</Text>
                            <Text style={styles.askAiBtnText}>Ask Your AI</Text>
                            <Text style={{ fontSize: 10, color: "#fff" }}>⚡</Text>
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>

                  {generatedPrompt.length > 0 && (
                    <View style={[styles.promptPreview, { borderLeftColor: QUIZ_COLOR }]}>
                      <Text style={styles.promptPreviewText} numberOfLines={5}>{generatedPrompt}</Text>
                    </View>
                  )}

                  {promptCopied && (
                    <TouchableOpacity style={[styles.secondaryBtn, { borderColor: QUIZ_COLOR, backgroundColor: QUIZ_LIGHT }]} onPress={() => setActiveTab("import")}>
                      <Feather name="download" size={16} color={QUIZ_COLOR} />
                      <Text style={[styles.secondaryBtnText, { color: QUIZ_COLOR }]}>Lanjut ke Import JSON →</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              {/* ══════════ IMPORT JSON TAB ══════════ */}
              {activeTab === "import" && (
                <>
                  <View style={[styles.aiInfoBox, { backgroundColor: "#F5F3FF" }]}>
                    <Feather name="download" size={16} color={colors.purple} />
                    <Text style={[styles.aiInfoText, { color: "#7C3AED" }]}>Tempel JSON hasil dari AI atau pilih file .json dari perangkatmu.</Text>
                  </View>

                  <Text style={[styles.label, { marginTop: 12 }]}>Format yang diterima:</Text>
                  <View style={styles.formatBox}>
                    <Text style={styles.formatCode}>{'[{"question":"...","options":["A","B","C","D"],"correct_answer":"A","explanation":"..."}]'}</Text>
                  </View>
                  <Text style={styles.formatHint}>Field "correct_answer" harus sama persis dengan salah satu teks di "options"</Text>

                  <Text style={[styles.label, { marginTop: 10 }]}>Tempel JSON di sini</Text>
                  <TextInput
                    style={[styles.input, { minHeight: 120, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12 }]}
                    multiline placeholder={'[{"question":"...","options":["...","...","...","..."],"correct_answer":"...","explanation":"..."}]'}
                    placeholderTextColor={colors.textMuted} value={importJson}
                    onChangeText={setImportJson} textAlignVertical="top" autoCorrect={false} autoCapitalize="none"
                  />

                  <View style={styles.importBtnRow}>
                    <TouchableOpacity style={[styles.outlineBtn, { flex: 1, borderColor: QUIZ_COLOR, backgroundColor: QUIZ_LIGHT }]} onPress={handlePickFile}>
                      <Feather name="folder" size={16} color={QUIZ_COLOR} />
                      <Text style={[styles.outlineBtnText, { color: QUIZ_COLOR }]}>Pilih File</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.saveBtn, { flex: 1, marginTop: 0, backgroundColor: QUIZ_COLOR, opacity: importing || !importJson.trim() ? 0.6 : 1 }]}
                      onPress={handleImportText} disabled={importing || !importJson.trim()}
                    >
                      {importing ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="download" size={16} color="#fff" />}
                      <Text style={styles.saveBtnText}>{importing ? "Mengimport..." : "Import"}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>

        {/* Cascade picker overlays */}
        {pickerStep === "course" && (
          <PickerSheet title="Pilih Kursus" items={courses} getLabel={(c) => c.name} getSub={(c) => c.description}
            onSelect={(c) => { setSelCourse(c); setSelModule(null); setSelLesson(null); setPickerStep("module"); }} onClose={() => setPickerStep(null)} />
        )}
        {pickerStep === "module" && selCourse && (
          <PickerSheet title={`Modul di "${selCourse.name}"`} items={modules} getLabel={(m) => m.name} getSub={(m) => m.description}
            onSelect={(m) => { setSelModule(m); setSelLesson(null); setPickerStep("lesson"); }} onClose={() => setPickerStep(null)} onBack={() => setPickerStep("course")} />
        )}
        {pickerStep === "lesson" && selModule && (
          <PickerSheet title={`Pelajaran di "${selModule.name}"`} items={lessons} getLabel={(l) => l.name} getSub={(l) => l.description}
            onSelect={(l) => { setSelLesson(l); setPickerStep(null); }} onClose={() => setPickerStep(null)} onBack={() => setPickerStep("module")} />
        )}

        {/* Inline AI Provider Picker */}
        {showAISheet && (
          <View style={styles.aiOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => { if (!aiLoading) setShowAISheet(false); }} />
            <View style={styles.aiSheet}>
              <View style={styles.handle} />
              <View style={styles.header}>
                <Text style={styles.title}>Pilih AI Provider</Text>
                <TouchableOpacity style={styles.closeBtn} onPress={() => { if (!aiLoading) setShowAISheet(false); }}>
                  <Feather name="x" size={18} color={colors.dark} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.label, { color: colors.textMuted, fontWeight: "500", marginBottom: 12 }]}>
                {aiKeys.length === 0 ? "Belum ada API key. Tambahkan di menu AI Keys." : "Pilih provider untuk generate soal otomatis."}
              </Text>
              {(["openai", "gemini"] as AIProvider[]).map((prov) => {
                const meta = PROVIDER_META[prov];
                const key = aiKeys.find((k) => k.provider === prov) ?? null;
                return (
                  <TouchableOpacity
                    key={prov}
                    style={[styles.aiProvCard, { borderColor: key ? meta.color + "50" : colors.border, opacity: key ? 1 : 0.5 }]}
                    activeOpacity={key ? 0.75 : 1}
                    onPress={() => { if (key) handleAskAI(prov, key); }}
                  >
                    <View style={[styles.aiProvIcon, { backgroundColor: meta.bg }]}>
                      <Text style={{ fontSize: 20 }}>{prov === "openai" ? "⚡" : "✨"}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "800", color: colors.dark }}>{meta.label}</Text>
                      <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: "500" }}>
                        {key ? key.model : "Belum ada key"}
                      </Text>
                    </View>
                    {key && <Feather name="chevron-right" size={18} color={meta.color} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const makeStyles = (c: ColorScheme) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92%", paddingBottom: 32 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 10 },
  title: { fontSize: 18, fontWeight: "900", color: c.dark },
  closeBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: c.background, alignItems: "center", justifyContent: "center" },
  tabRow: { flexDirection: "row", marginHorizontal: 20, marginBottom: 8, gap: 8 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.background },
  tabActive: { borderColor: c.primary, backgroundColor: c.primaryLight },
  tabText: { fontSize: 12, fontWeight: "700", color: c.textMuted },
  body: { paddingHorizontal: 20, paddingBottom: 12, gap: 6 },
  label: { fontSize: 13, fontWeight: "700", color: c.dark, marginTop: 4, marginBottom: 6 },
  optional: { fontSize: 11, fontWeight: "500", color: c.textMuted },
  pickerBtn: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderColor: c.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: c.background },
  pickerBtnActive: { borderColor: c.primary, backgroundColor: c.primaryLight },
  pickerBtnText: { flex: 1, fontSize: 13, fontWeight: "600", color: c.textMuted },
  standaloneBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.background, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: c.border, alignSelf: "flex-start" },
  standaloneBadgeText: { fontSize: 11, fontWeight: "600", color: c.textMuted },
  input: { borderWidth: 1.5, borderColor: c.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: c.dark, minHeight: 56, backgroundColor: c.background, marginBottom: 4 },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  typeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderColor: c.border, borderRadius: 12, paddingVertical: 10, backgroundColor: c.background },
  typeBtnActive: { backgroundColor: c.danger, borderColor: c.danger },
  typeBtnText: { fontSize: 13, fontWeight: "700", color: c.textMuted },
  typeBtnTextActive: { color: c.white },
  optRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  radio: { width: 30, height: 30, borderRadius: 10, borderWidth: 2, borderColor: c.border, alignItems: "center", justifyContent: "center", backgroundColor: c.background, flexShrink: 0 },
  radioActive: { backgroundColor: c.success, borderColor: c.success },
  radioLetter: { fontSize: 12, fontWeight: "800", color: c.textMuted },
  optInput: { flex: 1, borderWidth: 1.5, borderColor: c.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: c.dark, backgroundColor: c.background },
  optInputActive: { borderColor: c.success, backgroundColor: c.successLight },
  tfRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  tfBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: c.border, borderRadius: 14, paddingVertical: 14, backgroundColor: c.background },
  tfTrue: { backgroundColor: c.success, borderColor: c.success },
  tfFalse: { backgroundColor: c.danger, borderColor: c.danger },
  tfBtnText: { fontSize: 15, fontWeight: "800", color: c.textMuted },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: c.primary, borderRadius: 16, paddingVertical: 15, marginTop: 12 },
  saveBtnText: { fontSize: 15, fontWeight: "900", color: c.white },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: c.primary, borderRadius: 14, paddingVertical: 12, marginTop: 8, backgroundColor: c.primaryLight },
  secondaryBtnText: { fontSize: 14, fontWeight: "800", color: c.primary },
  aiInfoBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: c.primaryLight, borderRadius: 14, padding: 12, marginTop: 6 },
  aiInfoText: { flex: 1, fontSize: 13, fontWeight: "600", color: c.primary, lineHeight: 19 },
  countRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  countChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.background },
  countChipActive: { borderColor: c.primary, backgroundColor: c.primaryLight },
  countChipText: { fontSize: 13, fontWeight: "700", color: c.textMuted },
  diffRow: { flexDirection: "row", gap: 8 },
  diffChip: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.background, alignItems: "center" },
  diffChipActive: { borderColor: c.primary, backgroundColor: c.primaryLight },
  diffChipText: { fontSize: 13, fontWeight: "700", color: c.textMuted },
  langChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.background },
  langChipActive: { borderColor: c.primary, backgroundColor: c.primaryLight },
  langChipText: { fontSize: 12, fontWeight: "700", color: c.textMuted },
  promptPreview: { backgroundColor: c.background, borderRadius: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: c.primary, marginTop: 4 },
  promptPreviewText: { fontSize: 11, color: c.textSecondary, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", lineHeight: 17 },
  formatBox: { backgroundColor: "#F3F4F6", borderRadius: 10, padding: 10, marginBottom: 4 },
  formatCode: { fontSize: 11, color: "#374151", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  formatHint: { fontSize: 11, color: c.textMuted, fontWeight: "500", marginBottom: 4 },
  importBtnRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  outlineBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: c.primary, borderRadius: 16, paddingVertical: 15, backgroundColor: c.primaryLight },
  outlineBtnText: { fontSize: 14, fontWeight: "800", color: c.primary },
  // AI action row
  aiActionRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  copyPromptBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, paddingVertical: 13 },
  copyPromptBtnText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  askAiBtn: { flex: 1, borderRadius: 14, overflow: "hidden" },
  askAiGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 14 },
  askAiBtnText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  // Inline AI provider overlay
  aiOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end", zIndex: 20 },
  aiSheet: { backgroundColor: c.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 32 },
  aiProvCard: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1.5, borderRadius: 16, padding: 14, marginBottom: 10, backgroundColor: c.background },
  aiProvIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});

const makePickerStyles = (c: ColorScheme) => StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end", zIndex: 10 },
  sheet: { backgroundColor: c.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "75%", paddingBottom: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  iconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: c.background, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontSize: 15, fontWeight: "800", color: c.dark },
  list: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  item: { flexDirection: "row", alignItems: "center", backgroundColor: c.white, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: c.border },
  itemLabel: { fontSize: 14, fontWeight: "800", color: c.dark, marginBottom: 2 },
  itemSub: { fontSize: 12, color: c.textMuted, fontWeight: "500" },
  empty: { alignItems: "center", paddingVertical: 36, gap: 10 },
  emptyText: { fontSize: 14, color: c.textMuted, fontWeight: "600" },
});
