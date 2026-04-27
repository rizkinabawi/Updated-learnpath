import { useColors, useTheme } from "@/contexts/ThemeContext";
import React, { useEffect, useState, useMemo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Platform, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import {
  getLearningPaths, getModules, getLessons, getQuizzes,
  type LearningPath, type Module, type Lesson,
} from "@/utils/storage";
import { shadowSm, type ColorScheme } from "@/constants/colors";
import { useTranslation } from "@/contexts/LanguageContext";
import { QuickAddQuizModal } from "@/components/QuickAddQuizModal";
import { isFeatureAllowed } from "@/utils/security/app-license";
import { exportQuizzesToPDF, exportMultipleQuizzesToPDF } from "@/utils/flashcard-export";
import { Alert } from "react-native";

interface LessonRow {
  path: LearningPath;
  module: Module;
  lesson: Lesson;
  count: number;
}

const makeGrad = (colors: ColorScheme): [string, string][] => [
  [colors.accent, colors.amber],
  [colors.primary, colors.purple],
  [colors.purple, "#A855F7"],
  [colors.teal, "#0EA5E9"],
  [colors.emerald, colors.success],
  [colors.amber, colors.danger],
];

export default function QuizBrowseAll() {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  const GRAD = useMemo(() => makeGrad(colors), [colors]);

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [rows, setRows] = useState<LessonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selMode, setSelMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadAll();
  }, []);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBatchExport = async () => {
    if (selectedIds.size === 0) return;

    const allowed = await isFeatureAllowed("bundle");
    if (!allowed) {
      Alert.alert("Fitur Premium", "Ekspor Batch PDF hanya tersedia di versi Premium.");
      return;
    }

    setExporting(true);
    try {
      const batches: { topic: string; items: any[] }[] = [];
      for (const id of selectedIds) {
        const row = rows.find(r => r.lesson.id === id);
        if (row) {
          const quizzes = await getQuizzes(id);
          batches.push({ topic: row.lesson.name, items: quizzes });
        }
      }
      await exportMultipleQuizzesToPDF("Batch Exam", batches);
      setSelMode(false);
      setSelectedIds(new Set());
    } catch (e) {
      Alert.alert("Gagal", "Ekspor batch kuis gagal.");
    } finally {
      setExporting(false);
    }
  };

  const handleExportExamPDF = async (id: string, name: string) => {
    if (exporting) return;

    const allowed = await isFeatureAllowed("bundle");
    if (!allowed) {
      Alert.alert("Fitur Premium", "Ekspor Lembar Ujian PDF hanya tersedia di versi Premium.");
      return;
    }

    setExporting(true);
    try {
      const quizzes = await getQuizzes(id);
      if (quizzes.length === 0) {
        Alert.alert("Kosong", "Tidak ada kuis untuk diekspor.");
        return;
      }
      await exportQuizzesToPDF(name, quizzes as any[], id, false);
    } catch (e) {
      Alert.alert("Gagal", "Terjadi kesalahan saat mengekspor Lembar Ujian.");
    } finally {
      setExporting(false);
    }
  };

  const handleExportExamShuffled = async (id: string, name: string) => {
    if (exporting) return;

    const allowed = await isFeatureAllowed("bundle");
    if (!allowed) {
      Alert.alert("Fitur Premium", "Ekspor Lembar Ujian Teracak hanya tersedia di versi Premium.");
      return;
    }

    setExporting(true);
    try {
      const quizzes = await getQuizzes(id);
      if (quizzes.length === 0) {
        Alert.alert("Kosong", "Tidak ada kuis untuk diekspor.");
        return;
      }
      // Shuffle mode enabled
      await exportQuizzesToPDF(name, quizzes as any[], id, true);
    } catch (e) {
      Alert.alert("Gagal", "Terjadi kesalahan saat mengekspor Lembar Ujian Teracak.");
    } finally {
      setExporting(false);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    const paths = await getLearningPaths();
    const result: LessonRow[] = [];
    for (const path of paths) {
      const mods = (await getModules(path.id)).sort((a, b) => a.order - b.order);
      for (const mod of mods) {
        const lessonList = (await getLessons(mod.id)).sort((a, b) => a.order - b.order);
        for (const lesson of lessonList) {
          const quizzes = await getQuizzes(lesson.id);
          if (quizzes.length > 0) {
            result.push({ path, module: mod, lesson, count: quizzes.length });
          }
        }
      }
    }
    setRows(result);
    if (result.length > 0) {
      setExpanded({ [result[0].path.id]: true });
    }
    setLoading(false);
  };

  const grouped = useMemo(() => {
    const filtered = rows.filter((r) => {
      const q = search.toLowerCase();
      return (
        r.path.name.toLowerCase().includes(q) ||
        r.module.name.toLowerCase().includes(q) ||
        r.lesson.name.toLowerCase().includes(q)
      );
    });
    const map: Record<string, { path: LearningPath; modules: Record<string, { module: Module; lessons: LessonRow[] }> }> = {};
    for (const row of filtered) {
      if (!map[row.path.id]) map[row.path.id] = { path: row.path, modules: {} };
      if (!map[row.path.id].modules[row.module.id])
        map[row.path.id].modules[row.module.id] = { module: row.module, lessons: [] };
      map[row.path.id].modules[row.module.id].lessons.push(row);
    }
    return Object.values(map);
  }, [rows, search]);

  const totalQuizzes = rows.reduce((s, r) => s + r.count, 0);
  const pathColors = useMemo(() => {
    const map: Record<string, [string, string]> = {};
    rows.forEach((r, i) => { if (!map[r.path.id]) map[r.path.id] = GRAD[i % GRAD.length]; });
    return map;
  }, [rows]);

  return (
    <View style={styles.root}>
      <QuickAddQuizModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSaved={loadAll}
      />

      {/* FAB */}
      {selMode ? (
        <TouchableOpacity
          style={[styles.batchFab, { bottom: insets.bottom + 24, opacity: selectedIds.size > 0 ? 1 : 0.6 }]}
          onPress={handleBatchExport}
          disabled={selectedIds.size === 0 || exporting}
          activeOpacity={0.85}
        >
          {exporting ? <ActivityIndicator color="#fff" /> : <Feather name="download" size={24} color="#fff" />}
          <View style={styles.batchCount}><Text style={styles.batchCountText}>{selectedIds.size}</Text></View>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 24 }]}
          onPress={() => setShowAdd(true)}
          activeOpacity={0.85}
        >
          <Feather name="plus" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      <LinearGradient
        colors={[colors.accent, colors.amber]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: Platform.OS === "web" ? 56 : insets.top + 12 }]}
      >
        <View style={styles.blob1} />
        <View style={styles.blob2} />
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerSub}>{t.common.quiz.toUpperCase()}</Text>
            <Text style={styles.headerTitle}>{t.browse.quiz_header}</Text>
          </View>
          <TouchableOpacity 
            style={[styles.backBtn, { marginRight: 8, backgroundColor: selMode ? colors.primary : "rgba(255,255,255,0.2)" }]} 
            onPress={() => { setSelMode(!selMode); setSelectedIds(new Set()); }}
          >
            <Feather name={selMode ? "x" : "check-square"} size={18} color="#fff" />
          </TouchableOpacity>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{totalQuizzes}</Text>
            <Text style={styles.countBadgeSub}>{t.common.quiz.toLowerCase()}</Text>
          </View>
        </View>

        <View style={styles.searchWrap}>
          <Feather name="search" size={15} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t.browse.search_ph}
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.loadingText}>{t.common.loading}</Text>
        </View>
      ) : grouped.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>❓</Text>
          <Text style={styles.emptyTitle}>
            {rows.length === 0 ? t.browse.empty_quiz : t.browse.not_found}
          </Text>
          <Text style={styles.emptySub}>
            {rows.length === 0 ? t.browse.quiz_empty_sub : t.browse.try_other}
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
          {grouped.map(({ path, modules }) => {
            const isOpen = !!expanded[path.id];
            const grad = pathColors[path.id] ?? GRAD[0];
            const total = Object.values(modules).reduce((s, m) => s + m.lessons.reduce((ss, l) => ss + l.count, 0), 0);

            return (
              <View key={path.id} style={[styles.courseCard, shadowSm]}>
                <TouchableOpacity
                  style={styles.courseHeader}
                  onPress={() => setExpanded((p) => ({ ...p, [path.id]: !p[path.id] }))}
                  activeOpacity={0.75}
                >
                  <LinearGradient colors={grad} style={styles.courseIcon}>
                    <Text style={{ fontSize: 18 }}>{path.name.charAt(0).toUpperCase()}</Text>
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.courseName} numberOfLines={1}>{path.name}</Text>
                    <Text style={styles.courseMeta}>
                      {Object.keys(modules).length} {t.common.modules} · {total} {t.common.quiz}
                    </Text>
                  </View>
                  <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
                </TouchableOpacity>

                {isOpen && Object.values(modules).map(({ module, lessons }) => (
                  <View key={module.id} style={styles.moduleWrap}>
                    <View style={styles.moduleLabel}>
                      <View style={[styles.moduleDot, { backgroundColor: grad[0] }]} />
                      <Text style={styles.moduleName} numberOfLines={1}>{module.name}</Text>
                    </View>
                    {lessons.map((row) => (
                      <TouchableOpacity
                        key={row.lesson.id}
                        style={[styles.lessonRow, { opacity: row.count === 0 ? 0.5 : 1 }, selectedIds.has(row.lesson.id) && { backgroundColor: colors.accent + "15", borderColor: colors.accent, borderWidth: 1 }]}
                        onPress={() => {
                          if (selMode) toggleSelect(row.lesson.id);
                          else if (row.count > 0) router.push(`/quiz/${row.lesson.id}`);
                        }}
                        activeOpacity={0.7}
                      >
                        {selMode && (
                          <Feather name={selectedIds.has(row.lesson.id) ? "check-square" : "square"} size={18} color={selectedIds.has(row.lesson.id) ? colors.accent : colors.textMuted} style={{ marginRight: 10 }} />
                        )}
                        <View style={styles.lessonLeft}>
                          <View style={styles.lessonDot} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.lessonName} numberOfLines={1}>{row.lesson.name}</Text>
                            {row.lesson.description ? (
                              <Text style={styles.lessonDesc} numberOfLines={1}>{row.lesson.description}</Text>
                            ) : null}
                          </View>
                        </View>
                        <View style={styles.lessonRight}>
                          {row.count > 0 ? (
                            <>
                              <View style={[styles.countChip, { backgroundColor: grad[0] + "18" }]}>
                                <Text style={[styles.countChipText, { color: grad[0] }]}>{row.count}</Text>
                              </View>
                              <TouchableOpacity 
                                style={[styles.startBtn, { backgroundColor: colors.surface, borderStyle: "dashed", borderWidth: 1, borderColor: grad[0] + "80", marginRight: 4 }]}
                                onPress={() => handleExportExamShuffled(row.lesson.id, row.lesson.name)}
                              >
                                <Feather name="shuffle" size={12} color={grad[0]} />
                              </TouchableOpacity>
                              <TouchableOpacity 
                                style={[styles.startBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: grad[0] + "40", marginRight: 4 }]}
                                onPress={() => handleExportExamPDF(row.lesson.id, row.lesson.name)}
                              >
                                <Feather name="file-text" size={12} color={grad[0]} />
                              </TouchableOpacity>
                              <View style={[styles.startBtn, { backgroundColor: grad[0] }]}>
                                <Feather name="play" size={11} color="#fff" />
                              </View>
                            </>
                          ) : (
                            <Text style={styles.emptyChip}>Kosong</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (c: ColorScheme, isDark: boolean, palette: string) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  header: { paddingHorizontal: 20, paddingBottom: 20, overflow: "hidden" },
  blob1: { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)", top: -50, right: -40 },
  blob2: { position: "absolute", width: 110, height: 110, borderRadius: 55, backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)", bottom: -20, left: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerSub: { fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  headerTitle: { fontSize: 22, fontWeight: "900", color: "#fff", letterSpacing: -0.3 },
  countBadge: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" },
  countBadgeText: { fontSize: 20, fontWeight: "900", color: "#fff" },
  countBadgeSub: { fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: "700" },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: c.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, borderColor: c.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: c.text, fontWeight: "500" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14, color: c.textMuted, fontWeight: "600" },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: c.text, textAlign: "center" },
  emptySub: { fontSize: 14, color: c.textMuted, fontWeight: "500", textAlign: "center", lineHeight: 20 },
  list: { padding: 16, paddingBottom: 40, gap: 12 },
  courseCard: { backgroundColor: c.surface, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: c.border },
  courseHeader: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  courseIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  courseName: { fontSize: 15, fontWeight: "800", color: c.text },
  courseMeta: { fontSize: 12, color: c.textMuted, fontWeight: "600", marginTop: 2 },
  moduleWrap: { borderTopWidth: 1, borderTopColor: c.border, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  moduleLabel: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  moduleDot: { width: 8, height: 8, borderRadius: 4 },
  moduleName: { fontSize: 12, fontWeight: "800", color: c.textSecondary, flex: 1 },
  lessonRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 10, paddingLeft: 16, paddingRight: 4,
    borderRadius: 12, marginBottom: 4,
    backgroundColor: c.background,
  },
  lessonLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  lessonDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.border, flexShrink: 0 },
  lessonName: { fontSize: 13, fontWeight: "700", color: c.text },
  lessonDesc: { fontSize: 11, color: c.textMuted, fontWeight: "500", marginTop: 1 },
  lessonRight: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 8 },
  countChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  countChipText: { fontSize: 11, fontWeight: "800" },
  startBtn: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  emptyChip: { fontSize: 11, color: c.textMuted, fontWeight: "600" },
  fab: {
    position: "absolute", right: 20, width: 56, height: 56, borderRadius: 18,
    backgroundColor: c.accent, alignItems: "center", justifyContent: "center",
    zIndex: 50, shadowColor: c.accent, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 10,
  },
  batchFab: { position: "absolute", right: 20, width: 64, height: 64, borderRadius: 24, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", zIndex: 60, shadowColor: c.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 12 },
  batchCount: { position: "absolute", top: -5, right: -5, width: 24, height: 24, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.accent },
  batchCountText: { fontSize: 12, fontWeight: "900", color: c.accent },
});
