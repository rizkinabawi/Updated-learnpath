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
  getStandaloneCollections, saveStandaloneCollection,
  deleteStandaloneCollection, assignStandaloneCollection,
  type LearningPath, type Module, type Lesson, type StandaloneCollection,
} from "@/utils/storage";
import Colors, { shadowSm } from "@/constants/colors";
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

const GRAD: [string, string][] = [
  ["#4C6FFF", "#7C47FF"],
  ["#FF6B6B", "#FF9500"],
  ["#38BDF8", "#0EA5E9"],
  ["#7C3AED", "#A855F7"],
  ["#10B981", "#059669"],
  ["#F59E0B", "#EF4444"],
];

const COL_GRADS: [string, string][] = [
  ["#10B981", "#059669"],
  ["#6366F1", "#8B5CF6"],
  ["#F59E0B", "#EF4444"],
  ["#38BDF8", "#0EA5E9"],
  ["#EC4899", "#F43F5E"],
  ["#14B8A6", "#0D9488"],
];

// ─── Collection Edit Modal ───────────────────────────────────────
function CollectionEditModal({
  col,
  onClose,
  onSaved,
}: {
  col: StandaloneCollection;
  onClose: () => void;
  onSaved: () => void;
}) {
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
      <View style={em.overlay}>
        <View style={em.sheet}>
          <View style={em.handle} />
          <View style={em.header}>
            <Text style={em.title}>Edit Koleksi</Text>
            <TouchableOpacity style={em.iconBtn} onPress={onClose}>
              <Feather name="x" size={20} color={Colors.dark} />
            </TouchableOpacity>
          </View>
          <View style={em.body}>
            <Text style={em.label}>Nama Koleksi *</Text>
            <TextInput
              style={em.input}
              value={name}
              onChangeText={setName}
              placeholder="Nama koleksi…"
              placeholderTextColor={Colors.textMuted}
            />
            <Text style={em.label}>Deskripsi <Text style={em.optional}>(opsional)</Text></Text>
            <TextInput
              style={[em.input, { minHeight: 76 }]}
              value={desc}
              onChangeText={setDesc}
              placeholder="Deskripsi singkat…"
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[em.saveBtn, (!name.trim() || saving) && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={!name.trim() || saving}
            >
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="check" size={17} color="#fff" />}
              <Text style={em.saveBtnText}>{saving ? "Menyimpan…" : "Simpan Perubahan"}</Text>
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
  onClose,
  onAssigned,
}: {
  col: StandaloneCollection;
  count: number;
  onClose: () => void;
  onAssigned: () => void;
}) {
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
      <View style={am.overlay}>
        <View style={am.sheet}>
          <View style={am.handle} />
          <View style={am.header}>
            {step !== "course" ? (
              <TouchableOpacity style={am.backBtn} onPress={() => setStep(step === "module" ? "course" : "module")}>
                <Feather name="arrow-left" size={18} color={Colors.dark} />
              </TouchableOpacity>
            ) : <View style={{ width: 34 }} />}
            <Text style={am.title} numberOfLines={1}>{stepTitle}</Text>
            <TouchableOpacity style={am.backBtn} onPress={onClose}>
              <Feather name="x" size={18} color={Colors.dark} />
            </TouchableOpacity>
          </View>

          <Text style={am.colPreview} numberOfLines={2}>
            Assign "{col.name}" ({count} kartu) ke pelajaran tujuan
          </Text>

          {saving ? (
            <View style={am.loadingWrap}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={{ color: Colors.textMuted, fontSize: 13 }}>Memindahkan…</Text>
            </View>
          ) : items.length === 0 ? (
            <View style={am.empty}>
              <Feather name="inbox" size={28} color={Colors.textMuted} />
              <Text style={am.emptyText}>Tidak ada data</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={am.list}>
              {items.map((item: any) => (
                <TouchableOpacity
                  key={item.id}
                  style={[am.item, shadowSm]}
                  onPress={() => {
                    if (step === "course") { setSelCourse(item); setStep("module"); }
                    else if (step === "module") { setSelModule(item); setStep("lesson"); }
                    else handleAssign(item);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={am.itemLabel}>{getLabel(item)}</Text>
                    {getSub(item) ? <Text style={am.itemSub} numberOfLines={1}>{getSub(item)}</Text> : null}
                  </View>
                  <Feather name={step === "lesson" ? "check-circle" : "chevron-right"} size={16} color={step === "lesson" ? Colors.success : Colors.textMuted} />
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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
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
    const [paths, cols] = await Promise.all([
      getLearningPaths(),
      getStandaloneCollections("flashcard"),
    ]);

    // Build collection rows with count
    const colRows: CollectionRow[] = await Promise.all(
      cols.map(async (col) => {
        const cards = await getFlashcards(col.id);
        return { col, count: cards.length };
      })
    );
    setCollections(colRows.sort((a, b) => b.col.createdAt.localeCompare(a.col.createdAt)));

    // Build course-linked rows
    const result: LessonRow[] = [];
    for (const path of paths) {
      const mods = (await getModules(path.id)).sort((a, b) => a.order - b.order);
      for (const mod of mods) {
        const lessonList = (await getLessons(mod.id)).sort((a, b) => a.order - b.order);
        for (const lesson of lessonList) {
          const cards = await getFlashcards(lesson.id);
          result.push({ path, module: mod, lesson, count: cards.length });
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
          onClose={() => setEditCol(null)}
          onSaved={loadAll}
        />
      )}
      {assignCol && (
        <CollectionAssignModal
          col={assignCol.col}
          count={assignCol.count}
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
        colors={["#4C6FFF", "#7C47FF"]}
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
          <Feather name="search" size={15} color={Colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t.browse.search_ph}
            placeholderTextColor={Colors.textMuted}
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={14} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.primary} size="large" />
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
                <LinearGradient colors={["#10B981", "#059669"]} style={styles.sectionIcon}>
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
                          <Feather name="edit-2" size={14} color={Colors.textSecondary} />
                          <Text style={styles.colActionText}>Edit</Text>
                        </TouchableOpacity>

                        <View style={styles.colActionDivider} />

                        <TouchableOpacity
                          style={styles.colAction}
                          onPress={() => setAssignCol(cr)}
                          activeOpacity={0.7}
                        >
                          <Feather name="folder-plus" size={14} color={Colors.primary} />
                          <Text style={[styles.colActionText, { color: Colors.primary }]}>Assign</Text>
                        </TouchableOpacity>

                        <View style={styles.colActionDivider} />

                        {cr.count > 0 && (
                          <>
                            <TouchableOpacity
                              style={styles.colAction}
                              onPress={() => router.push(`/flashcard/${cr.col.id}` as any)}
                              activeOpacity={0.7}
                            >
                              <Feather name="play" size={14} color="#10B981" />
                              <Text style={[styles.colActionText, { color: "#10B981" }]}>Main</Text>
                            </TouchableOpacity>
                            <View style={styles.colActionDivider} />
                          </>
                        )}

                        <TouchableOpacity
                          style={styles.colAction}
                          onPress={() => handleDeleteCollection(cr.col)}
                          activeOpacity={0.7}
                        >
                          <Feather name="trash-2" size={14} color={Colors.danger} />
                          <Text style={[styles.colActionText, { color: Colors.danger }]}>Hapus</Text>
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
                  <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={16} color={Colors.textMuted} />
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 20, overflow: "hidden" },
  blob1: { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(74,158,255,0.1)", top: -50, right: -40 },
  blob2: { position: "absolute", width: 110, height: 110, borderRadius: 55, backgroundColor: "rgba(108,99,255,0.08)", bottom: -20, left: 20 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerSub: { fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  headerTitle: { fontSize: 22, fontWeight: "900", color: "#fff", letterSpacing: -0.3 },
  countBadge: { backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" },
  countBadgeText: { fontSize: 20, fontWeight: "900", color: "#fff" },
  countBadgeSub: { fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: "700" },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.dark, fontWeight: "500" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14, color: Colors.textMuted, fontWeight: "600" },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: Colors.dark, textAlign: "center" },
  emptySub: { fontSize: 14, color: Colors.textMuted, fontWeight: "500", textAlign: "center", lineHeight: 20 },
  emptyFabHint: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, backgroundColor: Colors.primary, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 },
  emptyFabHintText: { fontSize: 14, fontWeight: "800", color: "#fff" },
  list: { padding: 16, paddingBottom: 100, gap: 16 },
  fab: { position: "absolute", right: 20, width: 56, height: 56, borderRadius: 18, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", zIndex: 50, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 10 },

  // ── Standalone Collections Section ──
  sectionWrap: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 4 },
  sectionIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: Colors.dark },
  sectionMeta: { fontSize: 12, color: Colors.textMuted, fontWeight: "600", marginTop: 2 },
  collectionGrid: { gap: 10 },

  // ── Collection Card ──
  colCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: Colors.border },
  colCardBar: { height: 5 },
  colCardBody: { padding: 16, gap: 6 },
  colCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  colCardIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  colBadge: { backgroundColor: Colors.background, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  colBadgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  colCardName: { fontSize: 16, fontWeight: "800", color: Colors.dark, lineHeight: 22 },
  colCardDesc: { fontSize: 12, color: Colors.textMuted, fontWeight: "500" },
  colCardMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  countPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  countPillText: { fontSize: 12, fontWeight: "800" },
  colCardDate: { fontSize: 11, color: Colors.textMuted, fontWeight: "500" },

  // ── Collection Action Row ──
  colCardActions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: Colors.border },
  colAction: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 11 },
  colActionText: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary },
  colActionDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 8 },

  // ── Course Cards ──
  courseCard: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: Colors.border },
  courseHeader: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  courseIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  courseName: { fontSize: 15, fontWeight: "800", color: Colors.dark },
  courseMeta: { fontSize: 12, color: Colors.textMuted, fontWeight: "600", marginTop: 2 },
  moduleWrap: { borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  moduleLabel: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  moduleDot: { width: 8, height: 8, borderRadius: 4 },
  moduleName: { fontSize: 12, fontWeight: "800", color: Colors.textSecondary, flex: 1 },
  lessonRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingLeft: 16, paddingRight: 4, borderRadius: 12, marginBottom: 4, backgroundColor: Colors.background },
  lessonLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 10, minWidth: 0 },
  lessonDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border, flexShrink: 0, marginTop: 5 },
  lessonName: { fontSize: 13, fontWeight: "700", color: Colors.dark },
  lessonDesc: { fontSize: 11, color: Colors.textMuted, fontWeight: "500", marginTop: 1 },
  lessonRight: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 8 },
  countChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  countChipText: { fontSize: 11, fontWeight: "800" },
  startBtn: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  emptyChip: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
});

// ─── Edit Modal Styles ──────────────────────────────────────────
const em = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 28 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  title: { flex: 1, fontSize: 16, fontWeight: "800", color: Colors.dark },
  iconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" },
  body: { paddingHorizontal: 20, gap: 6 },
  label: { fontSize: 13, fontWeight: "700", color: Colors.dark, marginTop: 10 },
  optional: { fontSize: 12, fontWeight: "500", color: Colors.textMuted },
  input: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.dark, backgroundColor: Colors.background },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#10B981", borderRadius: 14, paddingVertical: 14, marginTop: 16 },
  saveBtnText: { fontSize: 15, fontWeight: "800", color: "#fff" },
});

// ─── Assign Modal Styles ────────────────────────────────────────
const am = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "80%", paddingBottom: 28 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontSize: 15, fontWeight: "800", color: Colors.dark },
  colPreview: { marginHorizontal: 20, marginBottom: 12, fontSize: 13, fontWeight: "600", color: Colors.textSecondary, fontStyle: "italic", backgroundColor: Colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderLeftWidth: 3, borderLeftColor: "#10B981" },
  loadingWrap: { alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  list: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  item: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.white, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: Colors.border },
  itemLabel: { fontSize: 14, fontWeight: "800", color: Colors.dark, marginBottom: 2 },
  itemSub: { fontSize: 12, color: Colors.textMuted, fontWeight: "500" },
  empty: { alignItems: "center", paddingVertical: 36, gap: 10 },
  emptyText: { fontSize: 14, color: Colors.textMuted, fontWeight: "600" },
});
