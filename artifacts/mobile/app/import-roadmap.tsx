import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import {
  X, ChevronDown, ChevronUp, Bot, Copy, Check,
  Download, AlertCircle, CheckCircle2, Layers,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "@/utils/fs-compat";
import {
  saveLearningPath, saveModule, saveLesson,
  saveFlashcardPack, saveQuizPack, saveStudyMaterial,
  generateId,
  type LearningPath, type Module, type Lesson,
  type FlashcardPack, type QuizPack, type StudyMaterial,
} from "@/utils/storage";
import Colors from "@/constants/colors";
import { toast } from "@/components/Toast";
import { AIProviderSheet } from "@/components/AIProviderSheet";
import { callAI } from "@/utils/ai-providers";
import type { AIKey, AIProvider } from "@/utils/ai-keys";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoadmapContent {
  title: string;
  type: "text" | "code" | "video" | "image";
  value: string;
}

interface RoadmapLesson {
  lesson_name: string;
  lesson_description?: string;
  lesson_order?: number;
  type?: "video" | "article" | "quiz" | "flashcard" | "project" | string;
  contents?: RoadmapContent[];
}

interface RoadmapModule {
  module_name: string;
  module_description?: string;
  module_order?: number;
  lessons?: RoadmapLesson[];
}

interface RoadmapJson {
  course_name: string;
  course_description?: string;
  course_slug?: string;
  tags?: string[];
  modules: RoadmapModule[];
}

// ─── Preview types ───────────────────────────────────────────────────────────

interface PreviewData {
  courseName: string;
  courseDesc: string;
  tags: string[];
  modules: Array<{
    name: string;
    order: number;
    lessons: Array<{
      name: string;
      order: number;
      type: string;
      contentCount: number;
    }>;
  }>;
  totalModules: number;
  totalLessons: number;
  totalMaterials: number;
  totalPacks: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strip invisible/control characters and normalize line endings */
const cleanInvisible = (s: string): string =>
  s
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, " ")
    .replace(/[\u2028\u2029]/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

/** Try JSON.parse; return null on failure */
const tryParse = (s: string): any => {
  try { return JSON.parse(s); } catch { return null; }
};

/**
 * Robustly repair & parse AI-generated JSON.
 * Tries multiple strategies in order:
 *   1. As-is (after stripping invisible chars + code fences)
 *   2. Smart/curly quotes → escaped \" (AI uses them for code snippets inside strings)
 *   3. Smart/curly quotes → straight " (structural quotes fallback)
 */
const repairAndParse = (raw: string): any => {
  let s = cleanInvisible(raw).trim();

  // Strip markdown code fences
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = cleanInvisible(fence[1]).trim();

  // Extract outer JSON object/array
  const extractOuter = (src: string): string => {
    const obj = src.indexOf("{");
    const arr = src.indexOf("[");
    const objE = src.lastIndexOf("}");
    const arrE = src.lastIndexOf("]");
    if (obj !== -1 && objE !== -1 && (arr === -1 || obj <= arr)) return src.slice(obj, objE + 1);
    if (arr !== -1 && arrE !== -1) return src.slice(arr, arrE + 1);
    return src;
  };

  const core = extractOuter(s);

  // Strategy 1: as-is
  let result = tryParse(core);
  if (result) return result;

  // Strategy 2: curly double quotes → escaped \" (for code/content inside strings)
  const escaped = core.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '\\"');
  result = tryParse(escaped);
  if (result) return result;

  // Strategy 3: curly double quotes → straight " (structural quotes)
  const normalized = core.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"');
  result = tryParse(normalized);
  if (result) return result;

  // Strategy 4: also normalize smart single quotes
  const fullNorm = normalized.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
  return tryParse(fullNorm);
};

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const isYoutubeUrl = (url: string) =>
  /youtube\.com|youtu\.be/i.test(url);

const buildPrompt = (subject: string, modules: string, level: string, lang: string, note: string) => {
  const moduleCount = parseInt(modules) || 3;
  return `Kamu adalah AI builder untuk sistem course management. Buat struktur kursus berformat JSON berdasarkan topik berikut.

Topik: ${subject}
Jumlah modul: ${moduleCount}
Level: ${level}
Bahasa: ${lang}${note ? `\nCatatan: ${note}` : ""}

Format JSON WAJIB persis seperti ini (tidak boleh ada teks tambahan):

{
  "course_name": "string",
  "course_description": "string (1-2 kalimat)",
  "tags": ["tag1", "tag2", "tag3"],
  "modules": [
    {
      "module_name": "string",
      "module_description": "string",
      "module_order": 1,
      "lessons": [
        {
          "lesson_name": "string",
          "lesson_description": "string",
          "lesson_order": 1,
          "type": "article | video | quiz | flashcard | project",
          "contents": [
            {
              "title": "string",
              "type": "text | code | video",
              "value": "string (isi konten atau URL YouTube)"
            }
          ]
        }
      ]
    }
  ]
}

Rules:
- Output HARUS JSON valid, tidak boleh ada teks di luar JSON
- Buat ${moduleCount} modul, masing-masing 2-4 pelajaran
- Setiap pelajaran wajib punya minimal 1 content
- Untuk type "video" pada contents, value harus berupa URL YouTube yang relevan
- Untuk type "quiz" atau "flashcard" pada lesson type, tetap sertakan contents sebagai ringkasan materi (type text)
- Semua teks dalam ${lang}`;
};

// ─── Main Component ───────────────────────────────────────────────────────────

const LEVELS = [
  { key: "pemula", label: "Pemula 🌱" },
  { key: "menengah", label: "Menengah ⚡" },
  { key: "mahir", label: "Mahir 🔥" },
];

const LANGS: Record<string, string> = {
  "Bahasa Indonesia": "Bahasa Indonesia",
  "English": "English",
  "Japanese": "Japanese (日本語)",
  "Mandarin": "Mandarin (中文)",
};

const MODULE_COUNTS = ["2", "3", "4", "5", "6"];

export default function ImportRoadmapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Prompt builder state
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptSubject, setPromptSubject] = useState("");
  const [promptModules, setPromptModules] = useState("3");
  const [promptLevel, setPromptLevel] = useState("pemula");
  const [promptLang, setPromptLang] = useState("Bahasa Indonesia");
  const [promptNote, setPromptNote] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");

  // Import state
  const [showImport, setShowImport] = useState(true);
  const [jsonText, setJsonText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  // Preview state
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAISheet, setShowAISheet] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // ── Prompt builder ──────────────────────────────────────────────────────────
  const handleGeneratePrompt = async () => {
    if (!promptSubject.trim()) {
      toast.error("Isi topik kursus terlebih dahulu.");
      return;
    }
    const prompt = buildPrompt(promptSubject.trim(), promptModules, promptLevel, promptLang, promptNote.trim());
    setGeneratedPrompt(prompt);
    await Clipboard.setStringAsync(prompt);
    setPromptCopied(true);
    toast.success("Prompt disalin! Tempel ke ChatGPT / Gemini / Claude.");
    setTimeout(() => setPromptCopied(false), 3000);
  };

  const handleAskAI = async (provider: AIProvider, key: AIKey) => {
    if (!generatedPrompt) return;
    setAiLoading(true);
    try {
      const { content } = await callAI(provider, generatedPrompt, key.apiKey, key.model);
      setJsonText(content);
      setParseError(null);
      setPreview(null);
      setShowImport(true);
      setShowAISheet(false);
      toast.success("Respon AI berhasil dimuat! Tap Analisa untuk melihat preview.");
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

  // ── JSON parse ──────────────────────────────────────────────────────────────
  const parseRoadmap = (raw: string): RoadmapJson | null => {
    try {
      const parsed = repairAndParse(raw);
      if (!parsed) throw new Error("JSON tidak dapat dibaca. Pastikan output AI berformat JSON valid.");

      // Support single course or array of courses (take first if array)
      const data: RoadmapJson = Array.isArray(parsed) ? parsed[0] : parsed;

      if (!data?.course_name) throw new Error("Field 'course_name' tidak ditemukan dalam JSON.");
      if (!Array.isArray(data.modules) || data.modules.length === 0) {
        throw new Error("Field 'modules' kosong atau tidak ditemukan.");
      }
      return data;
    } catch (e: any) {
      setParseError(e?.message ?? "JSON tidak valid.");
      return null;
    }
  };

  const handleParsePreview = () => {
    setParseError(null);
    setPreview(null);
    if (!jsonText.trim()) {
      setParseError("Tempel JSON dari AI terlebih dahulu.");
      return;
    }
    const data = parseRoadmap(jsonText);
    if (!data) return;

    let totalLessons = 0;
    let totalMaterials = 0;
    let totalPacks = 0;

    const modules = (data.modules ?? []).map((m, mi) => {
      const lessons = (m.lessons ?? []).map((l, li) => {
        totalLessons++;
        const cCount = (l.contents ?? []).filter(
          (c) => c.type !== "image" && c.value?.trim()
        ).length;
        totalMaterials += cCount;
        if (l.type === "quiz" || l.type === "flashcard") totalPacks++;
        return {
          name: l.lesson_name,
          order: l.lesson_order ?? li + 1,
          type: l.type ?? "article",
          contentCount: cCount,
        };
      });
      return {
        name: m.module_name,
        order: m.module_order ?? mi + 1,
        lessons,
      };
    });

    setPreview({
      courseName: data.course_name,
      courseDesc: data.course_description ?? "",
      tags: data.tags ?? [],
      modules,
      totalModules: modules.length,
      totalLessons,
      totalMaterials,
      totalPacks,
    });
    setShowImport(false);
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/plain", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const text = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      setJsonText(text);
      toast.info("File dimuat. Tap Analisa untuk melihat preview.");
    } catch {
      toast.error("Gagal membaca file.");
    }
  };

  // ── Save to storage ─────────────────────────────────────────────────────────
  const doSave = async () => {
    setSaving(true);
    try {
      const data = parseRoadmap(jsonText);
      if (!data) throw new Error("Gagal parsing ulang JSON.");

      const now = new Date().toISOString();

      // 1. Create LearningPath
      const pathId = generateId();
      const path: LearningPath = {
        id: pathId,
        name: data.course_name,
        description: data.course_description ?? "",
        userId: "local",
        tags: data.tags ?? [],
        createdAt: now,
      };
      await saveLearningPath(path);

      // 2. Create Modules + Lessons + Content
      for (let mi = 0; mi < (data.modules ?? []).length; mi++) {
        const rawMod = data.modules[mi];
        const moduleId = generateId();
        const mod: Module = {
          id: moduleId,
          name: rawMod.module_name,
          description: rawMod.module_description ?? "",
          pathId,
          order: rawMod.module_order ?? mi + 1,
          createdAt: now,
        };
        await saveModule(mod);

        for (let li = 0; li < (rawMod.lessons ?? []).length; li++) {
          const rawLesson = rawMod.lessons![li];
          const lessonId = generateId();
          const lesson: Lesson = {
            id: lessonId,
            name: rawLesson.lesson_name,
            description: rawLesson.lesson_description ?? "",
            moduleId,
            order: rawLesson.lesson_order ?? li + 1,
            notes: rawLesson.type ? `Tipe: ${rawLesson.type}` : undefined,
            createdAt: now,
          };
          await saveLesson(lesson);

          // Auto-create FlashcardPack / QuizPack based on lesson type
          if (rawLesson.type === "flashcard") {
            const pack: FlashcardPack = {
              id: generateId(),
              lessonId,
              name: rawLesson.lesson_name,
              createdAt: now,
            };
            await saveFlashcardPack(pack);
          } else if (rawLesson.type === "quiz") {
            const pack: QuizPack = {
              id: generateId(),
              lessonId,
              name: rawLesson.lesson_name,
              createdAt: now,
            };
            await saveQuizPack(pack);
          }

          // Create StudyMaterials from contents
          for (const content of rawLesson.contents ?? []) {
            if (!content.value?.trim()) continue;
            if (content.type === "image") continue; // skip — no local path

            let mat: StudyMaterial | null = null;

            if (content.type === "video" && isYoutubeUrl(content.value)) {
              mat = {
                id: generateId(),
                lessonId,
                title: content.title || "Video",
                type: "youtube",
                content: "",
                videoUrl: content.value.trim(),
                createdAt: now,
              };
            } else if (content.type === "video") {
              // non-YouTube video → save as text link
              mat = {
                id: generateId(),
                lessonId,
                title: content.title || "Video",
                type: "text",
                content: `Video: ${content.value.trim()}`,
                createdAt: now,
              };
            } else if (content.type === "code") {
              mat = {
                id: generateId(),
                lessonId,
                title: content.title || "Kode",
                type: "html",
                content: "```\n" + content.value.trim() + "\n```",
                createdAt: now,
              };
            } else {
              // text
              mat = {
                id: generateId(),
                lessonId,
                title: content.title || "Materi",
                type: "text",
                content: content.value.trim(),
                createdAt: now,
              };
            }

            if (mat) await saveStudyMaterial(mat);
          }
        }
      }

      toast.success(
        `Berhasil! "${data.course_name}" dibuat dengan ${preview!.totalModules} modul & ${preview!.totalLessons} pelajaran.`
      );
      router.back();
    } catch (e: any) {
      console.warn("[ImportRoadmap] save error", e);
      toast.error(`Gagal menyimpan: ${e?.message ?? "Coba lagi."}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!preview || saving) return;
    Alert.alert(
      "Buat Struktur Kursus?",
      `Akan dibuat:\n• 1 kursus: "${preview.courseName}"\n• ${preview.totalModules} modul\n• ${preview.totalLessons} pelajaran\n• ${preview.totalMaterials} materi\n\nLanjutkan?`,
      [
        { text: "Batal", style: "cancel" },
        { text: "Buat Sekarang", style: "default", onPress: doSave },
      ]
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <KeyboardAwareScrollViewCompat
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: Platform.OS === "web" ? 80 : insets.top + 16, paddingBottom: 60 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Import Roadmap</Text>
          <Text style={styles.headerSub}>Buat struktur kursus otomatis dari JSON</Text>
        </View>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <X size={20} color={Colors.dark} />
        </TouchableOpacity>
      </View>

      {/* ── AI Prompt Builder ── */}
      <View style={styles.aiCard}>
        <TouchableOpacity
          style={styles.aiCardHeader}
          onPress={() => setShowPrompt((v) => !v)}
          activeOpacity={0.8}
        >
          <View style={styles.aiCardLeft}>
            <View style={styles.aiIcon}>
              <Bot size={18} color="#fff" />
            </View>
            <View>
              <Text style={styles.aiCardTitle}>AI Prompt Builder</Text>
              <Text style={styles.aiCardSub}>Generate prompt → salin ke AI → tempel di bawah</Text>
            </View>
          </View>
          {showPrompt
            ? <ChevronUp size={18} color={Colors.textMuted} />
            : <ChevronDown size={18} color={Colors.textMuted} />}
        </TouchableOpacity>

        {showPrompt && (
          <View style={styles.aiCardBody}>
            {/* Steps */}
            {[
              "Isi topik kursus di bawah",
              "Tap \"Generate & Salin Prompt\"",
              "Tempel prompt ke ChatGPT / Gemini / Claude",
              "Salin output JSON → tempel di bagian Import",
            ].map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepNum}>{i + 1}</Text>
                </View>
                <Text style={styles.stepLabel}>{step}</Text>
              </View>
            ))}

            {/* Subject */}
            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Topik Kursus *</Text>
            <TextInput
              value={promptSubject}
              onChangeText={setPromptSubject}
              placeholder="Contoh: Python untuk Pemula, UI/UX Design..."
              style={styles.aiInput}
              placeholderTextColor={Colors.textMuted}
            />

            {/* Module count */}
            <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Jumlah Modul</Text>
            <View style={styles.chipRow}>
              {MODULE_COUNTS.map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.chip, promptModules === n && styles.chipActive]}
                  onPress={() => setPromptModules(n)}
                >
                  <Text style={[styles.chipText, promptModules === n && styles.chipTextActive]}>
                    {n} modul
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Level */}
            <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Level</Text>
            <View style={styles.chipRow}>
              {LEVELS.map((l) => (
                <TouchableOpacity
                  key={l.key}
                  style={[styles.chip, promptLevel === l.key && styles.chipActive]}
                  onPress={() => setPromptLevel(l.key)}
                >
                  <Text style={[styles.chipText, promptLevel === l.key && styles.chipTextActive]}>
                    {l.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Language */}
            <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Bahasa Output</Text>
            <View style={styles.chipRow}>
              {Object.entries(LANGS).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.chip, promptLang === key && styles.chipActive]}
                  onPress={() => setPromptLang(key)}
                >
                  <Text style={[styles.chipText, promptLang === key && styles.chipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom note */}
            <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Catatan Tambahan (opsional)</Text>
            <TextInput
              value={promptNote}
              onChangeText={setPromptNote}
              placeholder="Misal: fokus ke backend, sertakan contoh kode..."
              style={[styles.aiInput, { minHeight: 60, textAlignVertical: "top" }]}
              placeholderTextColor={Colors.textMuted}
              multiline
            />

            <TouchableOpacity style={styles.generateBtn} onPress={handleGeneratePrompt} activeOpacity={0.85}>
              {promptCopied
                ? <><Check size={16} color="#fff" /><Text style={styles.generateBtnText}>Prompt Tersalin!</Text></>
                : <><Copy size={16} color="#fff" /><Text style={styles.generateBtnText}>Generate & Salin Prompt</Text></>}
            </TouchableOpacity>

            {!!generatedPrompt && (
              <>
                <View style={styles.promptPreview}>
                  <Text style={styles.promptPreviewLabel}>Preview Prompt:</Text>
                  <Text style={styles.promptPreviewText} numberOfLines={6}>{generatedPrompt}</Text>
                </View>
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
                        <Text style={{ fontSize: 16 }}>🤖</Text>
                        <Text style={styles.askAiBtnText}>Ask Your AI</Text>
                        <Text style={{ fontSize: 13, color: "#fff" }}>⚡</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>

      {/* ── JSON Import ── */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => setShowImport((v) => !v)}
          activeOpacity={0.8}
        >
          <Text style={styles.sectionTitle}>Tempel JSON Roadmap</Text>
          {showImport
            ? <ChevronUp size={18} color={Colors.textMuted} />
            : <ChevronDown size={18} color={Colors.textMuted} />}
        </TouchableOpacity>

        {showImport && (
          <View style={{ gap: 10 }}>
            <TextInput
              value={jsonText}
              onChangeText={(t) => { setJsonText(t); setParseError(null); setPreview(null); }}
              placeholder={'{\n  "course_name": "...",\n  "modules": [...]\n}'}
              style={styles.jsonInput}
              placeholderTextColor={Colors.textMuted}
              multiline
              autoCorrect={false}
              autoCapitalize="none"
              spellCheck={false}
            />

            {/* File picker */}
            <TouchableOpacity style={styles.fileBtn} onPress={handlePickFile}>
              <Download size={16} color={Colors.primary} />
              <Text style={styles.fileBtnText}>Atau Impor dari File JSON</Text>
            </TouchableOpacity>

            {/* Error */}
            {parseError && (
              <View style={styles.errorBox}>
                <AlertCircle size={16} color={Colors.danger} />
                <Text style={styles.errorText}>{parseError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.parseBtn}
              onPress={handleParsePreview}
              activeOpacity={0.85}
            >
              <Layers size={16} color="#fff" />
              <Text style={styles.parseBtnText}>Analisa & Lihat Preview</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Preview ── */}
      {preview && (
        <View style={styles.previewCard}>
          {/* Summary bar */}
          <View style={styles.previewHeader}>
            <CheckCircle2 size={20} color={Colors.success} />
            <Text style={styles.previewTitle}>Siap dibuat!</Text>
          </View>

          <View style={styles.statRow}>
            {[
              { label: "Modul", value: preview.totalModules },
              { label: "Pelajaran", value: preview.totalLessons },
              { label: "Materi", value: preview.totalMaterials },
              { label: "Pack", value: preview.totalPacks },
            ].map((s) => (
              <View key={s.label} style={styles.statBox}>
                <Text style={styles.statNum}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.previewCourseName}>{preview.courseName}</Text>
          {!!preview.courseDesc && (
            <Text style={styles.previewCourseDesc}>{preview.courseDesc}</Text>
          )}
          {preview.tags.length > 0 && (
            <View style={styles.tagsRow}>
              {preview.tags.map((tag) => (
                <View key={tag} style={styles.tagChip}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Module tree */}
          {preview.modules.map((mod, mi) => (
            <View key={mi} style={styles.modBlock}>
              <Text style={styles.modName}>
                {mod.order}. {mod.name}
              </Text>
              {mod.lessons.map((les, li) => (
                <View key={li} style={styles.lesRow}>
                  <View style={[styles.typeDot, { backgroundColor: lessonTypeColor(les.type) }]} />
                  <Text style={styles.lesName} numberOfLines={1}>{les.name}</Text>
                  <Text style={styles.lesType}>{les.type}</Text>
                  {les.contentCount > 0 && (
                    <Text style={styles.lesMatCount}>{les.contentCount} materi</Text>
                  )}
                </View>
              ))}
            </View>
          ))}

          {/* CTA */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.saveBtnText}>Buat Kursus Sekarang</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelPreviewBtn}
            onPress={() => { setPreview(null); setShowImport(true); }}
          >
            <Text style={styles.cancelPreviewText}>Ubah JSON</Text>
          </TouchableOpacity>
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

// ─── Helper ───────────────────────────────────────────────────────────────────

function lessonTypeColor(type: string): string {
  switch (type) {
    case "video": return "#FF6B6B";
    case "quiz": return "#F59E0B";
    case "flashcard": return "#7C3AED";
    case "project": return "#059669";
    default: return Colors.primary;
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 20 },

  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: "900", color: Colors.dark },
  headerSub: { fontSize: 13, color: Colors.textMuted, fontWeight: "500", marginTop: 2 },
  closeBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: Colors.white, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.border,
  },

  // AI card
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
  chipRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },
  generateBtn: {
    marginTop: 8, backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 13, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8,
  },
  generateBtnText: { fontSize: 14, fontWeight: "800", color: Colors.white },
  promptPreview: {
    backgroundColor: Colors.background, borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: Colors.border,
  },
  promptPreviewLabel: { fontSize: 10, fontWeight: "800", color: Colors.textMuted, marginBottom: 4, textTransform: "uppercase" },
  promptPreviewText: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },

  // Section
  section: {
    backgroundColor: Colors.white, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: 12, padding: 14,
  },
  sectionHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: Colors.dark },
  jsonInput: {
    backgroundColor: Colors.background, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 12, fontWeight: "500", color: Colors.dark,
    borderWidth: 1.5, borderColor: Colors.border,
    minHeight: 160, textAlignVertical: "top",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  fileBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.primary,
    borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, borderStyle: "dashed",
  },
  fileBtnText: { fontSize: 13, fontWeight: "700", color: Colors.primary },
  errorBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: Colors.dangerLight, borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: Colors.danger,
  },
  errorText: { fontSize: 12, color: Colors.danger, fontWeight: "600", flex: 1 },
  parseBtn: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 13, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  parseBtnText: { fontSize: 14, fontWeight: "800", color: Colors.white },

  // Preview
  previewCard: {
    backgroundColor: Colors.white, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16, marginBottom: 12, gap: 10,
  },
  previewHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  previewTitle: { fontSize: 16, fontWeight: "900", color: Colors.dark },
  statRow: { flexDirection: "row", gap: 8 },
  statBox: {
    flex: 1, backgroundColor: Colors.primaryLight,
    borderRadius: 12, paddingVertical: 10, alignItems: "center",
  },
  statNum: { fontSize: 20, fontWeight: "900", color: Colors.primary },
  statLabel: { fontSize: 10, fontWeight: "700", color: Colors.primary, textTransform: "uppercase" },
  previewCourseName: { fontSize: 17, fontWeight: "900", color: Colors.dark },
  previewCourseDesc: { fontSize: 13, color: Colors.textSecondary, fontWeight: "500" },
  tagsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  tagChip: {
    backgroundColor: Colors.primaryLight, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  tagText: { fontSize: 11, fontWeight: "700", color: Colors.primary },
  modBlock: {
    borderLeftWidth: 2, borderLeftColor: Colors.primaryLight,
    paddingLeft: 12, gap: 4,
  },
  modName: { fontSize: 13, fontWeight: "800", color: Colors.dark, marginBottom: 2 },
  lesRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.background, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
  },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  lesName: { flex: 1, fontSize: 12, fontWeight: "600", color: Colors.textSecondary },
  lesType: {
    fontSize: 10, fontWeight: "700", color: Colors.textMuted,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  lesMatCount: { fontSize: 10, fontWeight: "700", color: Colors.primary },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 16,
    paddingVertical: 14, alignItems: "center", marginTop: 4,
  },
  saveBtnText: { fontSize: 15, fontWeight: "900", color: Colors.white },
  cancelPreviewBtn: { alignItems: "center", paddingVertical: 8 },
  cancelPreviewText: { fontSize: 13, fontWeight: "700", color: Colors.textMuted },

  askAiBtn: { borderRadius: 14, overflow: "hidden", marginTop: 4 },
  askAiGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, borderRadius: 14,
  },
  askAiBtnText: { fontSize: 15, fontWeight: "900", color: "#fff" },
});
