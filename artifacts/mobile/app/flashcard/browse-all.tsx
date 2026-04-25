import { useColors, useTheme } from "@/contexts/ThemeContext";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Platform, ActivityIndicator, Modal, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import {
  getLearningPaths, getModules, getLessons, getFlashcards,
  getAllFlashcardsGroupedByLesson,
  getStandaloneCollections, saveStandaloneCollection,
  deleteStandaloneCollection, assignStandaloneCollection,
  type LearningPath, type Module, type Lesson, type StandaloneCollection,
} from "@/utils/storage";
import Colors, { shadowSm, type ColorScheme } from "@/constants/colors";
import { useTranslation } from "@/contexts/LanguageContext";
import { QuickAddFlashcardModal } from "@/components/QuickAddFlashcardModal";

interface LessonRow {
  path: LearningPath;
  module: Module;
  lesson: Lesson;
  count: number;
}

interface CollectionRow {
  col: StandaloneCollection;
  count: number;
}

const makeGrad = (colors: ColorScheme): [string, string][] => [
  [colors.primary, colors.purple],
  [colors.accent, colors.amber],
  [colors.teal, "#0EA5E9"],
  [colors.purple, "#A855F7"],
  [colors.emerald, colors.success],
  [colors.amber, colors.danger],
];

const makeColGrads = (colors: ColorScheme): [string, string][] => [
  [colors.emerald, colors.success],
  ["#6366F1", colors.purple],
  [colors.amber, colors.danger],
  [colors.teal, "#0EA5E9"],
  ["#EC4899", "#F43F5E"],
  ["#14B8A6", "#0D9488"],
];

// ─── Collection Edit Modal ───────────────────────────────────────
function CollectionEditModal({
  col,
  styles,
  onClose,
  onSaved,
}: {
  col: StandaloneCollection;
  styles: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const colors = useColors();
  const [name, setName] = useState(col.name);
  const [desc, setDesc] = useState(col.description ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await saveStandaloneCollection({ ...col, name: name.trim(), description: desc.trim() || undefined });
      onSaved();
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.emOverlay}>
        <View style={styles.emSheet}>
          <View style={styles.emHandle} />
          <View style={styles.emHeader}>
            <Text style={styles.emTitle}>Edit Koleksi</Text>
            <TouchableOpacity style={styles.emIconBtn} onPress={onClose}>
              <Feather name="x" size={20} color={colors.dark} />
            </TouchableOpacity>
          </View>
          <View style={styles.emBody}>
            <Text style={styles.emLabel}>Nama Koleksi *</Text>
            <TextInput
              style={styles.emInput}
              value={name}
              onChangeText={setName}
              placeholder="Nama koleksi…"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.emLabel}>Deskripsi <Text style={styles.emOptional}>(opsional)</Text></Text>
            <TextInput
              style={[styles.emInput, { minHeight: 76 }]}
              value={desc}
              onChangeText={setDesc}
              placeholder="Deskripsi singkat…"
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[styles.emSaveBtn, (!name.trim() || saving) && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={!name.trim() || saving}
            >
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="check" size={17} color="#fff" />}
              <Text style={styles.emSaveBtnText}>{saving ? "Menyimpan…" : "Simpan Perubahan"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Collection Assign Modal (cascade: Course → Module → Lesson) ─
function CollectionAssignModal({
  col,
  count,
  styles,
  onClose,
  onAssigned,
}: {
  col: StandaloneCollection;
  count: number;
  styles: any;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const colors = useColors();
  const [courses, setCourses] = useState<LearningPath[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [step, setStep] = useState<"course" | "module" | "lesson">("course");
  const [selCourse, setSelCourse] = useState<LearningPath | null>(null);
  const [selModule, setSelModule] = useState<Module | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { getLearningPaths().then(setCourses); }, []);

  useEffect(() => {
    if (!selCourse) return;
    getModules(selCourse.id).then((m) => setModules(m.sort((a, b) => a.order - b.order)));
  }, [selCourse]);

  useEffect(() => {
    if (!selModule) return;
    getLessons(selModule.id).then((l) => setLessons(l.sort((a, b) => a.order - b.order)));
  }, [selModule]);

  const handleAssign = async (lesson: Lesson) => {
    setSaving(true);
    try {
      await assignStandaloneCollection(col.id, lesson.id);
      onAssigned();
      onClose();
    } catch { setSaving(false); }
  };

  const stepTitle = step === "course" ? "Pilih Kursus" : step === "module" ? "Pilih Modul" : "Pilih Pelajaran";
  const items = step === "course" ? courses : step === "module" ? modules : lessons;
  const getLabel = (item: any) => item.name ?? "";
  const getSub = (item: any) => item.description ?? "";

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.amOverlay}>
        <View style={styles.amSheet}>
          <View style={styles.amHandle} />
          <View style={styles.amHeader}>
            {step !== "course" ? (
              <TouchableOpacity style={styles.amBackBtn} onPress={() => setStep(step === "module" ? "course" : "module")}>
                <Feather name="arrow-left" size={18} color={colors.text} />
              </TouchableOpacity>
            ) : <View style={{ width: 34 }} />}
            <Text style={styles.amTitle} numberOfLines={1}>{stepTitle}</Text>
            <TouchableOpacity style={styles.amBackBtn} onPress={onClose}>
              <Feather name="x" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          <Text style={styles.amColPreview} numberOfLines={2}>
            Assign "{col.name}" ({count} kartu) ke pelajaran tujuan
          </Text>

          {saving ? (
            <View style={styles.amLoadingWrap}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Memindahkan…</Text>
            </View>
          ) : items.length === 0 ? (
            <View style={styles.amEmpty}>
              <Feather name="inbox" size={28} color={colors.textMuted} />
              <Text style={styles.amEmptyText}>Tidak ada data</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.amList}>
              {items.map((item: any) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.amItem, shadowSm]}
                  onPress={() => {
                    if (step === "course") { setSelCourse(item); setStep("module"); }
                    else if (step === "module") { setSelModule(item); setStep("lesson"); }
                    else handleAssign(item);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.amItemLabel}>{getLabel(item)}</Text>
                    {getSub(item) ? <Text style={styles.amItemSub} numberOfLines={1}>{getSub(item)}</Text> : null}
                  </View>
                  <Feather name={step === "lesson" ? "check-circle" : "chevron-right"} size={16} color={step === "lesson" ? colors.success : colors.textMuted} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ────────────────────────────────────────────────
export default function FlashcardBrowseAll() {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const GRAD = makeGrad(colors);
  const COL_GRADS = makeColGrads(colors);
  const [rows, setRows] = useState<LessonRow[]>([]);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [editCol, setEditCol] = useState<StandaloneCollection | null>(null);
  const [assignCol, setAssignCol] = useState<CollectionRow | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    // Single pass: load courses + collections + ALL flashcard counts in one
    // shot. The previous version called `getFlashcards(lesson.id)` inside a
    // nested loop, which re-deserialized the entire AsyncStorage blob for
    // every lesson/collection — N+1 read amplification that crashed on
    // accounts with thousands of cards spread across many lessons.
    const [paths, cols, cardCounts] = await Promise.all([
      getLearningPaths(),
      getStandaloneCollections("flashcard"),
      getAllFlashcardsGroupedByLesson(),
    ]);

    // Build collection rows from the precomputed count map (O(1) per row).
    const colRows: CollectionRow[] = cols.map((col) => ({
      col,
      count: cardCounts.get(col.id) ?? 0,
    }));
    setCollections(colRows.sort((a, b) => b.col.createdAt.localeCompare(a.col.createdAt)));

    // Build course-linked rows. Modules / lessons are still loaded per path
    // because they live in their own (small) AsyncStorage keys; the heavy
    // flashcard read no longer happens here.
    const result: LessonRow[] = [];
    for (const path of paths) {
      const mods = (await getModules(path.id)).sort((a, b) => a.order - b.order);
      for (const mod of mods) {
        const lessonList = (await getLessons(mod.id)).sort((a, b) => a.order - b.order);
        for (const lesson of lessonList) {
          result.push({ path, module: mod, lesson, count: cardCounts.get(lesson.id) ?? 0 });
        }
      }
    }
    setRows(result);
    if (result.length > 0) setExpanded({ [result[0].path.id]: true });
    setLoading(false);
  }, []);

  // Group course rows by path
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

  const filteredCollections = useMemo(() => {
    if (!search) return collections;
    const q = search.toLowerCase();
    return collections.filter(
      (c) => c.col.name.toLowerCase().includes(q) || (c.col.description ?? "").toLowerCase().includes(q)
    );
  }, [collections, search]);

  const totalCards = rows.reduce((s, r) => s + r.count, 0) + collections.reduce((s, c) => s + c.count, 0);

  const pathColors = useMemo(() => {
    const map: Record<string, [string, string]> = {};
    rows.forEach((r, i) => { if (!map[r.path.id]) map[r.path.id] = GRAD[i % GRAD.length]; });
    return map;
  }, [rows]);

  const handleDeleteCollection = (col: StandaloneCollection) => {
    Alert.alert(
      "Hapus Koleksi?",
      `"${col.name}" dan semua isinya akan dihapus permanen.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            await deleteStandaloneCollection(col.id);
            loadAll();
          },
        },
      ]
    );
  };

  const hasContent = grouped.length > 0 || filteredCollections.length > 0;

  return (
    <View style={styles.root}>
      {/* Modals */}
      <QuickAddFlashcardModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSaved={loadAll}
      />
      {editCol && (
        <CollectionEditModal
          col={editCol}
          styles={styles}
          onClose={() => setEditCol(null)}
          onSaved={loadAll}
        />
      )}
      {assignCol && (
        <CollectionAssignModal
          col={assignCol.col}
          count={assignCol.count}
          styles={styles}
          onClose={() => setAssignCol(null)}
          onAssigned={loadAll}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => setShowAdd(true)}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Header */}
      <LinearGradient
        colors={[colors.primary, colors.purple]}
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
            <Text style={styles.headerSub}>{t.common.cards.toUpperCase()}</Text>
            <Text style={styles.headerTitle}>{t.browse.flash_header}</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{totalCards}</Text>
            <Text style={styles.countBadgeSub}>{t.common.cards.toLowerCase()}</Text>
          </View>
        </View>

        {/* Search */}
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
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>{t.common.loading}</Text>
        </View>
      ) : !hasContent ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>🃏</Text>
          <Text style={styles.emptyTitle}>
            {(rows.length === 0 && collections.length === 0) ? t.browse.empty_flash : t.browse.not_found}
          </Text>
          <Text style={styles.emptySub}>
            {(rows.length === 0 && collections.length === 0) ? t.browse.flash_empty_sub : t.browse.try_other}
          </Text>
          <TouchableOpacity
            style={styles.emptyFabHint}
            onPress={() => setShowAdd(true)}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.emptyFabHintText}>Tambah Flashcard Pertama</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>

          {/* ── Koleksi Pribadi (standalone collections) ── */}
          {filteredCollections.length > 0 && (
            <View style={styles.sectionWrap}>
              <View style={styles.sectionHeader}>
                <LinearGradient colors={[colors.emerald, colors.success]} style={styles.sectionIcon}>
                  <Feather name="folder" size={16} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Koleksi Pribadi</Text>
                  <Text style={styles.sectionMeta}>{filteredCollections.length} koleksi · Tidak terikat kursus</Text>
                </View>
              </View>

              <View style={styles.collectionGrid}>
                {filteredCollections.map((cr, idx) => {
                  const grad = COL_GRADS[idx % COL_GRADS.length];
                  const createdDate = new Date(cr.col.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
                  return (
                    <TouchableOpacity
                      key={cr.col.id}
                      style={[styles.colCard, shadowSm]}
                      onPress={() => cr.count > 0 && router.push(`/flashcard/${cr.col.id}` as any)}
                      activeOpacity={0.8}
                    >
                      {/* Color accent bar */}
                      <LinearGradient colors={grad} style={styles.colCardBar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />

                      {/* Card body */}
                      <View style={styles.colCardBody}>
                        <View style={styles.colCardTop}>
                          <LinearGradient colors={grad} style={styles.colCardIcon}>
                            <Feather name="layers" size={18} color="#fff" />
                          </LinearGradient>
                          <View style={styles.colBadge}>
                            <Text style={[styles.colBadgeText, { color: grad[0] }]}>FLASHCARD</Text>
                          </View>
                        </View>

                        <Text style={styles.colCardName} numberOfLines={2}>{cr.col.name}</Text>
                        {cr.col.description ? (
                          <Text style={styles.colCardDesc} numberOfLines={1}>{cr.col.description}</Text>
                        ) : null}

                        <View style={styles.colCardMeta}>
                          <View style={[styles.countPill, { backgroundColor: grad[0] + "18" }]}>
                            <Text style={[styles.countPillText, { color: grad[0] }]}>{cr.count} kartu</Text>
                          </View>
                          <Text style={styles.colCardDate}>{createdDate}</Text>
                        </View>
                      </View>

                      {/* Action row */}
                      <View style={styles.colCardActions}>
                        <TouchableOpacity
                          style={styles.colAction}
                          onPress={() => setEditCol(cr.col)}
                          activeOpacity={0.7}
                        >
                          <Feather name="edit-2" size={14} color={colors.textSecondary} />
                          <Text style={styles.colActionText}>Edit</Text>
                        </TouchableOpacity>

                        <View style={styles.colActionDivider} />

                        <TouchableOpacity
                          style={styles.colAction}
                          onPress={() => setAssignCol(cr)}
                          activeOpacity={0.7}
                        >
                          <Feather name="folder-plus" size={14} color={colors.primary} />
                          <Text style={[styles.colActionText, { color: colors.primary }]}>Assign</Text>
                        </TouchableOpacity>

                        <View style={styles.colActionDivider} />

                        {cr.count > 0 && (
                          <>
                            <TouchableOpacity
                              style={styles.colAction}
                              onPress={() => router.push(`/flashcard/${cr.col.id}` as any)}
                              activeOpacity={0.7}
                            >
                              <Feather name="play" size={14} color={colors.success} />
                              <Text style={[styles.colActionText, { color: colors.success }]}>Main</Text>
                            </TouchableOpacity>
                            <View style={styles.colActionDivider} />
                          </>
                        )}

                        <TouchableOpacity
                          style={styles.colAction}
                          onPress={() => handleDeleteCollection(cr.col)}
                          activeOpacity={0.7}
                        >
                          <Feather name="trash-2" size={14} color={colors.danger} />
                          <Text style={[styles.colActionText, { color: colors.danger }]}>Hapus</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── Course-linked flashcards ── */}
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
                      {Object.keys(modules).length} {t.common.modules} · {total} {t.common.cards}
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
                        style={[styles.lessonRow, { opacity: row.count === 0 ? 0.5 : 1 }]}
                        onPress={() => {
                          if (row.count > 0) router.push(`/flashcard/${row.lesson.id}` as any);
                        }}
                        activeOpacity={0.7}
                      >
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
                                <Text style={[styles.countChipText, { color: grad[0] }]}>{row.count} kartu</Text>
                              </View>
                              <View style={[styles.startBtn, { backgroundColor: grad[0] }]}>
                                <Feather name="play" size={12} color="#fff" />
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

const makeStyles = (c: ColorScheme, isDark: boolean) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  header: { paddingHorizontal: 20, paddingBottom: 20, overflow: "hidden" },
  blob1: { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: isDark ? "rgba(74,158,255,0.05)" : "rgba(74,158,255,0.1)", top: -50, right: -40 },
  blob2: { position: "absolute", width: 110, height: 110, borderRadius: 55, backgroundColor: isDark ? "rgba(108,99,255,0.04)" : "rgba(108,99,255,0.08)", bottom: -20, left: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerSub: { fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  headerTitle: { fontSize: 22, fontWeight: "900", color: c.white, letterSpacing: -0.3 },
  countBadge: { backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" },
  countBadgeText: { fontSize: 20, fontWeight: "900", color: "#fff" },
  countBadgeSub: { fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: "700" },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: c.border },
  searchInput: { flex: 1, fontSize: 14, color: c.text, fontWeight: "500" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14, color: c.textMuted, fontWeight: "600" },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: c.text, textAlign: "center" },
  emptySub: { fontSize: 14, color: c.textMuted, fontWeight: "500", textAlign: "center", lineHeight: 20 },
  emptyFabHint: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, backgroundColor: c.primary, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 },
  emptyFabHintText: { fontSize: 14, fontWeight: "800", color: "#fff" },
  list: { padding: 16, paddingBottom: 100, gap: 16 },
  fab: { position: "absolute", right: 20, width: 56, height: 56, borderRadius: 18, backgroundColor: c.primary, alignItems: "center", justifyContent: "center", zIndex: 50, shadowColor: c.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 10 },

  // ── Standalone Collections Section ──
  sectionWrap: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 4 },
  sectionIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: c.text },
  sectionMeta: { fontSize: 12, color: c.textMuted, fontWeight: "600", marginTop: 2 },
  collectionGrid: { gap: 10 },

  // ── Collection Card ──
  colCard: { backgroundColor: c.surface, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: c.border },
  colCardBar: { height: 5 },
  colCardBody: { padding: 16, gap: 6 },
  colCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  colCardIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  colBadge: { backgroundColor: c.background, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  colBadgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5, color: c.textMuted },
  colCardName: { fontSize: 16, fontWeight: "800", color: c.text, lineHeight: 22 },
  colCardDesc: { fontSize: 12, color: c.textMuted, fontWeight: "500" },
  colCardMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  countPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  countPillText: { fontSize: 12, fontWeight: "800" },
  colCardDate: { fontSize: 11, color: c.textMuted, fontWeight: "500" },

  // ── Collection Action Row ──
  colCardActions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: c.border },
  colAction: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 11 },
  colActionText: { fontSize: 12, fontWeight: "700", color: c.textSecondary },
  colActionDivider: { width: 1, backgroundColor: c.border, marginVertical: 8 },

  // ── Course Cards ──
  courseCard: { backgroundColor: c.surface, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: c.border },
  courseHeader: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  courseIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  courseName: { fontSize: 15, fontWeight: "800", color: c.text },
  courseMeta: { fontSize: 12, color: c.textMuted, fontWeight: "600", marginTop: 2 },
  moduleWrap: { borderTopWidth: 1, borderTopColor: c.border, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  moduleLabel: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  moduleDot: { width: 8, height: 8, borderRadius: 4 },
  moduleName: { fontSize: 12, fontWeight: "800", color: c.textSecondary, flex: 1 },
  lessonRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingLeft: 16, paddingRight: 4, borderRadius: 12, marginBottom: 4, backgroundColor: c.background },
  lessonLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 10, minWidth: 0 },
  lessonDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.border, flexShrink: 0, marginTop: 5 },
  lessonName: { fontSize: 13, fontWeight: "700", color: c.text, lineHeight: 18 },
  lessonDesc: { fontSize: 11, color: c.textMuted, fontWeight: "500", marginTop: 2 },
  lessonRight: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 0, marginLeft: 12 },
  countChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  countChipText: { fontSize: 11, fontWeight: "800" },
  startBtn: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  emptyChip: { fontSize: 11, color: c.textMuted, fontWeight: "600" },

  emOverlay: { flex: 1, backgroundColor: isDark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  emSheet: { backgroundColor: c.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 28 },
  emHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  emHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  emTitle: { flex: 1, fontSize: 16, fontWeight: "800", color: c.text },
  emIconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: c.background, alignItems: "center", justifyContent: "center" },
  emBody: { paddingHorizontal: 20, gap: 6 },
  emLabel: { fontSize: 13, fontWeight: "700", color: c.text, marginTop: 10 },
  emOptional: { fontSize: 12, fontWeight: "500", color: c.textMuted },
  emInput: { borderWidth: 1.5, borderColor: c.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: c.text, backgroundColor: c.background },
  emSaveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: c.success, borderRadius: 14, paddingVertical: 14, marginTop: 16 },
  emSaveBtnText: { fontSize: 15, fontWeight: "800", color: c.white },

  amOverlay: { flex: 1, backgroundColor: isDark ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  amSheet: { backgroundColor: c.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "80%", paddingBottom: 28 },
  amHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  amHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  amBackBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: c.background, alignItems: "center", justifyContent: "center" },
  amTitle: { flex: 1, textAlign: "center", fontSize: 15, fontWeight: "800", color: c.text },
  amColPreview: { marginHorizontal: 20, marginBottom: 12, fontSize: 13, fontWeight: "600", color: c.textSecondary, fontStyle: "italic", backgroundColor: c.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderLeftWidth: 3, borderLeftColor: c.success },
  amLoadingWrap: { alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  amList: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  amItem: { flexDirection: "row", alignItems: "center", backgroundColor: c.surface, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: c.border },
  amItemLabel: { fontSize: 14, fontWeight: "800", color: c.text, marginBottom: 2 },
  amItemSub: { fontSize: 12, color: c.textMuted, fontWeight: "500" },
  amEmpty: { alignItems: "center", paddingVertical: 36, gap: 10 },
  amEmptyText: { fontSize: 14, color: c.textMuted, fontWeight: "600" },
});
