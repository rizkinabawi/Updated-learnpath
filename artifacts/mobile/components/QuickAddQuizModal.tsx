import React, { useEffect, useState } from "react";
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
import Colors, { shadowSm } from "@/constants/colors";
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
    <View style={ps.overlay}>
      <View style={ps.sheet}>
        <View style={s.handle} />
        <View style={ps.header}>
          {onBack ? <TouchableOpacity style={ps.iconBtn} onPress={onBack}><Feather name="arrow-left" size={18} color={Colors.dark} /></TouchableOpacity> : <View style={{ width: 34 }} />}
          <Text style={ps.title} numberOfLines={1}>{title}</Text>
          <TouchableOpacity style={ps.iconBtn} onPress={onClose}><Feather name="x" size={18} color={Colors.dark} /></TouchableOpacity>
        </View>
        {items.length === 0 ? (
          <View style={ps.empty}><Feather name="inbox" size={32} color={Colors.textMuted} /><Text style={ps.emptyText}>Tidak ada data</Text></View>
        ) : (
          <ScrollView contentContainerStyle={ps.list}>
            {items.map((item) => (
              <TouchableOpacity key={item.id} style={[ps.item, shadowSm]} onPress={() => onSelect(item)}>
                <View style={{ flex: 1 }}>
                  <Text style={ps.itemLabel}>{getLabel(item)}</Text>
                  {getSub(item) ? <Text style={ps.itemSub} numberOfLines={1}>{getSub(item)}</Text> : null}
                </View>
                <Feather name="chevron-right" size={16} color={Colors.textMuted} />
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
  const QUIZ_COLOR = Colors.danger;
  const QUIZ_LIGHT = "#FFF5F5";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <View style={s.header}>
              <Text style={s.title}>Tambah Soal Quiz</Text>
              <TouchableOpacity style={s.closeBtn} onPress={onClose}><Feather name="x" size={20} color={Colors.dark} /></TouchableOpacity>
            </View>

            {/* ── Tabs ── */}
            <View style={s.tabRow}>
              {TABS.map((tab) => (
                <TouchableOpacity key={tab.key} style={[s.tab, activeTab === tab.key && { ...s.tabActive, borderColor: QUIZ_COLOR, backgroundColor: QUIZ_LIGHT }]} onPress={() => setActiveTab(tab.key)} activeOpacity={0.8}>
                  <Feather name={tab.icon as any} size={14} color={activeTab === tab.key ? QUIZ_COLOR : Colors.textMuted} />
                  <Text style={[s.tabText, activeTab === tab.key && { color: QUIZ_COLOR }]}>{tab.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

              {/* ── Lesson Picker (shared) ── */}
              <Text style={s.label}>Assign ke Pelajaran <Text style={s.optional}>(opsional)</Text></Text>
              <TouchableOpacity style={[s.pickerBtn, selLesson ? { ...s.pickerBtnActive, borderColor: QUIZ_COLOR, backgroundColor: QUIZ_LIGHT } : null]} onPress={() => setPickerStep("course")}>
                <Feather name="book-open" size={16} color={selLesson ? QUIZ_COLOR : Colors.textMuted} />
                <Text style={[s.pickerBtnText, selLesson ? { color: QUIZ_COLOR } : null]} numberOfLines={1}>{lessonLabel}</Text>
                <Feather name="chevron-right" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
              {!selLesson && (
                <>
                  <View style={s.standaloneBadge}>
                    <Feather name="folder" size={12} color={QUIZ_COLOR} />
                    <Text style={[s.standaloneBadgeText, { color: QUIZ_COLOR }]}>Akan dibuat sebagai koleksi tersendiri</Text>
                  </View>
                  <Text style={[s.label, { marginTop: 6 }]}>Nama Koleksi <Text style={s.optional}>(opsional)</Text></Text>
                  <TextInput
                    style={[s.input, { minHeight: 44 }]}
                    placeholder="Contoh: Soal Matematika, Ujian Kimia…"
                    placeholderTextColor={Colors.textMuted}
                    value={collectionName}
                    onChangeText={setCollectionName}
                  />
                </>
              )}

              {/* ══════════ MANUAL TAB ══════════ */}
              {activeTab === "manual" && (
                <>
                  <Text style={[s.label, { marginTop: 14 }]}>Tipe Soal</Text>
                  <View style={s.typeRow}>
                    {(["multiple-choice", "true-false"] as QuizType[]).map((t) => (
                      <TouchableOpacity key={t} style={[s.typeBtn, quizType === t && { ...s.typeBtnActive, backgroundColor: QUIZ_COLOR, borderColor: QUIZ_COLOR }]} onPress={() => { setQuizType(t); setAnswerIndex(null); setTfAnswer(null); }}>
                        <Feather name={t === "multiple-choice" ? "list" : "toggle-right"} size={15} color={quizType === t ? "#fff" : Colors.textMuted} />
                        <Text style={[s.typeBtnText, quizType === t && s.typeBtnTextActive]}>{t === "multiple-choice" ? "Pilihan Ganda" : "Benar / Salah"}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={s.label}>Pertanyaan *</Text>
                  <TextInput style={[s.input, { minHeight: 72 }]} multiline placeholder="Tulis pertanyaan..." placeholderTextColor={Colors.textMuted} value={question} onChangeText={setQuestion} textAlignVertical="top" />

                  {quizType === "multiple-choice" && (
                    <>
                      <Text style={s.label}>Pilihan Jawaban <Text style={s.optional}>(tap radio = jawaban benar)</Text></Text>
                      {options.map((opt, i) => (
                        <View key={i} style={s.optRow}>
                          <TouchableOpacity style={[s.radio, answerIndex === i && { ...s.radioActive, backgroundColor: Colors.success, borderColor: Colors.success }]} onPress={() => setAnswerIndex(i)}>
                            {answerIndex === i ? <Feather name="check" size={12} color="#fff" /> : <Text style={s.radioLetter}>{LETTERS[i]}</Text>}
                          </TouchableOpacity>
                          <TextInput style={[s.optInput, answerIndex === i && s.optInputActive]} placeholder={`Pilihan ${LETTERS[i]}`} placeholderTextColor={Colors.textMuted} value={opt} onChangeText={(v) => updateOption(i, v)} />
                        </View>
                      ))}
                    </>
                  )}

                  {quizType === "true-false" && (
                    <>
                      <Text style={s.label}>Jawaban yang Benar</Text>
                      <View style={s.tfRow}>
                        {(["Benar", "Salah"] as const).map((v) => (
                          <TouchableOpacity key={v} style={[s.tfBtn, tfAnswer === v && (v === "Benar" ? s.tfTrue : s.tfFalse)]} onPress={() => setTfAnswer(v)}>
                            <Feather name={v === "Benar" ? "check-circle" : "x-circle"} size={18} color={tfAnswer === v ? "#fff" : Colors.textMuted} />
                            <Text style={[s.tfBtnText, tfAnswer === v && { color: "#fff" }]}>{v}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}

                  <Text style={s.label}>Penjelasan (opsional)</Text>
                  <TextInput style={[s.input, { minHeight: 60 }]} multiline placeholder="Penjelasan jawaban..." placeholderTextColor={Colors.textMuted} value={explanation} onChangeText={setExplanation} textAlignVertical="top" />

                  <TouchableOpacity style={[s.saveBtn, { backgroundColor: QUIZ_COLOR }, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="check" size={18} color="#fff" />}
                    <Text style={s.saveBtnText}>{saving ? "Menyimpan..." : "Simpan Soal"}</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* ══════════ AI PROMPT TAB ══════════ */}
              {activeTab === "ai" && (
                <>
                  <View style={[s.aiInfoBox, { backgroundColor: QUIZ_LIGHT }]}>
                    <Feather name="cpu" size={16} color={QUIZ_COLOR} />
                    <Text style={[s.aiInfoText, { color: QUIZ_COLOR }]}>Buat prompt untuk AI (ChatGPT, Gemini, Claude, dll), lalu tempel hasilnya di tab <Text style={{ fontWeight: "800" }}>Import JSON</Text>.</Text>
                  </View>

                  <Text style={[s.label, { marginTop: 12 }]}>Topik / Materi *</Text>
                  <TextInput style={s.input} placeholder="Contoh: Fotosintesis, Hukum Newton, React Hooks" placeholderTextColor={Colors.textMuted} value={promptTopic} onChangeText={setPromptTopic} />

                  <Text style={s.label}>Jumlah Soal</Text>
                  <View style={s.countRow}>
                    {["5", "10", "15", "20", "30"].map((n) => (
                      <TouchableOpacity key={n} style={[s.countChip, promptCount === n && { ...s.countChipActive, borderColor: QUIZ_COLOR, backgroundColor: QUIZ_LIGHT }]} onPress={() => setPromptCount(n)}>
                        <Text style={[s.countChipText, promptCount === n && { color: QUIZ_COLOR }]}>{n}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={s.label}>Tingkat Kesulitan</Text>
                  <View style={s.diffRow}>
                    {DIFFICULTIES.map((d) => (
                      <TouchableOpacity key={d.key} style={[s.diffChip, promptDifficulty === d.key && { ...s.diffChipActive, borderColor: QUIZ_COLOR, backgroundColor: QUIZ_LIGHT }]} onPress={() => setPromptDifficulty(d.key)}>
                        <Text style={[s.diffChipText, promptDifficulty === d.key && { color: QUIZ_COLOR }]}>{d.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={s.label}>Bahasa Output</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                    {LANGUAGES.map((lang) => (
                      <TouchableOpacity key={lang} style={[s.langChip, promptLanguage === lang && { ...s.langChipActive, borderColor: QUIZ_COLOR, backgroundColor: QUIZ_LIGHT }]} onPress={() => setPromptLanguage(lang)}>
                        <Text style={[s.langChipText, promptLanguage === lang && { color: QUIZ_COLOR }]}>{lang}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <Text style={s.label}>Catatan Tambahan (opsional)</Text>
                  <TextInput style={[s.input, { minHeight: 60 }]} multiline placeholder="Contoh: buat soal analisis kasus, gunakan contoh Indonesia" placeholderTextColor={Colors.textMuted} value={promptCustomNote} onChangeText={setPromptCustomNote} textAlignVertical="top" />

                  {/* Action buttons row */}
                  <View style={s.aiActionRow}>
                    <TouchableOpacity
                      style={[s.copyPromptBtn, { backgroundColor: promptCopied ? Colors.success : QUIZ_COLOR }]}
                      onPress={handleGeneratePrompt}
                      activeOpacity={0.85}
                      disabled={aiLoading}
                    >
                      <Feather name={promptCopied ? "check" : "copy"} size={14} color="#fff" />
                      <Text style={s.copyPromptBtnText}>{promptCopied ? "Tersalin!" : "Salin Prompt"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.askAiBtn}
                      onPress={() => setShowAISheet(true)}
                      activeOpacity={0.85}
                      disabled={aiLoading}
                    >
                      <LinearGradient
                        colors={["#10A37F", "#4285F4"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={s.askAiGrad}
                      >
                        {aiLoading ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Text style={{ fontSize: 13 }}>🤖</Text>
                            <Text style={s.askAiBtnText}>Ask Your AI</Text>
                            <Text style={{ fontSize: 10, color: "#fff" }}>⚡</Text>
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>

                  {generatedPrompt.length > 0 && (
                    <View style={[s.promptPreview, { borderLeftColor: QUIZ_COLOR }]}>
                      <Text style={s.promptPreviewText} numberOfLines={5}>{generatedPrompt}</Text>
                    </View>
                  )}

                  {promptCopied && (
                    <TouchableOpacity style={[s.secondaryBtn, { borderColor: QUIZ_COLOR, backgroundColor: QUIZ_LIGHT }]} onPress={() => setActiveTab("import")}>
                      <Feather name="download" size={16} color={QUIZ_COLOR} />
                      <Text style={[s.secondaryBtnText, { color: QUIZ_COLOR }]}>Lanjut ke Import JSON →</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              {/* ══════════ IMPORT JSON TAB ══════════ */}
              {activeTab === "import" && (
                <>
                  <View style={[s.aiInfoBox, { backgroundColor: "#F5F3FF" }]}>
                    <Feather name="download" size={16} color="#7C3AED" />
                    <Text style={[s.aiInfoText, { color: "#7C3AED" }]}>Tempel JSON hasil dari AI atau pilih file .json dari perangkatmu.</Text>
                  </View>

                  <Text style={[s.label, { marginTop: 12 }]}>Format yang diterima:</Text>
                  <View style={s.formatBox}>
                    <Text style={s.formatCode}>{'[{"question":"...","options":["A","B","C","D"],"correct_answer":"A","explanation":"..."}]'}</Text>
                  </View>
                  <Text style={s.formatHint}>Field "correct_answer" harus sama persis dengan salah satu teks di "options"</Text>

                  <Text style={[s.label, { marginTop: 10 }]}>Tempel JSON di sini</Text>
                  <TextInput
                    style={[s.input, { minHeight: 120, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12 }]}
                    multiline placeholder={'[{"question":"...","options":["...","...","...","..."],"correct_answer":"...","explanation":"..."}]'}
                    placeholderTextColor={Colors.textMuted} value={importJson}
                    onChangeText={setImportJson} textAlignVertical="top" autoCorrect={false} autoCapitalize="none"
                  />

                  <View style={s.importBtnRow}>
                    <TouchableOpacity style={[s.outlineBtn, { flex: 1, borderColor: QUIZ_COLOR, backgroundColor: QUIZ_LIGHT }]} onPress={handlePickFile}>
                      <Feather name="folder" size={16} color={QUIZ_COLOR} />
                      <Text style={[s.outlineBtnText, { color: QUIZ_COLOR }]}>Pilih File</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.saveBtn, { flex: 1, marginTop: 0, backgroundColor: QUIZ_COLOR, opacity: importing || !importJson.trim() ? 0.6 : 1 }]}
                      onPress={handleImportText} disabled={importing || !importJson.trim()}
                    >
                      {importing ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="download" size={16} color="#fff" />}
                      <Text style={s.saveBtnText}>{importing ? "Mengimport..." : "Import"}</Text>
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
          <View style={s.aiOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => { if (!aiLoading) setShowAISheet(false); }} />
            <View style={s.aiSheet}>
              <View style={s.handle} />
              <View style={s.header}>
                <Text style={s.title}>Pilih AI Provider</Text>
                <TouchableOpacity style={s.closeBtn} onPress={() => { if (!aiLoading) setShowAISheet(false); }}>
                  <Feather name="x" size={18} color={Colors.dark} />
                </TouchableOpacity>
              </View>
              <Text style={[s.label, { color: Colors.textMuted, fontWeight: "500", marginBottom: 12 }]}>
                {aiKeys.length === 0 ? "Belum ada API key. Tambahkan di menu AI Keys." : "Pilih provider untuk generate soal otomatis."}
              </Text>
              {(["openai", "gemini"] as AIProvider[]).map((prov) => {
                const meta = PROVIDER_META[prov];
                const key = aiKeys.find((k) => k.provider === prov) ?? null;
                return (
                  <TouchableOpacity
                    key={prov}
                    style={[s.aiProvCard, { borderColor: key ? meta.color + "50" : Colors.border, opacity: key ? 1 : 0.5 }]}
                    activeOpacity={key ? 0.75 : 1}
                    onPress={() => { if (key) handleAskAI(prov, key); }}
                  >
                    <View style={[s.aiProvIcon, { backgroundColor: meta.bg }]}>
                      <Text style={{ fontSize: 20 }}>{prov === "openai" ? "⚡" : "✨"}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "800", color: Colors.dark }}>{meta.label}</Text>
                      <Text style={{ fontSize: 11, color: Colors.textMuted, fontWeight: "500" }}>
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

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92%", paddingBottom: 32 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 10 },
  title: { fontSize: 18, fontWeight: "900", color: Colors.dark },
  closeBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" },
  tabRow: { flexDirection: "row", marginHorizontal: 20, marginBottom: 8, gap: 8 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background },
  tabActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  tabText: { fontSize: 12, fontWeight: "700", color: Colors.textMuted },
  body: { paddingHorizontal: 20, paddingBottom: 12, gap: 6 },
  label: { fontSize: 13, fontWeight: "700", color: Colors.dark, marginTop: 4, marginBottom: 6 },
  optional: { fontSize: 11, fontWeight: "500", color: Colors.textMuted },
  pickerBtn: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: Colors.background },
  pickerBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  pickerBtnText: { flex: 1, fontSize: 13, fontWeight: "600", color: Colors.textMuted },
  standaloneBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.background, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border, alignSelf: "flex-start" },
  standaloneBadgeText: { fontSize: 11, fontWeight: "600", color: Colors.textMuted },
  input: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: Colors.dark, minHeight: 56, backgroundColor: Colors.background, marginBottom: 4 },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  typeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, paddingVertical: 10, backgroundColor: Colors.background },
  typeBtnActive: { backgroundColor: Colors.danger, borderColor: Colors.danger },
  typeBtnText: { fontSize: 13, fontWeight: "700", color: Colors.textMuted },
  typeBtnTextActive: { color: "#fff" },
  optRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  radio: { width: 30, height: 30, borderRadius: 10, borderWidth: 2, borderColor: Colors.border, alignItems: "center", justifyContent: "center", backgroundColor: Colors.background, flexShrink: 0 },
  radioActive: { backgroundColor: Colors.success, borderColor: Colors.success },
  radioLetter: { fontSize: 12, fontWeight: "800", color: Colors.textMuted },
  optInput: { flex: 1, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.dark, backgroundColor: Colors.background },
  optInputActive: { borderColor: Colors.success, backgroundColor: "#F0FDF4" },
  tfRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  tfBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 14, paddingVertical: 14, backgroundColor: Colors.background },
  tfTrue: { backgroundColor: Colors.success, borderColor: Colors.success },
  tfFalse: { backgroundColor: Colors.danger, borderColor: Colors.danger },
  tfBtnText: { fontSize: 15, fontWeight: "800", color: Colors.textMuted },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: Colors.primary, borderRadius: 16, paddingVertical: 15, marginTop: 12 },
  saveBtnText: { fontSize: 15, fontWeight: "900", color: "#fff" },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 14, paddingVertical: 12, marginTop: 8, backgroundColor: Colors.primaryLight },
  secondaryBtnText: { fontSize: 14, fontWeight: "800", color: Colors.primary },
  aiInfoBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: Colors.primaryLight, borderRadius: 14, padding: 12, marginTop: 6 },
  aiInfoText: { flex: 1, fontSize: 13, fontWeight: "600", color: Colors.primary, lineHeight: 19 },
  countRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  countChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background },
  countChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  countChipText: { fontSize: 13, fontWeight: "700", color: Colors.textMuted },
  diffRow: { flexDirection: "row", gap: 8 },
  diffChip: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background, alignItems: "center" },
  diffChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  diffChipText: { fontSize: 13, fontWeight: "700", color: Colors.textMuted },
  langChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background },
  langChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  langChipText: { fontSize: 12, fontWeight: "700", color: Colors.textMuted },
  promptPreview: { backgroundColor: Colors.background, borderRadius: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: Colors.primary, marginTop: 4 },
  promptPreviewText: { fontSize: 11, color: Colors.textSecondary, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", lineHeight: 17 },
  formatBox: { backgroundColor: "#F3F4F6", borderRadius: 10, padding: 10, marginBottom: 4 },
  formatCode: { fontSize: 11, color: "#374151", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  formatHint: { fontSize: 11, color: Colors.textMuted, fontWeight: "500", marginBottom: 4 },
  importBtnRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  outlineBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 16, paddingVertical: 15, backgroundColor: Colors.primaryLight },
  outlineBtnText: { fontSize: 14, fontWeight: "800", color: Colors.primary },
  // AI action row
  aiActionRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  copyPromptBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, paddingVertical: 13 },
  copyPromptBtnText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  askAiBtn: { flex: 1, borderRadius: 14, overflow: "hidden" },
  askAiGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 14 },
  askAiBtnText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  // Inline AI provider overlay
  aiOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end", zIndex: 20 },
  aiSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 32 },
  aiProvCard: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1.5, borderRadius: 16, padding: 14, marginBottom: 10, backgroundColor: Colors.background },
  aiProvIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});

const ps = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end", zIndex: 10 },
  sheet: { backgroundColor: Colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "75%", paddingBottom: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  iconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontSize: 15, fontWeight: "800", color: Colors.dark },
  list: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  item: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.white, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: Colors.border },
  itemLabel: { fontSize: 14, fontWeight: "800", color: Colors.dark, marginBottom: 2 },
  itemSub: { fontSize: 12, color: Colors.textMuted, fontWeight: "500" },
  empty: { alignItems: "center", paddingVertical: 36, gap: 10 },
  emptyText: { fontSize: 14, color: Colors.textMuted, fontWeight: "600" },
});
