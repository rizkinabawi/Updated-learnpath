import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import { Feather } from "@expo/vector-icons";
import { generatePrompt, PROMPT_TEMPLATES, LANGUAGE_OPTIONS, PromptTemplate } from "@/utils/prompt-templates";
import { shareJson, copyJsonToClipboard, type LearningJsonOutput } from "@/utils/json-export";
import { exportAsZip } from "@/utils/zip-handler";
import {
  getLearningPaths, getModules, getLessons, saveFlashcard, saveQuiz, generateId,
  saveStandaloneCollection, STANDALONE_COLLECTION_PREFIX,
  type LearningPath, type Module, type Lesson,
} from "@/utils/storage";
import Colors, { shadow, shadowSm } from "@/constants/colors";
import { toast } from "@/components/Toast";
import { isCancellationError } from "@/utils/safe-share";
import { AIProviderSheet } from "@/components/AIProviderSheet";
import { callAI } from "@/utils/ai-providers";
import type { AIKey, AIProvider } from "@/utils/ai-keys";

const { width } = Dimensions.get("window");

// ─── Robust JSON extraction (handles smart quotes, code fences, surrounding text) ──
const normalizeJsonText = (raw: string) =>
  raw
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"') // smart double quotes
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'") // smart single quotes
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, " ")        // non-breaking / zero-width spaces
    .replace(/[\u2028\u2029]/g, "\n")                          // line/paragraph separators
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const extractJson = (text: string): string => {
  const t = normalizeJsonText(text).trim();
  // 1. Markdown code fence (```json ... ``` anywhere in text)
  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return normalizeJsonText(fenceMatch[1]).trim();
  // 2. Extract outermost array or object
  const arrStart = t.indexOf("["), arrEnd = t.lastIndexOf("]");
  const objStart = t.indexOf("{"), objEnd = t.lastIndexOf("}");
  if (arrStart !== -1 && arrEnd !== -1 && (objStart === -1 || arrStart <= objStart)) {
    return t.slice(arrStart, arrEnd + 1);
  }
  if (objStart !== -1 && objEnd !== -1) return t.slice(objStart, objEnd + 1);
  return t;
};

const DIFFICULTY_OPTIONS = [
  { id: "beginner", label: "Mudah", color: Colors.success, bg: Colors.successLight },
  { id: "intermediate", label: "Sedang", color: Colors.amber, bg: Colors.amberLight },
  { id: "advanced", label: "Sulit", color: Colors.danger, bg: Colors.dangerLight },
];

const TYPE_OPTIONS = [
  { id: "flashcard", label: "Flashcard", icon: "credit-card" as const, color: Colors.primary, bg: Colors.primaryLight },
  { id: "quiz", label: "Quiz", icon: "help-circle" as const, color: Colors.amber, bg: Colors.amberLight },
];

function Chip({
  label,
  active,
  color,
  bg,
  icon,
  onPress,
}: {
  label: string;
  active: boolean;
  color: string;
  bg: string;
  icon?: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[
        styles.chip,
        active && { backgroundColor: bg, borderColor: color },
      ]}
    >
      {icon && <Feather name={icon} size={13} color={active ? color : Colors.textMuted} />}
      <Text style={[styles.chipText, active && { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function TemplateCard({
  t,
  active,
  onPress,
}: {
  t: PromptTemplate;
  active: boolean;
  onPress: () => void;
}) {
  const isFlashcard = t.type === "flashcard";
  const color = isFlashcard ? Colors.primary : Colors.amber;
  const bg = isFlashcard ? Colors.primaryLight : Colors.amberLight;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.78}
      style={[styles.templateCard, active && { borderColor: color, backgroundColor: bg }]}
    >
      <View style={[styles.templateIconWrap, { backgroundColor: active ? color : Colors.border }]}>
        <Feather
          name={isFlashcard ? "credit-card" : "help-circle"}
          size={16}
          color={active ? "#fff" : Colors.textMuted}
        />
      </View>
      <View style={styles.templateInfo}>
        <Text style={[styles.templateTitle, active && { color }]}>{t.title}</Text>
        <Text style={styles.templateSub}>{t.description}</Text>
      </View>
      {active ? (
        <Feather name="check-circle" size={18} color={color} />
      ) : (
        <Feather name="chevron-right" size={16} color={Colors.textMuted} />
      )}
    </TouchableOpacity>
  );
}

function SectionLabel({ text }: { text: string }) {
  return <Text style={styles.sectionLabel}>{text}</Text>;
}

// ─── Cascade Picker ──────────────────────────────────────────────
function PickerSheet<T extends { id: string }>({
  title, items, getLabel, getSub, onSelect, onClose, onBack,
}: {
  title: string; items: T[]; getLabel: (item: T) => string; getSub: (item: T) => string;
  onSelect: (item: T) => void; onClose: () => void; onBack?: () => void;
}) {
  return (
    <View style={ps.overlay}>
      <View style={ps.sheet}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: "center", marginTop: 12, marginBottom: 4 }} />
        <View style={ps.header}>
          {onBack
            ? <TouchableOpacity style={ps.iconBtn} onPress={onBack}><Feather name="arrow-left" size={18} color={Colors.dark} /></TouchableOpacity>
            : <View style={{ width: 34 }} />}
          <Text style={ps.title} numberOfLines={1}>{title}</Text>
          <TouchableOpacity style={ps.iconBtn} onPress={onClose}><Feather name="x" size={18} color={Colors.dark} /></TouchableOpacity>
        </View>
        {items.length === 0
          ? <View style={ps.empty}><Feather name="inbox" size={32} color={Colors.textMuted} /><Text style={ps.emptyText}>Tidak ada data</Text></View>
          : (
            <ScrollView contentContainerStyle={ps.list}>
              {items.map((item) => (
                <TouchableOpacity key={item.id} style={ps.item} onPress={() => onSelect(item)}>
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

type Tab = "builder" | "share";

export const PromptBuilder = () => {
  const [activeTab, setActiveTab] = useState<Tab>("builder");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("intermediate");
  const [language, setLanguage] = useState("Bahasa Indonesia");
  const [customNote, setCustomNote] = useState("");
  const [outputType, setOutputType] = useState<"quiz" | "flashcard">("flashcard");
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const [sampleJson, setSampleJson] = useState<LearningJsonOutput | null>(null);
  const [importedJson, setImportedJson] = useState<LearningJsonOutput | null>(null);
  const [jsonInput, setJsonInput] = useState("");

  // Save/assign state
  const [saving, setSaving] = useState(false);
  const [courses, setCourses] = useState<LearningPath[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selCourse, setSelCourse] = useState<LearningPath | null>(null);
  const [selModule, setSelModule] = useState<Module | null>(null);
  const [selLesson, setSelLesson] = useState<Lesson | null>(null);
  const [pickerStep, setPickerStep] = useState<"course" | "module" | "lesson" | null>(null);

  const [showProviderSheet, setShowProviderSheet] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    getLearningPaths().then(setCourses);
  }, []);

  useEffect(() => {
    if (!selCourse) { setModules([]); setLessons([]); return; }
    getModules(selCourse.id).then((m) => setModules(m.sort((a, b) => a.order - b.order)));
  }, [selCourse]);

  useEffect(() => {
    if (!selModule) { setLessons([]); return; }
    getLessons(selModule.id).then((l) => setLessons(l.sort((a, b) => a.order - b.order)));
  }, [selModule]);

  const filteredTemplates = PROMPT_TEMPLATES.filter((t) => t.type === outputType);
  const diffOption = DIFFICULTY_OPTIONS.find((d) => d.id === difficulty)!;

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.error("Isi topik terlebih dahulu");
      return;
    }
    if (!selectedTemplate) {
      toast.error("Pilih template terlebih dahulu");
      return;
    }

    setLoading(true);
    await new Promise((r) => setTimeout(r, 400));

    const levelLabel = diffOption.label;
    const prompt = generatePrompt(selectedTemplate.template, topic.trim(), levelLabel, language, customNote);
    setGeneratedPrompt(prompt);

    const sampleData: LearningJsonOutput =
      outputType === "flashcard"
        ? {
            type: "flashcard",
            topic: topic.trim(),
            difficulty,
            items: [
              { question: `Contoh pertanyaan tentang ${topic}?`, answer: "Jawaban lengkap dan informatif di sini.", tag: "contoh-tag" },
              { question: `Konsep utama ${topic}`, answer: "Penjelasan singkat dan padat tentang konsep ini.", tag: "konsep-inti" },
              { question: `Definisi penting ${topic}`, answer: "Definisi yang jelas dan mudah dipahami.", tag: "definisi" },
            ],
          }
        : {
            type: "quiz",
            topic: topic.trim(),
            difficulty,
            items: [
              {
                question: `Soal contoh tentang ${topic}?`,
                options: ["Jawaban yang benar", "Pilihan salah B", "Pilihan salah C", "Pilihan salah D"],
                correct_answer: "Jawaban yang benar",
                explanation: "Penjelasan singkat mengapa jawaban ini benar.",
              },
              {
                question: `Pertanyaan lanjutan tentang ${topic}?`,
                options: ["Opsi A yang salah", "Opsi B yang benar", "Opsi C yang salah", "Opsi D yang salah"],
                correct_answer: "Opsi B yang benar",
                explanation: "Penjelasan kenapa Opsi B adalah jawaban yang tepat.",
              },
            ],
          };

    setSampleJson(sampleData);
    await Clipboard.setStringAsync(prompt);
    setLoading(false);
    toast.success("Prompt tersalin ke clipboard!");
  };

  const handleAskAI = async (provider: AIProvider, key: AIKey) => {
    if (!generatedPrompt) return;
    setAiLoading(true);
    try {
      const { content } = await callAI(provider, generatedPrompt, key.apiKey);
      const raw = JSON.parse(extractJson(content));

      let result: LearningJsonOutput;
      if (Array.isArray(raw)) {
        const first = raw[0] ?? {};
        const isQuiz = "options" in first;
        if (isQuiz) {
          result = {
            type: "quiz",
            topic: topic.trim() || "AI Generate",
            difficulty,
            items: raw.map((item: any) => ({
              question: item.question ?? "",
              options: Array.isArray(item.options) ? item.options.map(String) : [],
              correct_answer: item.correct_answer ?? item.answer ?? "",
              explanation: item.explanation ?? "",
            })),
          };
        } else {
          result = {
            type: "flashcard",
            topic: topic.trim() || "AI Generate",
            difficulty,
            items: raw.map((item: any) => ({
              question: item.question ?? item.front ?? "",
              answer: item.answer ?? item.back ?? "",
              tag: item.tag ?? "",
            })),
          };
        }
      } else if (raw && Array.isArray(raw.items)) {
        const isQuizWrapped = raw.type === "quiz";
        const normalizedItems = raw.items.map((item: any) => {
          if (!isQuizWrapped) {
            return {
              question: item.question ?? item.front ?? "",
              answer: item.answer ?? item.back ?? "",
              tag: item.tag ?? "",
            };
          }
          return {
            question: item.question ?? "",
            options: Array.isArray(item.options) ? item.options.map(String) : [],
            correct_answer: item.correct_answer ?? item.answer ?? "",
            explanation: item.explanation ?? "",
          };
        });
        result = {
          type: isQuizWrapped ? "quiz" : "flashcard",
          topic: (raw.topic ?? topic.trim()) || "AI Generate",
          difficulty: raw.difficulty ?? difficulty,
          items: normalizedItems,
        } as LearningJsonOutput;
      } else {
        throw new Error("Format tidak dikenali");
      }

      if (!result.items || result.items.length === 0) {
        throw new Error("Tidak ada item ditemukan");
      }

      setImportedJson(result);
      setShowProviderSheet(false);
      setActiveTab("share");
      toast.success(`${result.items.length} item berhasil digenerate!`);
    } catch (e: any) {
      const msg: string = e?.message ?? "";
      setShowProviderSheet(false);
      if (msg.includes("tidak valid") || msg.includes("Rate limit") || msg.includes("Kuota")) {
        Alert.alert("AI Error", msg);
      } else if (msg === "Format tidak dikenali" || msg === "Tidak ada item ditemukan") {
        Alert.alert(
          "Format Tidak Dikenali",
          "AI tidak mengembalikan JSON yang valid. Coba generate ulang atau periksa API key."
        );
      } else if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch")) {
        Alert.alert("Koneksi Gagal", "Periksa koneksi internet kamu.");
      } else {
        Alert.alert("Gagal", msg || "Terjadi kesalahan tak terduga.");
      }
    } finally {
      setAiLoading(false);
    }
  };

  const handleCopyPrompt = async () => {
    if (!generatedPrompt) return;
    await Clipboard.setStringAsync(generatedPrompt);
    toast.success("Prompt tersalin!");
  };

  const handleSharePrompt = async () => {
    if (!generatedPrompt || isSharing) return;
    setIsSharing(true);
    try {
      const { Share } = await import("react-native");
      await Share.share({ message: generatedPrompt });
    } catch (e) {
      if (!isCancellationError(e)) toast.error("Gagal membagikan prompt");
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyJson = async () => {
    if (!sampleJson) return;
    await copyJsonToClipboard(sampleJson);
    toast.success("JSON tersalin ke clipboard!");
  };

  const handleShareJson = async () => {
    if (!sampleJson || isSharing) return;
    setIsSharing(true);
    try {
      await shareJson(sampleJson);
      toast.success("JSON berhasil dibagikan!");
    } catch (e) {
      if (!isCancellationError(e)) toast.error("Gagal membagikan JSON");
    } finally {
      setIsSharing(false);
    }
  };

  const handleExportZip = async () => {
    if (!sampleJson) return;
    try {
      await exportAsZip(sampleJson, []);
      toast.success("ZIP berhasil diekspor!");
    } catch {
      toast.error("Gagal mengekspor ZIP");
    }
  };

  // ─── Save imported items to storage ───────────────────────────
  const handleSaveItems = async (targetLessonId: string | null) => {
    if (!importedJson) return;
    setSaving(true);
    try {
      const isQuiz = importedJson.type === "quiz";
      const items = importedJson.items as any[];

      // When no lesson given, create a new standalone collection
      let resolvedId = targetLessonId ?? "";
      if (!targetLessonId) {
        const colId = STANDALONE_COLLECTION_PREFIX + generateId();
        const colName = `${isQuiz ? "Koleksi Soal" : "Koleksi Flashcard"} (${items.length} item)`;
        await saveStandaloneCollection({ id: colId, name: colName, type: isQuiz ? "quiz" : "flashcard", createdAt: new Date().toISOString() });
        resolvedId = colId;
      }
      for (const item of items) {
        if (isQuiz) {
          // Resolve correct_answer / answer to full option text
          const opts: string[] = Array.isArray(item.options) ? item.options.map(String) : [];
          let answer = String(item.correct_answer ?? item.answer ?? "").trim();
          if (!opts.find((o) => o === answer)) {
            const letterMatch = answer.match(/^([A-Da-d])[\.\):\s]/);
            if (letterMatch) {
              const idx = "abcd".indexOf(letterMatch[1].toLowerCase());
              if (idx >= 0 && opts[idx]) answer = opts[idx];
            } else {
              const partial = opts.find((o) => o.toLowerCase().includes(answer.toLowerCase()) || answer.toLowerCase().includes(o.toLowerCase()));
              if (partial) answer = partial;
            }
          }
          await saveQuiz({
            id: generateId(), lessonId: resolvedId,
            question: String(item.question ?? "").trim(),
            options: opts, answer,
            explanation: item.explanation ? String(item.explanation).trim() : undefined,
            type: "multiple-choice", createdAt: new Date().toISOString(),
          });
        } else {
          await saveFlashcard({
            id: generateId(), lessonId: resolvedId,
            question: String(item.question ?? item.front ?? "").trim(),
            answer: String(item.answer ?? item.back ?? "").trim(),
            tag: String(item.tag ?? "").trim() || undefined,
            createdAt: new Date().toISOString(),
          });
        }
      }
      const label = targetLessonId ? (selLesson?.name ?? "pelajaran") : "koleksi baru";
      toast.success(`${items.length} ${isQuiz ? "soal" : "kartu"} disimpan ke ${label}!`);
      setImportedJson(null);
      setJsonInput("");
      setSelLesson(null); setSelModule(null); setSelCourse(null);
    } catch (e: any) {
      toast.error("Gagal menyimpan: " + (e?.message ?? ""));
    } finally {
      setSaving(false);
    }
  };

  const handleParseJson = () => {
    if (!jsonInput.trim()) {
      toast.error("Tempel JSON terlebih dahulu");
      return;
    }
    try {
      // Robust cleaning: handles smart quotes, code fences anywhere, surrounding text
      const raw = JSON.parse(extractJson(jsonInput));

      // Normalisasi ke format LearningJsonOutput
      let result: LearningJsonOutput;

      if (Array.isArray(raw)) {
        // Flat array format — deteksi tipe dari field yang ada
        const first = raw[0] ?? {};
        const isQuiz = "options" in first;
        if (isQuiz) {
          result = {
            type: "quiz",
            topic: "Import",
            difficulty: "intermediate",
            items: raw.map((item: any) => ({
              question: item.question ?? "",
              options: Array.isArray(item.options) ? item.options.map(String) : [],
              correct_answer: item.correct_answer ?? item.answer ?? "",
              explanation: item.explanation ?? "",
            })),
          };
        } else {
          // Selalu pakai question/answer/tag — bukan front/back
          result = {
            type: "flashcard",
            topic: "Import",
            difficulty: "intermediate",
            items: raw.map((item: any) => ({
              question: item.question ?? item.front ?? "",
              answer: item.answer ?? item.back ?? "",
              tag: item.tag ?? "",
            })),
          };
        }
      } else if (raw && Array.isArray(raw.items)) {
        // Wrapped format — normalkan ke question/answer/tag
        const isQuizWrapped = raw.type === "quiz";
        const normalizedItems = raw.items.map((item: any) => {
          if (!isQuizWrapped) {
            return {
              question: item.question ?? item.front ?? "",
              answer: item.answer ?? item.back ?? "",
              tag: item.tag ?? "",
            };
          }
          return {
            question: item.question ?? "",
            options: Array.isArray(item.options) ? item.options.map(String) : [],
            correct_answer: item.correct_answer ?? item.answer ?? "",
            explanation: item.explanation ?? "",
          };
        });
        if (isQuizWrapped) {
          result = {
            type: "quiz",
            topic: raw.topic ?? "Import",
            difficulty: raw.difficulty ?? "intermediate",
            items: normalizedItems,
          } as LearningJsonOutput;
        } else {
          result = {
            type: "flashcard",
            topic: raw.topic ?? "Import",
            difficulty: raw.difficulty ?? "intermediate",
            items: normalizedItems,
          } as LearningJsonOutput;
        }
      } else {
        throw new Error("Format tidak dikenali");
      }

      if (!result.items || result.items.length === 0) {
        throw new Error("Tidak ada item ditemukan");
      }

      setImportedJson(result);
      toast.success(`Berhasil: ${result.items.length} item di-import`);
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (msg === "Format tidak dikenali") {
        toast.error("Format JSON tidak dikenali. Coba flat array: [{...}]");
      } else if (msg === "Tidak ada item ditemukan") {
        toast.error("Tidak ada item ditemukan dalam JSON");
      } else {
        Alert.alert(
          "JSON Tidak Dapat Dibaca",
          "Pastikan teks berisi JSON valid.\n\nTips:\n• Hapus teks pengantar dari AI\n• Pastikan kutip (\") tidak curly\n• Coba salin ulang dari AI\n\nFormat:\n[{\"question\":\"...\",\"answer\":\"...\"}]"
        );
      }
    }
  };

  return (
    <View style={{ flex: 1 }}>
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <LinearGradient
        colors={["#4C6FFF", "#7C47FF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerBlob1} />
        <View style={styles.headerBlob2} />
        <View style={styles.headerRow}>
          <View style={styles.headerIconWrap}>
            <Feather name="cpu" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>AI Prompt Generator</Text>
            <Text style={styles.headerSub}>Buat prompt untuk ChatGPT / Claude</Text>
          </View>
        </View>
        <View style={styles.tabRow}>
          {(["builder", "share"] as Tab[]).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setActiveTab(t)}
              style={[styles.headerTab, activeTab === t && styles.headerTabActive]}
            >
              <Text style={[styles.headerTabText, activeTab === t && styles.headerTabTextActive]}>
                {t === "builder" ? "Builder" : "Share & Import"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {activeTab === "builder" ? (
        <>
          {/* Topic */}
          <View style={styles.section}>
            <SectionLabel text="Topik" />
            <TextInput
              placeholder="Contoh: React Native, Fotosintesis, JLPT N3..."
              value={topic}
              onChangeText={setTopic}
              style={styles.input}
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          {/* Output Type */}
          <View style={styles.section}>
            <SectionLabel text="Jenis Output" />
            <View style={styles.chipRow}>
              {TYPE_OPTIONS.map((o) => (
                <Chip
                  key={o.id}
                  label={o.label}
                  icon={o.icon}
                  active={outputType === o.id}
                  color={o.color}
                  bg={o.bg}
                  onPress={() => {
                    setOutputType(o.id as "quiz" | "flashcard");
                    setSelectedTemplate(null);
                  }}
                />
              ))}
            </View>
          </View>

          {/* Difficulty */}
          <View style={styles.section}>
            <SectionLabel text="Tingkat Kesulitan" />
            <View style={styles.chipRow}>
              {DIFFICULTY_OPTIONS.map((d) => (
                <Chip
                  key={d.id}
                  label={d.label}
                  active={difficulty === d.id}
                  color={d.color}
                  bg={d.bg}
                  onPress={() => setDifficulty(d.id)}
                />
              ))}
            </View>
          </View>

          {/* Language */}
          <View style={styles.section}>
            <SectionLabel text="Bahasa Soal" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
              {LANGUAGE_OPTIONS.map((l) => (
                <Chip
                  key={l.id}
                  label={l.label}
                  active={language === l.id}
                  color={Colors.primary}
                  bg={Colors.primaryLight}
                  onPress={() => setLanguage(l.id)}
                />
              ))}
            </ScrollView>
          </View>

          {/* Custom Note */}
          <View style={styles.section}>
            <SectionLabel text="Catatan Khusus (Opsional)" />
            <TextInput
              placeholder="Contoh: fokus pada bab 3, tambah konteks lokal Indonesia, buat soal bergaya UTBK..."
              value={customNote}
              onChangeText={setCustomNote}
              style={[styles.input, { minHeight: 72, textAlignVertical: "top", paddingTop: 12 }]}
              placeholderTextColor={Colors.textMuted}
              multiline
            />
          </View>

          {/* Templates */}
          <View style={styles.section}>
            <SectionLabel text="Template" />
            <View style={styles.templateList}>
              {filteredTemplates.map((t) => (
                <TemplateCard
                  key={t.id}
                  t={t}
                  active={selectedTemplate?.id === t.id}
                  onPress={() => setSelectedTemplate(t)}
                />
              ))}
            </View>
          </View>

          {/* Generate Button */}
          <TouchableOpacity
            onPress={handleGenerate}
            activeOpacity={0.85}
            style={[styles.generateBtn, shadow]}
            disabled={loading}
          >
            <LinearGradient
              colors={["#4C6FFF", "#7C47FF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.generateGrad}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Feather name="zap" size={18} color="#fff" />
                  <Text style={styles.generateBtnText}>Generate Prompt</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Generated Prompt Output */}
          {!!generatedPrompt && (
            <View style={[styles.outputBox, shadowSm]}>
              <View style={styles.outputHeader}>
                <View style={styles.outputBadge}>
                  <Feather name="check-circle" size={13} color={Colors.success} />
                  <Text style={styles.outputBadgeText}>Prompt Siap</Text>
                </View>
                <Text style={styles.outputHint}>Paste ke ChatGPT / Claude</Text>
              </View>
              <ScrollView
                style={styles.promptScroll}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                <Text style={styles.promptText}>{generatedPrompt}</Text>
              </ScrollView>
              <View style={styles.outputActions}>
                <TouchableOpacity
                  onPress={handleCopyPrompt}
                  style={styles.actionBtnPrimary}
                  activeOpacity={0.8}
                >
                  <Feather name="copy" size={15} color="#fff" />
                  <Text style={styles.actionBtnPrimaryText}>Salin Prompt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSharePrompt}
                  style={styles.actionBtnOutline}
                  activeOpacity={0.8}
                >
                  <Feather name="share-2" size={15} color={Colors.primary} />
                </TouchableOpacity>
              </View>
              {/* Ask AI Button */}
              <TouchableOpacity
                onPress={() => setShowProviderSheet(true)}
                style={styles.askAiBtn}
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
                      <Feather name="zap" size={14} color="#fff" />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* Expected JSON Format Preview */}
          {!!sampleJson && (
            <View style={[styles.jsonBox, shadowSm]}>
              <View style={styles.jsonHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={styles.jsonDot} />
                  <Text style={styles.jsonHeaderTitle}>Format JSON Output</Text>
                </View>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{sampleJson.type.toUpperCase()}</Text>
                </View>
              </View>
              <ScrollView style={styles.jsonScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                <Text style={styles.jsonText}>{JSON.stringify(sampleJson, null, 2)}</Text>
              </ScrollView>
              <View style={styles.jsonActions}>
                <TouchableOpacity onPress={handleCopyJson} style={[styles.jsonActionBtn, { backgroundColor: Colors.dark }]} activeOpacity={0.8}>
                  <Feather name="copy" size={14} color="#fff" />
                  <Text style={styles.jsonActionBtnText}>Salin JSON</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleShareJson} style={[styles.jsonActionBtn, { backgroundColor: Colors.primaryLight, borderWidth: 1, borderColor: Colors.primary }]} activeOpacity={0.8}>
                  <Feather name="share-2" size={14} color={Colors.primary} />
                  <Text style={[styles.jsonActionBtnText, { color: Colors.primary }]}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleExportZip} style={[styles.jsonActionBtn, { backgroundColor: Colors.purpleLight, borderWidth: 1, borderColor: Colors.purple }]} activeOpacity={0.8}>
                  <Feather name="archive" size={14} color={Colors.purple} />
                  <Text style={[styles.jsonActionBtnText, { color: Colors.purple }]}>ZIP</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      ) : (
        <>
          {/* Share & Import Tab */}
          <View style={[styles.infoCard, shadowSm]}>
            <Feather name="info" size={16} color={Colors.primary} />
            <Text style={styles.infoText}>
              Setelah AI menghasilkan JSON, paste di sini untuk melihat pratinjau dan mengimpornya ke aplikasi.
            </Text>
          </View>

          <View style={styles.section}>
            <SectionLabel text="Paste JSON dari AI" />
            <TextInput
              placeholder={`{\n  "type": "quiz",\n  "topic": "...",\n  "items": [...]\n}`}
              value={jsonInput}
              onChangeText={setJsonInput}
              style={[styles.input, styles.jsonInput]}
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={8}
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity onPress={handleParseJson} style={[styles.generateBtn, shadow]} activeOpacity={0.85}>
            <LinearGradient colors={["#7C3AED", "#A855F7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.generateGrad}>
              <Feather name="upload" size={18} color="#fff" />
              <Text style={styles.generateBtnText}>Parse & Preview JSON</Text>
            </LinearGradient>
          </TouchableOpacity>

          {importedJson && (
            <View style={[styles.importedCard, shadow]}>
              <View style={styles.importedHeader}>
                <View style={[styles.importedIconWrap, { backgroundColor: Colors.successLight }]}>
                  <Feather name="check-circle" size={20} color={Colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.importedTitle}>{importedJson.topic}</Text>
                  <Text style={styles.importedSub}>
                    {importedJson.items.length} item · {importedJson.type} · {importedJson.difficulty}
                  </Text>
                </View>
              </View>

              <View style={styles.importedPreview}>
                {importedJson.items.slice(0, 3).map((item, i) => (
                  <View key={i} style={styles.importedItem}>
                    <Text style={styles.importedItemNum}>{i + 1}</Text>
                    <Text style={styles.importedItemText} numberOfLines={2}>
                      {(item as any).question ?? ""}
                    </Text>
                  </View>
                ))}
                {importedJson.items.length > 3 && (
                  <Text style={styles.importedMore}>+{importedJson.items.length - 3} item lainnya</Text>
                )}
              </View>

              {/* ── Save to Personal Collection ── */}
              <TouchableOpacity
                style={[styles.saveToPersonalBtn, saving && { opacity: 0.6 }]}
                onPress={() => handleSaveItems(null)}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="folder-plus" size={16} color="#fff" />}
                <Text style={styles.saveToPersonalBtnText}>
                  {saving ? "Menyimpan..." : "Simpan ke Koleksi Baru"}
                </Text>
              </TouchableOpacity>

              {/* ── Assign to Lesson ── */}
              <TouchableOpacity
                style={styles.assignBtn}
                onPress={() => setPickerStep("course")}
                disabled={saving}
                activeOpacity={0.85}
              >
                <Feather name="book-open" size={16} color={Colors.primary} />
                <Text style={styles.assignBtnText} numberOfLines={1}>
                  {selLesson
                    ? `Assign ke: ${selLesson.name}`
                    : "Assign ke Pelajaran..."}
                </Text>
                <Feather name="chevron-right" size={16} color={Colors.primary} />
              </TouchableOpacity>

              {selLesson && (
                <TouchableOpacity
                  style={[styles.saveToLessonBtn, saving && { opacity: 0.6 }]}
                  onPress={() => handleSaveItems(selLesson.id)}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="check" size={16} color="#fff" />}
                  <Text style={styles.saveToPersonalBtnText}>
                    {saving ? "Menyimpan..." : `Simpan ke "${selLesson.name}"`}
                  </Text>
                </TouchableOpacity>
              )}

              {/* ── Secondary: Copy & Share ── */}
              <View style={styles.importedActions}>
                <TouchableOpacity
                  onPress={() => { copyJsonToClipboard(importedJson); toast.success("JSON tersalin!"); }}
                  style={[styles.jsonActionBtn, { backgroundColor: Colors.dark, flex: 1 }]}
                  activeOpacity={0.8}
                >
                  <Feather name="copy" size={14} color="#fff" />
                  <Text style={styles.jsonActionBtnText}>Salin JSON</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    if (!isSharing) {
                      setIsSharing(true);
                      shareJson(importedJson).then(() => toast.success("Dibagikan!")).catch(() => {}).finally(() => setIsSharing(false));
                    }
                  }}
                  style={[styles.jsonActionBtn, { backgroundColor: Colors.primaryLight, borderWidth: 1, borderColor: Colors.primary, flex: 1 }]}
                  activeOpacity={0.8}
                  disabled={isSharing}
                >
                  <Feather name="share-2" size={14} color={Colors.primary} />
                  <Text style={[styles.jsonActionBtnText, { color: Colors.primary }]}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Expected Format Docs */}
          <View style={[styles.docsCard, shadowSm]}>
            <Text style={styles.docsTitle}>Format JSON yang Didukung</Text>
            <Text style={styles.docsHint}>Sistem menerima flat array (disarankan) atau wrapped object</Text>
            <View style={styles.docsSep} />
            <Text style={styles.docsSubtitle}>✅ Flashcard (flat array)</Text>
            <Text style={styles.docsCode}>{`[\n  {\n    "question": "Apa itu ...",\n    "answer": "Jawaban lengkap",\n    "tag": "kata-kunci"\n  }\n]`}</Text>
            <View style={styles.docsSep} />
            <Text style={styles.docsSubtitle}>✅ Quiz (flat array)</Text>
            <Text style={styles.docsCode}>{`[\n  {\n    "question": "Pertanyaan?",\n    "options": [\n      "Jawaban benar",\n      "Pilihan salah B",\n      "Pilihan salah C",\n      "Pilihan salah D"\n    ],\n    "answer": "Jawaban benar"\n  }\n]`}</Text>
            <View style={styles.docsSep} />
            <Text style={styles.docsSubtitle}>⚠️ Penting untuk Quiz</Text>
            <Text style={styles.docsHint}>Nilai "answer" harus identik (sama persis) dengan salah satu teks di "options". Jangan tulis "A", "B", "C", "D".</Text>
          </View>
        </>
      )}

      <View style={{ height: 48 }} />
    </ScrollView>

      {/* ── Cascade Pickers (absolute overlay on parent) ── */}
      {pickerStep === "course" && (
        <PickerSheet title="Pilih Kursus" items={courses}
          getLabel={(c) => c.name} getSub={(c) => c.description}
          onSelect={(c) => { setSelCourse(c); setSelModule(null); setSelLesson(null); setPickerStep("module"); }}
          onClose={() => setPickerStep(null)} />
      )}
      {pickerStep === "module" && selCourse && (
        <PickerSheet title={`Modul di "${selCourse.name}"`} items={modules}
          getLabel={(m) => m.name} getSub={(m) => m.description}
          onSelect={(m) => { setSelModule(m); setSelLesson(null); setPickerStep("lesson"); }}
          onClose={() => setPickerStep(null)} onBack={() => setPickerStep("course")} />
      )}
      {pickerStep === "lesson" && selModule && (
        <PickerSheet title={`Pelajaran di "${selModule.name}"`} items={lessons}
          getLabel={(l) => l.name} getSub={(l) => l.description}
          onSelect={(l) => { setSelLesson(l); setPickerStep(null); }}
          onClose={() => setPickerStep(null)} onBack={() => setPickerStep("module")} />
      )}

      <AIProviderSheet
        visible={showProviderSheet}
        loading={aiLoading}
        onClose={() => { if (!aiLoading) setShowProviderSheet(false); }}
        onSelect={(provider, key) => handleAskAI(provider, key)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: 32 },

  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 0,
    overflow: "hidden",
    marginBottom: 0,
  },
  headerBlob1: { position: "absolute", width: 160, height: 160, borderRadius: 80, backgroundColor: "rgba(255,255,255,0.08)", top: -50, right: -40 },
  headerBlob2: { position: "absolute", width: 90, height: 90, borderRadius: 45, backgroundColor: "rgba(255,255,255,0.06)", bottom: 20, left: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  headerIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#fff", letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.65)", fontWeight: "600", marginTop: 1 },
  tabRow: { flexDirection: "row", gap: 0 },
  headerTab: { flex: 1, paddingVertical: 11, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  headerTabActive: { borderBottomColor: "#fff" },
  headerTabText: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.5)" },
  headerTabTextActive: { color: "#fff", fontWeight: "900" },

  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 8,
  },

  input: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  jsonInput: {
    minHeight: 140,
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 18,
    paddingTop: 12,
  },

  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  chipText: { fontSize: 13, fontWeight: "700", color: Colors.textMuted },

  templateList: { gap: 8 },
  templateCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  templateIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  templateInfo: { flex: 1 },
  templateTitle: { fontSize: 14, fontWeight: "800", color: Colors.dark, marginBottom: 2 },
  templateSub: { fontSize: 12, color: Colors.textMuted, fontWeight: "500" },

  generateBtn: { marginHorizontal: 16, marginTop: 24, borderRadius: 16, overflow: "hidden" },
  generateGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
  },
  generateBtnText: { fontSize: 16, fontWeight: "900", color: "#fff", letterSpacing: -0.2 },

  outputBox: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  outputHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  outputBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.successLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  outputBadgeText: { fontSize: 11, fontWeight: "800", color: Colors.success },
  outputHint: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  promptScroll: { maxHeight: 200, backgroundColor: "#F8FAFF", borderRadius: 10, padding: 12 },
  promptText: { fontSize: 13, color: Colors.dark, lineHeight: 21, fontWeight: "500" },
  outputActions: { flexDirection: "row", gap: 8 },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.dark,
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionBtnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  actionBtnOutline: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  askAiBtn: {
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 6,
  },
  askAiGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  askAiBtnText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 0.3,
  },

  jsonBox: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: Colors.dark,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  jsonHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  jsonDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  jsonHeaderTitle: { fontSize: 12, fontWeight: "800", color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: 1 },
  typeBadge: { backgroundColor: "rgba(255,255,255,0.12)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  typeBadgeText: { fontSize: 10, fontWeight: "900", color: "rgba(255,255,255,0.7)", letterSpacing: 1 },
  jsonScroll: { maxHeight: 180 },
  jsonText: { fontSize: 12, color: "#A5B4FC", lineHeight: 19, fontFamily: "monospace" },
  jsonActions: { flexDirection: "row", gap: 8 },
  jsonActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  jsonActionBtnText: { fontSize: 12, fontWeight: "800", color: "#fff" },

  infoCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: Colors.primaryLight,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: Colors.primary + "30",
  },
  infoText: { flex: 1, fontSize: 13, color: Colors.primary, fontWeight: "600", lineHeight: 19 },

  importedCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    gap: 14,
  },
  importedHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  importedIconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  importedTitle: { fontSize: 16, fontWeight: "900", color: Colors.dark },
  importedSub: { fontSize: 12, color: Colors.textMuted, fontWeight: "600", marginTop: 2, textTransform: "capitalize" },
  importedPreview: { gap: 8 },
  importedItem: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  importedItemNum: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: Colors.primaryLight,
    textAlign: "center",
    lineHeight: 20,
    fontSize: 11,
    fontWeight: "900",
    color: Colors.primary,
  },
  importedItemText: { flex: 1, fontSize: 13, color: Colors.dark, fontWeight: "500", lineHeight: 19 },
  importedMore: { fontSize: 12, color: Colors.textMuted, fontWeight: "700", textAlign: "center", paddingTop: 4 },
  importedActions: { flexDirection: "row", gap: 8 },

  docsCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: "#0F1F3D",
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  docsTitle: { fontSize: 13, fontWeight: "900", color: "#fff", marginBottom: 2 },
  docsSubtitle: { fontSize: 11, fontWeight: "800", color: "#A5B4FC", marginBottom: 4 },
  docsHint: { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: "500", lineHeight: 16 },
  docsSep: { height: 1, backgroundColor: "rgba(255,255,255,0.08)" },
  docsCode: { fontSize: 11, color: "#A5B4FC", lineHeight: 19, fontFamily: "monospace" },

  // Save / Assign buttons
  saveToPersonalBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9,
    backgroundColor: Colors.success, borderRadius: 14, paddingVertical: 14,
  },
  saveToLessonBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9,
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14,
  },
  saveToPersonalBtnText: { fontSize: 14, fontWeight: "900", color: "#fff" },
  assignBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: Colors.primaryLight,
  },
  assignBtnText: { flex: 1, fontSize: 13, fontWeight: "700", color: Colors.primary },
});

const ps = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    zIndex: 20,
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: "75%", paddingBottom: 24,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  iconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontSize: 15, fontWeight: "800", color: Colors.dark },
  list: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  item: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.white,
    borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: Colors.border,
  },
  itemLabel: { fontSize: 14, fontWeight: "800", color: Colors.dark, marginBottom: 2 },
  itemSub: { fontSize: 12, color: Colors.textMuted, fontWeight: "500" },
  empty: { alignItems: "center", paddingVertical: 36, gap: 10 },
  emptyText: { fontSize: 14, color: Colors.textMuted, fontWeight: "600" },
});
