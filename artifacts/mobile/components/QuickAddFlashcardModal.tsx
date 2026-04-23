import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Modal, ScrollView, ActivityIndicator, Platform, Image, KeyboardAvoidingView, Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "@/utils/fs-compat";
import {
  getLearningPaths, getModules, getLessons, saveFlashcard, generateId,
  saveStandaloneCollection, STANDALONE_COLLECTION_PREFIX,
  type LearningPath, type Module, type Lesson, type Flashcard,
} from "@/utils/storage";
import {
  getApiKeys, PROVIDER_META,
  type AIKey, type AIProvider,
} from "@/utils/ai-keys";
import { callAI } from "@/utils/ai-providers";
import Colors, { shadowSm } from "@/constants/colors";
import { toast } from "@/components/Toast";

const IMAGE_DIR = (FileSystem.documentDirectory ?? "") + "flashcard-images/";

const ensureDir = async () => {
  if ((Platform.OS as string) === "web") return;
  const info = await FileSystem.getInfoAsync(IMAGE_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(IMAGE_DIR, { intermediates: true });
};

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

const buildFlashcardPrompt = (topic: string, count: number, difficulty: string, language: string, customNote: string) => {
  const diffLabel = difficulty === "easy" ? "mudah (untuk pemula)" : difficulty === "hard" ? "sulit (level lanjut)" : "sedang (level menengah)";
  const langLabel = LANG_LABELS[language] ?? language;
  const noteSection = customNote.trim() ? `\nCatatan tambahan: ${customNote.trim()}` : "";
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
3. Field "tag": string kata kunci singkat tanpa spasi (gunakan tanda hubung jika perlu)
4. Tidak ada field lain selain "question", "answer", "tag"
5. Jawaban harus informatif dan edukatif, bukan sekadar satu kata
6. Minimum ${Math.max(count, 3)} kartu
7. Topik: ${topic}`;
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

// ─── Types ──────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type Tab = "manual" | "ai" | "import";

// ─── PickerSheet (reusable cascade) ─────────────────────────────
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
export function QuickAddFlashcardModal({ visible, onClose, onSaved }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("manual");

  // Manual form
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [tag, setTag] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
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
    setQuestion(""); setAnswer(""); setTag(""); setImageUri(null);
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
    const prompt = buildFlashcardPrompt(promptTopic.trim(), count, promptDifficulty, promptLanguage, promptCustomNote);
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

  /** Resolve or create a lessonId for the target location */
  const resolveTargetId = async (autoName: string): Promise<string> => {
    if (selLesson) return selLesson.id;
    const colId = STANDALONE_COLLECTION_PREFIX + generateId();
    const name = collectionName.trim() || autoName;
    await saveStandaloneCollection({ id: colId, name, type: "flashcard", createdAt: new Date().toISOString() });
    return colId;
  };

  const pickImage = async () => {
    if ((Platform.OS as string) !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { toast.error("Izinkan akses galeri"); return; }
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, quality: 0.8 });
    if (!r.canceled && r.assets[0]) setImageUri(r.assets[0].uri);
  };

  const handleSave = async () => {
    if (!question.trim() || !answer.trim()) { toast.error("Pertanyaan dan jawaban wajib diisi"); return; }
    setSaving(true);
    try {
      const id = generateId();
      let savedImage: string | undefined;
      if (imageUri && (Platform.OS as string) !== "web") {
        try { await ensureDir(); const ext = imageUri.split(".").pop()?.split("?")[0] ?? "jpg"; const dest = IMAGE_DIR + id + "." + ext; await FileSystem.copyAsync({ from: imageUri, to: dest }); savedImage = dest; }
        catch { savedImage = imageUri; }
      } else if (imageUri) { savedImage = imageUri; }
      const lessonId = await resolveTargetId("Koleksi Flashcard Baru");
      const card: Flashcard = { id, lessonId, question: question.trim(), answer: answer.trim(), tag: tag.trim(), image: savedImage, createdAt: new Date().toISOString() };
      await saveFlashcard(card);
      toast.success(selLesson ? "Flashcard berhasil ditambahkan!" : "Flashcard disimpan ke koleksi baru!");
      onSaved(); onClose();
    } catch (e: any) { toast.error("Gagal menyimpan: " + (e?.message ?? "")); }
    finally { setSaving(false); }
  };

  const handleGeneratePrompt = async () => {
    if (!promptTopic.trim()) { toast.error("Isi topik terlebih dahulu"); return; }
    const count = parseInt(promptCount) || 10;
    const prompt = buildFlashcardPrompt(promptTopic.trim(), count, promptDifficulty, promptLanguage, promptCustomNote);
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
      let rawItems: any[] = Array.isArray(parsed) ? parsed : parsed?.items ?? parsed?.flashcards ?? (typeof parsed === "object" ? [parsed] : []);
      const valid = rawItems.filter((item) => (item.question ?? item.front ?? item.pertanyaan) && (item.answer ?? item.back ?? item.jawaban));
      if (valid.length === 0) { Alert.alert("Tidak Ada Data Valid", "Pastikan JSON memiliki field \"question\" dan \"answer\"."); setImporting(false); return; }
      if (!skipConfirm) {
        const dest = selLesson ? `"${selLesson.name}"` : `koleksi baru${collectionName.trim() ? ` "${collectionName.trim()}"` : ""}`;
        const ok = await new Promise<boolean>((res) => Alert.alert("Konfirmasi Import", `Import ${valid.length} flashcard ke ${dest}?`, [{ text: "Batal", style: "cancel", onPress: () => res(false) }, { text: "Import", onPress: () => res(true) }]));
        if (!ok) { setImporting(false); return; }
      }
      const lessonId = await resolveTargetId(`Koleksi ${valid.length} Flashcard`);
      for (const item of valid) {
        const q = String(item.question ?? item.front ?? item.pertanyaan ?? "").trim();
        const a = String(item.answer ?? item.back ?? item.jawaban ?? "").trim();
        const tg = String(item.tag ?? item.kategori ?? "").trim();
        if (!q) continue;
        await saveFlashcard({ id: generateId(), lessonId, question: q, answer: a, tag: tg, createdAt: new Date().toISOString() });
      }
      toast.success(`${valid.length} flashcard berhasil diimport!`);
      onSaved(); onClose();
    } catch { Alert.alert("JSON Tidak Valid", "Gagal membaca JSON. Pastikan format sudah benar.\n\nContoh:\n[{\"question\":\"...\",\"answer\":\"...\",\"tag\":\"...\"}]"); }
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

  const lessonLabel = selLesson ? `${selCourse?.name} › ${selModule?.name} › ${selLesson.name}` : "Pilih pelajaran tujuan";
  const TABS: { key: Tab; icon: string; label: string }[] = [
    { key: "manual", icon: "edit-3", label: "Manual" },
    { key: "ai", icon: "cpu", label: "AI Prompt" },
    { key: "import", icon: "download", label: "Import JSON" },
  ];
  const DIFFICULTIES = [{ key: "easy", label: "Mudah" }, { key: "medium", label: "Sedang" }, { key: "hard", label: "Sulit" }];
  const LANGUAGES = Object.keys(LANG_LABELS);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <View style={s.header}>
              <Text style={s.title}>Tambah Flashcard</Text>
              <TouchableOpacity style={s.closeBtn} onPress={onClose}><Feather name="x" size={20} color={Colors.dark} /></TouchableOpacity>
            </View>

            {/* ── Tabs ── */}
            <View style={s.tabRow}>
              {TABS.map((tab) => (
                <TouchableOpacity key={tab.key} style={[s.tab, activeTab === tab.key && s.tabActive]} onPress={() => setActiveTab(tab.key)} activeOpacity={0.8}>
                  <Feather name={tab.icon as any} size={14} color={activeTab === tab.key ? Colors.primary : Colors.textMuted} />
                  <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>{tab.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

              {/* ── Lesson Picker (shared across all tabs) ── */}
              <Text style={s.label}>Assign ke Pelajaran <Text style={s.optional}>(opsional)</Text></Text>
              <TouchableOpacity style={[s.pickerBtn, selLesson ? s.pickerBtnActive : null]} onPress={() => setPickerStep("course")}>
                <Feather name="book-open" size={16} color={selLesson ? Colors.primary : Colors.textMuted} />
                <Text style={[s.pickerBtnText, selLesson ? { color: Colors.primary } : null]} numberOfLines={1}>{lessonLabel}</Text>
                <Feather name="chevron-right" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
              {!selLesson && (
                <>
                  <View style={s.standaloneBadge}>
                    <Feather name="folder" size={12} color="#10B981" />
                    <Text style={[s.standaloneBadgeText, { color: "#10B981" }]}>Akan dibuat sebagai koleksi tersendiri</Text>
                  </View>
                  <Text style={[s.label, { marginTop: 6 }]}>Nama Koleksi <Text style={s.optional}>(opsional)</Text></Text>
                  <TextInput
                    style={[s.input, { minHeight: 44 }]}
                    placeholder="Contoh: Kartu Bahasa Inggris, Biologi Sel…"
                    placeholderTextColor={Colors.textMuted}
                    value={collectionName}
                    onChangeText={setCollectionName}
                  />
                </>
              )}

              {/* ══════════ MANUAL TAB ══════════ */}
              {activeTab === "manual" && (
                <>
                  <Text style={[s.label, { marginTop: 14 }]}>Pertanyaan / Depan Kartu *</Text>
                  <TextInput style={s.input} multiline placeholder="Tulis pertanyaan..." placeholderTextColor={Colors.textMuted} value={question} onChangeText={setQuestion} textAlignVertical="top" />
                  <Text style={s.label}>Jawaban / Belakang Kartu *</Text>
                  <TextInput style={[s.input, { minHeight: 80 }]} multiline placeholder="Tulis jawaban..." placeholderTextColor={Colors.textMuted} value={answer} onChangeText={setAnswer} textAlignVertical="top" />
                  <Text style={s.label}>Tag (opsional)</Text>
                  <TextInput style={[s.input, { minHeight: 44 }]} placeholder="contoh: biologi-sel" placeholderTextColor={Colors.textMuted} value={tag} onChangeText={setTag} />
                  <TouchableOpacity style={s.imgBtn} onPress={pickImage}>
                    <Feather name="image" size={16} color={Colors.primary} />
                    <Text style={s.imgBtnText}>{imageUri ? "Ganti Gambar" : "Tambah Gambar (opsional)"}</Text>
                  </TouchableOpacity>
                  {imageUri ? (
                    <View style={s.imgPreviewWrap}>
                      <Image source={{ uri: imageUri }} style={s.imgPreview} resizeMode="cover" />
                      <TouchableOpacity style={s.imgRemove} onPress={() => setImageUri(null)}><Feather name="x" size={14} color="#fff" /></TouchableOpacity>
                    </View>
                  ) : null}
                  <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="check" size={18} color="#fff" />}
                    <Text style={s.saveBtnText}>{saving ? "Menyimpan..." : "Simpan Flashcard"}</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* ══════════ AI PROMPT TAB ══════════ */}
              {activeTab === "ai" && (
                <>
                  <View style={s.aiInfoBox}>
                    <Feather name="cpu" size={16} color={Colors.primary} />
                    <Text style={s.aiInfoText}>Buat prompt untuk AI (ChatGPT, Gemini, Claude, dll), lalu tempel hasilnya di tab <Text style={{ fontWeight: "800" }}>Import JSON</Text>.</Text>
                  </View>

                  <Text style={[s.label, { marginTop: 12 }]}>Topik / Materi *</Text>
                  <TextInput style={s.input} placeholder="Contoh: Fotosintesis, Hukum Newton, React Hooks" placeholderTextColor={Colors.textMuted} value={promptTopic} onChangeText={setPromptTopic} />

                  <Text style={s.label}>Jumlah Kartu</Text>
                  <View style={s.countRow}>
                    {["5", "10", "15", "20", "30"].map((n) => (
                      <TouchableOpacity key={n} style={[s.countChip, promptCount === n && s.countChipActive]} onPress={() => setPromptCount(n)}>
                        <Text style={[s.countChipText, promptCount === n && s.countChipTextActive]}>{n}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={s.label}>Tingkat Kesulitan</Text>
                  <View style={s.diffRow}>
                    {DIFFICULTIES.map((d) => (
                      <TouchableOpacity key={d.key} style={[s.diffChip, promptDifficulty === d.key && s.diffChipActive]} onPress={() => setPromptDifficulty(d.key)}>
                        <Text style={[s.diffChipText, promptDifficulty === d.key && s.diffChipTextActive]}>{d.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={s.label}>Bahasa Output</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                    {LANGUAGES.map((lang) => (
                      <TouchableOpacity key={lang} style={[s.langChip, promptLanguage === lang && s.langChipActive]} onPress={() => setPromptLanguage(lang)}>
                        <Text style={[s.langChipText, promptLanguage === lang && s.langChipTextActive]}>{lang}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <Text style={s.label}>Catatan Tambahan (opsional)</Text>
                  <TextInput style={[s.input, { minHeight: 60 }]} multiline placeholder="Contoh: fokus pada reaksi kimia, gunakan contoh sehari-hari" placeholderTextColor={Colors.textMuted} value={promptCustomNote} onChangeText={setPromptCustomNote} textAlignVertical="top" />

                  {/* Action buttons row */}
                  <View style={s.aiActionRow}>
                    <TouchableOpacity
                      style={[s.copyPromptBtn, promptCopied && { backgroundColor: Colors.success }]}
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
                    <View style={s.promptPreview}>
                      <Text style={s.promptPreviewText} numberOfLines={5}>{generatedPrompt}</Text>
                    </View>
                  )}

                  {promptCopied && (
                    <TouchableOpacity style={[s.secondaryBtn]} onPress={() => setActiveTab("import")}>
                      <Feather name="download" size={16} color={Colors.primary} />
                      <Text style={s.secondaryBtnText}>Lanjut ke Import JSON →</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              {/* ══════════ IMPORT JSON TAB ══════════ */}
              {activeTab === "import" && (
                <>
                  <View style={s.aiInfoBox}>
                    <Feather name="download" size={16} color="#7C3AED" />
                    <Text style={[s.aiInfoText, { color: "#7C3AED" }]}>Tempel JSON hasil dari AI atau pilih file .json dari perangkatmu.</Text>
                  </View>

                  <Text style={[s.label, { marginTop: 12 }]}>Format yang diterima:</Text>
                  <View style={s.formatBox}>
                    <Text style={s.formatCode}>{'[{"question":"...","answer":"...","tag":"..."}]'}</Text>
                  </View>
                  <Text style={s.formatHint}>Field alternatif: "front"/"back", "pertanyaan"/"jawaban"</Text>

                  <Text style={[s.label, { marginTop: 10 }]}>Tempel JSON di sini</Text>
                  <TextInput
                    style={[s.input, { minHeight: 120, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12 }]}
                    multiline placeholder={'[{"question":"...","answer":"...","tag":"..."}]'}
                    placeholderTextColor={Colors.textMuted} value={importJson}
                    onChangeText={setImportJson} textAlignVertical="top" autoCorrect={false} autoCapitalize="none"
                  />

                  <View style={s.importBtnRow}>
                    <TouchableOpacity style={[s.outlineBtn, { flex: 1 }]} onPress={handlePickFile}>
                      <Feather name="folder" size={16} color={Colors.primary} />
                      <Text style={s.outlineBtnText}>Pilih File</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.saveBtn, { flex: 1, marginTop: 0, opacity: importing || !importJson.trim() ? 0.6 : 1 }]}
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
                {aiKeys.length === 0 ? "Belum ada API key. Tambahkan di menu AI Keys." : "Pilih provider untuk generate flashcard otomatis."}
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
  tabTextActive: { color: Colors.primary },
  body: { paddingHorizontal: 20, paddingBottom: 12, gap: 6 },
  label: { fontSize: 13, fontWeight: "700", color: Colors.dark, marginTop: 4, marginBottom: 6 },
  optional: { fontSize: 11, fontWeight: "500", color: Colors.textMuted },
  pickerBtn: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: Colors.background },
  pickerBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  pickerBtnText: { flex: 1, fontSize: 13, fontWeight: "600", color: Colors.textMuted },
  standaloneBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.background, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border, alignSelf: "flex-start" },
  standaloneBadgeText: { fontSize: 11, fontWeight: "600", color: Colors.textMuted },
  input: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: Colors.dark, minHeight: 56, backgroundColor: Colors.background, marginBottom: 4 },
  imgBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1.5, borderColor: Colors.primaryLight, borderRadius: 12, backgroundColor: Colors.primaryLight, marginTop: 4, marginBottom: 4 },
  imgBtnText: { fontSize: 13, fontWeight: "700", color: Colors.primary },
  imgPreviewWrap: { position: "relative", alignSelf: "flex-start", marginBottom: 4 },
  imgPreview: { width: 100, height: 75, borderRadius: 10 },
  imgRemove: { position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 10, padding: 3 },
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
  countChipTextActive: { color: Colors.primary },
  diffRow: { flexDirection: "row", gap: 8 },
  diffChip: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background, alignItems: "center" },
  diffChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  diffChipText: { fontSize: 13, fontWeight: "700", color: Colors.textMuted },
  diffChipTextActive: { color: Colors.primary },
  langChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background },
  langChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  langChipText: { fontSize: 12, fontWeight: "700", color: Colors.textMuted },
  langChipTextActive: { color: Colors.primary },
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
  copyPromptBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 13 },
  copyPromptBtnText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  askAiBtn: { flex: 1, borderRadius: 14, overflow: "hidden" },
  askAiGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 14 },
  askAiBtnText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  // Inline AI provider overlay (inside modal, no nested Modal)
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
