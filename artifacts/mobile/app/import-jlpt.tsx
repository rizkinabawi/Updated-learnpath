import { useColors, useTheme } from "@/contexts/ThemeContext";
import React, { useState, useMemo } from "react";
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
  X, Bot, Copy, Check,
  Download, AlertCircle, CheckCircle2, Layers,
  ChevronDown, ChevronUp, BookOpen, HelpCircle
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "@/utils/fs-compat";
import {
  saveLearningPath, saveModule, saveLesson,
  saveQuizPack, saveQuizzesBulk,
  generateId,
  type LearningPath, type Module, type Lesson,
  type QuizPack, type Quiz,
  importCourse, importCollection
} from "@/utils/storage";
import { type ColorScheme } from "@/constants/colors";
import { toast } from "@/components/Toast";

// ─── Types for JLPT Format ─────────────────────────────────────────────────────

interface JLPTQuestion {
  number: number;
  question: string;
  choices: Record<string, string> | string[];
  correct_answer: string | number;
  correct_text?: string;
}

interface JLPTSection {
  section: string;
  section_name: string;
  total_questions: number;
  questions: JLPTQuestion[];
  title?: string;
  url?: string;
}

interface JLPTExam {
  level: string;
  exam_number: number;
  total_questions: number;
  sections: JLPTSection[];
}

// ─── Preview Type ─────────────────────────────────────────────────────────────

interface JLPTPreview {
  exams: Array<{
    level: string;
    number: number;
    sections: Array<{
      name: string;
      qCount: number;
    }>;
  }>;
  totalExams: number;
  totalSections: number;
  totalQuestions: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const tryParse = (s: string): any => {
  try { return JSON.parse(s); } catch { return null; }
};

export default function ImportJLPTPage() {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);

  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [jsonText, setJsonText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<JLPTPreview | null>(null);
  const [showImport, setShowImport] = useState(true);
  const [expandedExams, setExpandedExams] = useState<Record<number, boolean>>({});

  const toggleExam = (index: number) => {
    setExpandedExams(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    setJsonText(text);
    setParseError(null);
    setPreview(null);
  };

  // ── Logic ────────────────────────────────────────────────────────────────────

  const handleParsePreview = () => {
    setParseError(null);
    setPreview(null);
    if (!jsonText.trim()) {
      setParseError("Tempel JSON JLPT terlebih dahulu.");
      return;
    }

    const parsed = tryParse(jsonText);
    if (!parsed) {
      setParseError("Format JSON tidak valid.");
      return;
    }

    const exams: JLPTExam[] = Array.isArray(parsed) ? parsed : [parsed];
    
    // Simple validation
    if (exams.length === 0 || !exams[0].level || !exams[0].sections) {
      setParseError("Format JSON tidak sesuai dengan standar JLPT (level/sections missing).");
      return;
    }

    let totalQ = 0;
    let totalS = 0;

    const previewData: JLPTPreview = {
      exams: exams.map(e => {
        totalS += (e.sections || []).length;
        return {
          level: e.level,
          number: e.exam_number,
          sections: (e.sections || []).map(s => {
            totalQ += (s.questions || []).length;
            return {
              name: s.section_name,
              qCount: (s.questions || []).length
            };
          })
        };
      }),
      totalExams: exams.length,
      totalSections: totalS,
      totalQuestions: totalQ
    };

    setPreview(previewData);
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
      
      const parsed = tryParse(text);
      if (parsed && (parsed.type === "course" || parsed.type === "collection")) {
        handleBeamImport(parsed);
      } else {
        setJsonText(text);
        toast.info("File dimuat. Tap Analisa untuk melihat preview.");
      }
    } catch (e) {
      console.error("[Import] Read file failed:", e);
      toast.error("Gagal membaca file.");
    }
  };

  const handleBeamImport = (pack: any) => {
    Alert.alert(
      "Impor Materi",
      `Ditemukan data ${pack.type === "course" ? "Kursus" : "Koleksi"}. Impor sekarang?`,
      [
        { text: "Batal", style: "cancel" },
        { 
          text: "Impor", 
          onPress: async () => {
            setBusy(true);
            try {
              if (pack.type === "course") {
                await importCourse(pack.data);
                toast.success("Kursus berhasil diimpor!");
              } else {
                await importCollection(pack.data);
                toast.success("Koleksi berhasil diimpor!");
              }
              router.back();
            } catch (e) {
              toast.error("Gagal impor materi.");
            } finally { setBusy(false); }
          }
        }
      ]
    );
  };

  const doImport = async () => {
    setBusy(true);
    try {
      const parsed = tryParse(jsonText);
      const exams: JLPTExam[] = Array.isArray(parsed) ? parsed : [parsed];
      const now = new Date().toISOString();

      for (const exam of exams) {
        // 1. Create Learning Path
        const pathId = `jlpt-${(exam.level || "n2").toLowerCase()}-${generateId()}`;
        const cleanName = (exam.level || "N2").toUpperCase();
        const path: LearningPath = {
          id: pathId,
          name: `JLPT ${cleanName} Practice`,
          description: `Koleksi soal latihan untuk JLPT level ${cleanName}.`,
          userId: "local",
          tags: ["JLPT", cleanName],
          createdAt: now,
          icon: "book"
        };
        await saveLearningPath(path);

        // 2. Create Module (Exam)
        const moduleId = `mod-${exam.exam_number}-${generateId()}`;
        const cleanModuleDesc = `Full practice exam #${exam.exam_number} for JLPT ${cleanName}.`;
        const mod: Module = {
          id: moduleId,
          pathId: pathId,
          name: `Simulasi Exam #${exam.exam_number}`,
          description: cleanModuleDesc,
          order: exam.exam_number,
          createdAt: now,
          icon: "layers"
        };
        await saveModule(mod);

        // 3. Create Lessons (Sections) & Quizzes
        for (let i = 0; i < (exam.sections || []).length; i++) {
          const section = exam.sections[i];
          const lessonId = `les-${i}-${generateId()}`;
          
          // Clean dethitiengnhat from description
          const rawDesc = section.title || '';
          const cleanDesc = rawDesc.replace(/\s*-\s*dethitiengnhat\.com/gi, "").trim();

          const lesson: Lesson = {
            id: lessonId,
            moduleId: moduleId,
            name: section.section_name || `Section ${i + 1}`,
            description: cleanDesc,
            order: i + 1,
            createdAt: now,
            icon: "check-square"
          };
          await saveLesson(lesson);

          // Quiz Pack
          const packId = `qp-${lessonId}`;
          const qp: QuizPack = {
            id: packId,
            lessonId: lessonId,
            name: section.section_name,
            createdAt: now
          };
          await saveQuizPack(qp);

          // Quizzes
          const quizzes: Quiz[] = (section.questions || []).map(q => {
            // Robust Choice Mapping
            let options: string[] = [];
            if (Array.isArray(q.choices)) {
              options = q.choices;
            } else if (typeof q.choices === 'object') {
              const keys = Object.keys(q.choices).sort((a, b) => parseInt(a) - parseInt(b));
              options = keys.map(k => (q.choices as any)[k]);
            }

            // Robust Answer Mapping
            let answer = q.correct_text;
            if (!answer && q.correct_answer && q.choices) {
              answer = (q.choices as any)[q.correct_answer];
            }
            if (!answer && options.length > 0) {
              const idx = parseInt(q.correct_answer as string) - 1;
              if (idx >= 0 && idx < options.length) answer = options[idx];
            }

            return {
              id: `q-${generateId()}`,
              question: q.question,
              options,
              answer: answer || '',
              type: "multiple-choice",
              lessonId,
              packId,
              createdAt: now
            };
          });

          if (quizzes.length > 0) {
            await saveQuizzesBulk(quizzes);
          }
        }
      }

      Alert.alert("Berhasil!", `Import ${preview?.totalQuestions} soal dari ${preview?.totalExams} ujian selesai.`);
      router.back();
    } catch (e: any) {
      console.warn("[ImportJLPT] error", e);
      Alert.alert("Error", e.message || "Gagal melakukan import.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: Platform.OS === "web" ? 80 : insets.top + 16, paddingBottom: 60 },
      ]}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>JLPT Smart Import</Text>
          <Text style={styles.headerSub}>Impor soal JLPT dari format JSON kustom</Text>
        </View>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <X size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <LinearGradient colors={[colors.primary, colors.purple]} style={styles.infoCard} start={{x:0, y:0}} end={{x:1, y:0}}>
        <HelpCircle size={20} color="#fff" />
        <Text style={styles.infoText}>Format ini mendukung JSON JLPT nested. Sistem akan otomatis menyesuaikan struktur soal.</Text>
      </LinearGradient>

      {showImport ? (
        <View style={styles.section}>
          <View style={styles.fieldHeader}>
            <Text style={styles.fieldLabel}>JSON Data</Text>
            <TouchableOpacity onPress={handlePaste} style={styles.pasteBtn}>
              <Copy size={14} color={colors.primary} />
              <Text style={styles.pasteBtnText}>Paste</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.inputContainer}>
            <TextInput
              value={jsonText}
              onChangeText={(t) => { setJsonText(t); setParseError(null); setPreview(null); }}
              placeholder={'[ { "level": "N2", "sections": [...] } ]'}
              style={styles.jsonInput}
              placeholderTextColor={colors.textMuted}
              multiline
              autoCorrect={false}
              numberOfLines={6}
            />
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.fileBtn} onPress={handlePickFile}>
              <Download size={16} color={colors.primary} />
              <Text style={styles.fileBtnText}>Buka File</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.parseBtnSmall}
              onPress={handleParsePreview}
              activeOpacity={0.85}
            >
              <Layers size={16} color="#fff" />
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff" }}>Analisa</Text>
            </TouchableOpacity>
          </View>

          {parseError && (
            <View style={styles.errorBox}>
              <AlertCircle size={16} color={colors.danger} />
              <Text style={styles.errorText}>{parseError}</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <CheckCircle2 size={24} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.previewTitle}>Ringkasan Konten</Text>
              <Text style={styles.previewSub}>Ditemukan {preview?.totalQuestions} pertanyaan.</Text>
            </View>
            <TouchableOpacity onPress={() => setShowImport(true)} style={styles.editBtn}>
              <Text style={styles.editBtnText}>Edit JSON</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{preview?.totalExams}</Text>
              <Text style={styles.statLabel}>Ujian</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{preview?.totalQuestions}</Text>
              <Text style={styles.statLabel}>Soal</Text>
            </View>
          </View>

          <View style={styles.examList}>
            {preview?.exams.map((exam, ei) => {
              const isExpanded = !!expandedExams[ei];
              return (
                <View key={ei} style={styles.examItem}>
                  <TouchableOpacity 
                    style={styles.examHeader} 
                    onPress={() => toggleExam(ei)}
                    activeOpacity={0.7}
                  >
                    <BookOpen size={16} color={colors.primary} />
                    <Text style={styles.examName}>JLPT {exam.level} - Exam #{exam.number}</Text>
                    {isExpanded ? <ChevronUp size={14} color={colors.textMuted} /> : <ChevronDown size={14} color={colors.textMuted} />}
                  </TouchableOpacity>
                  
                  {isExpanded && (
                    <View style={styles.secList}>
                      {exam.sections.map((sec, si) => (
                        <View key={si} style={styles.secRow}>
                          <Text style={styles.secName} numberOfLines={1}>{sec.name}</Text>
                          <Text style={styles.secCount}>{sec.qCount} soal</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          <View style={styles.previewBtns}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowImport(true)}>
              <Text style={styles.cancelBtnText}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.importBtn, busy && { opacity: 0.7 }]} 
              onPress={doImport}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.importBtnText}>Impor Sekarang</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </KeyboardAwareScrollViewCompat>
  );
}

const makeStyles = (c: ColorScheme, isDark: boolean, palette: string) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: 20 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  headerTitle: { fontSize: 24, fontWeight: "900", color: c.text },
  headerSub: { fontSize: 13, color: c.textMuted, fontWeight: "600" },
  closeBtn: { padding: 8, backgroundColor: c.surface, borderRadius: 12 },
  
  infoCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 16, marginBottom: 20 },
  infoText: { flex: 1, fontSize: 12, color: "#fff", fontWeight: "600", lineHeight: 18 },

  section: { gap: 12 },
  fieldHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: -4 },
  fieldLabel: { fontSize: 14, fontWeight: "800", color: c.text },
  pasteBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: c.primaryLight, borderRadius: 8 },
  pasteBtnText: { fontSize: 11, fontWeight: "700", color: c.primary },

  inputContainer: { 
    backgroundColor: c.surface, borderRadius: 16, minHeight: 150, 
    borderWidth: 1, borderColor: c.border, overflow: "hidden" 
  },
  jsonInput: {
    padding: 16, color: c.text,
    fontSize: 13, height: 150, textAlignVertical: "top",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace"
  },
  
  actionRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  fileBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border },
  fileBtnText: { color: c.primary, fontWeight: "700", fontSize: 14 },
  
  parseBtnSmall: { 
    flex: 1.2, backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8
  },

  errorBox: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.dangerLight, padding: 12, borderRadius: 12 },
  errorText: { flex: 1, fontSize: 12, color: c.danger, fontWeight: "600" },

  previewCard: { backgroundColor: c.surface, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: c.border, gap: 16 },
  previewHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  previewTitle: { fontSize: 18, fontWeight: "900", color: c.text },
  previewSub: { fontSize: 12, color: c.textMuted, fontWeight: "600" },
  editBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: c.background, borderWidth: 1, borderColor: c.border },
  editBtnText: { fontSize: 11, fontWeight: "700", color: c.textSecondary },

  statRow: { flexDirection: "row", backgroundColor: c.background, borderRadius: 16, padding: 12, justifyContent: "space-around" },
  statBox: { alignItems: "center" },
  statNum: { fontSize: 18, fontWeight: "900", color: c.primary },
  statLabel: { fontSize: 10, fontWeight: "700", color: c.textMuted, textTransform: "uppercase" },

  examList: { gap: 8 },
  examItem: { 
    backgroundColor: c.background, borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: c.border
  },
  examHeader: { 
    flexDirection: "row", alignItems: "center", gap: 8, 
    padding: 12, backgroundColor: c.surface 
  },
  examName: { fontSize: 13, fontWeight: "800", color: c.text, flex: 1 },
  secList: { padding: 4, gap: 2, backgroundColor: c.background },
  secRow: { 
    flexDirection: "row", justifyContent: "space-between", 
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: c.surface, marginHorizontal: 4, marginVertical: 2
  },
  secName: { fontSize: 11, color: c.textSecondary, fontWeight: "600", flex: 1 },
  secCount: { fontSize: 10, color: c.primary, fontWeight: "800" },

  previewBtns: { flexDirection: "row", gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  cancelBtnText: { color: c.textMuted, fontWeight: "700" },
  importBtn: { flex: 2, backgroundColor: c.success, borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  importBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 }
});

