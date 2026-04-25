import { useColors, useTheme } from "@/contexts/ThemeContext";
import React, { useCallback, useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as FileSystem from "@/utils/fs-compat";
import {
  getLearningPaths, getModules, getLessons,
  getFlashcards, getQuizzes,
  saveLearningPath, deleteLearningPath, exportCourse,
  getCompletedLessons,
  generateId, type LearningPath,
} from "@/utils/storage";
import { embedAssetsInPack, countEmbeddedAssets } from "@/utils/bundle-assets";
import { isCancellationError, safeShareFile } from "@/utils/safe-share";
import { type ColorScheme } from "@/constants/colors";
import { useTranslation } from "@/contexts/LanguageContext";
import { toast } from "@/components/Toast";
import { IconPicker } from "@/components/IconPicker";

const makeCourseGradients = (colors: ColorScheme): [string, string][] => [
  [colors.primary, colors.purple],
  [colors.accent, colors.amber],
  [colors.teal, "#0EA5E9"],
  [colors.purple, "#A855F7"],
  [colors.success, colors.emerald],
  [colors.amber, colors.danger],
  [colors.teal, colors.primary],
  [colors.accent, colors.purple],
];

const COURSE_EMOJIS = ["📘", "🎨", "🌐", "🧠", "⚗️", "🚀", "💡", "🎯"];

interface CourseStats {
  modules: number;
  lessons: number;
  flashcards: number;
  quizzes: number;
  percentage: number;
}

export default function LearnPage() {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  const COURSE_GRADIENTS = useMemo(() => makeCourseGradients(colors), [colors]);

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768; // Standard tablet threshold
  const { t } = useTranslation();

  const [paths, setPaths] = useState<LearningPath[]>([]);
  const [stats, setStats] = useState<Record<string, CourseStats>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "empty">("all");
  const [showNewPath, setShowNewPath] = useState(false);
  const [pathName, setPathName] = useState("");
  const [pathDesc, setPathDesc] = useState("");
  const [pathIcon, setPathIcon] = useState<string>("book");
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [editingIconFor, setEditingIconFor] = useState<LearningPath | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"large" | "compact">("large");
  const [completions, setCompletions] = useState<string[]>([]);

  const loadData = async () => {
    const [data, completedIds] = await Promise.all([getLearningPaths(), getCompletedLessons()]);
    setPaths(data);
    setCompletions(completedIds);
    const sMap: Record<string, CourseStats> = {};
    for (const p of data) {
      const mods = await getModules(p.id);
      let lessons = 0, flashcards = 0, quizzes = 0, doneLessons = 0;
      for (const m of mods) {
        const ls = await getLessons(m.id);
        lessons += ls.length;
        doneLessons += ls.filter(l => completedIds.includes(l.id)).length;
        for (const l of ls) {
          flashcards += (await getFlashcards(l.id)).length;
          quizzes += (await getQuizzes(l.id)).length;
        }
      }
      sMap[p.id] = { modules: mods.length, lessons, flashcards, quizzes, percentage: lessons > 0 ? Math.round((doneLessons / lessons) * 100) : 0 };
    }
    setStats(sMap);
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const createPath = async () => {
    if (!pathName.trim()) return;
    const p: LearningPath = {
      id: generateId(), name: pathName.trim(),
      description: pathDesc.trim(), userId: "local",
      icon: pathIcon,
      createdAt: new Date().toISOString(),
    };
    await saveLearningPath(p);
    setPathName(""); setPathDesc(""); setPathIcon("book"); setShowNewPath(false);
    loadData();
  };

  const handleChangeIcon = (p: LearningPath) => {
    setEditingIconFor(p);
    setShowIconPicker(true);
  };

  const handleIconSelected = async (icon: string) => {
    setShowIconPicker(false);
    if (editingIconFor) {
      try {
        await saveLearningPath({ ...editingIconFor, icon });
        setEditingIconFor(null);
        toast.success("Ikon berhasil diperbarui!");
        loadData();
      } catch (e) {
        toast.error("Gagal menyimpan ikon");
      }
    } else {
      setPathIcon(icon);
    }
  };

  const handleDelete = (p: LearningPath) => {
    Alert.alert(
      t.learn.delete_title,
      t.learn.delete_msg(p.name),
      [
        { text: t.common.cancel, style: "cancel" },
        {
          text: t.common.delete, style: "destructive",
          onPress: async () => {
            await deleteLearningPath(p.id);
            loadData();
          },
        },
      ]
    );
  };

  const handleShare = async (p: LearningPath) => {
    if (sharingId) return;
    setSharingId(p.id);
    try {
      // 1. Export course data
      let rawPack;
      try {
        rawPack = await exportCourse(p.id);
      } catch (e: any) {
        throw new Error(`Export gagal: ${e?.message ?? String(e)}`);
      }

      // 2. Embed assets (with fallback — skip embed if it throws)
      let pack = rawPack;
      try {
        pack = await embedAssetsInPack(rawPack);
      } catch {
        // non-fatal — share without embedded assets
      }

      const json = JSON.stringify(pack);
      const slug = p.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
      const filename = `bundle-${slug}-${Date.now()}.json`;

      const assets = countEmbeddedAssets(pack);
      const assetSummary = [
        assets.images > 0 ? `${assets.images} gambar` : "",
        assets.files > 0 ? `${assets.files} file` : "",
        assets.links > 0 ? `${assets.links} link` : "",
      ].filter(Boolean).join(", ");

      if (Platform.OS === "web") {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
        toast.success("Bundle berhasil diunduh!");
      } else {
        // 3. Write file to cache
        const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
        if (!cacheDir) throw new Error("Storage tidak tersedia di perangkat ini.");
        const fileUri = cacheDir + filename;
        try {
          await FileSystem.writeAsStringAsync(fileUri, json, {
            encoding: FileSystem.EncodingType.UTF8,
          });
        } catch (e: any) {
          throw new Error(`Tulis file gagal: ${e?.message ?? String(e)}`);
        }

        // 4. Share
        const assetMsg = assetSummary ? ` Termasuk ${assetSummary}.` : "";
        const shared = await safeShareFile(fileUri, {
          mimeType: "application/json",
          dialogTitle: `Bundle Kursus: ${p.name}`,
          UTI: "public.json",
        });
        if (shared) {
          toast.success(`Bundle "${p.name}" siap dibagikan!${assetMsg}`);
        } else {
          toast.info("Berbagi dibatalkan.");
        }
      }
    } catch (e: any) {
      if (!isCancellationError(e)) {
        const msg = e?.message ?? String(e);
        console.warn("[LearnPage] share error", msg);
        toast.error(`Gagal: ${msg}`);
      }
    } finally {
      setSharingId(null);
    }
  };

  const numCols = isTablet ? 2 : 1;

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <LinearGradient
        colors={[colors.primary, colors.purple]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: Platform.OS === "web" ? 60 : insets.top + 14 }]}
      >
        <View style={styles.hdot1} />
        <View style={styles.hdot2} />
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerSub}>{t.learn.header_sub}</Text>
            <Text style={styles.headerTitle}>{t.learn.header_title}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={() => setViewMode(viewMode === "large" ? "compact" : "large")}
              style={styles.addBtn}
              activeOpacity={0.8}
            >
              <LinearGradient colors={["rgba(255,255,255,0.2)", "rgba(255,255,255,0.05)"]} style={styles.addGrad}>
                <Feather name={viewMode === "large" ? "list" : "grid"} size={19} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/import-roadmap")}
              style={styles.addBtn}
              activeOpacity={0.8}
            >
              <LinearGradient colors={["rgba(255,255,255,0.25)", "rgba(255,255,255,0.1)"]} style={styles.addGrad}>
                <Feather name="download" size={19} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowNewPath(true)}
              style={styles.addBtn}
              activeOpacity={0.8}
            >
              <LinearGradient colors={["rgba(255,255,255,0.3)", "rgba(255,255,255,0.15)"]} style={styles.addGrad}>
                <Feather name="plus" size={22} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
        {paths.length > 0 && (
          <Text style={styles.headerCount}>{t.learn.courses_available(paths.length)}</Text>
        )}

        {/* SEARCH & FILTER */}
        <View style={styles.searchBarRow}>
          <View style={styles.searchInputWrap}>
            <Feather name="search" size={16} color="rgba(255,255,255,0.5)" />
            <TextInput
              placeholder="Cari kursus..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
            />
            {!!search && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Feather name="x-circle" size={16} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
          {([
            { id: "all", label: "Semua" },
            { id: "active", label: "Aktif (Ada Isi)" },
            { id: "empty", label: "Kosong" },
          ] as const).map((f) => (
            <TouchableOpacity
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[styles.filterChip, filter === f.id && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, filter === f.id && styles.filterTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </LinearGradient>

      {/* COURSE LIST */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          isTablet && { maxWidth: 1100, alignSelf: "center", width: "100%" },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {paths.length === 0 ? (
          /* Empty state */
          <View style={{ gap: 12 }}>
            <TouchableOpacity onPress={() => setShowNewPath(true)} activeOpacity={0.85}>
              <LinearGradient
                colors={[colors.primary, "#6C63FF"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.emptyCard}
              >
                <View style={styles.hdot1} /><View style={styles.hdot2} />
                <View style={styles.emptyIconWrap}>
                  <Feather name="plus-circle" size={40} color="rgba(255,255,255,0.9)" />
                </View>
                <Text style={styles.emptyTitle}>{t.learn.empty_title}</Text>
                <Text style={styles.emptySub}>Tap untuk membuat jalur belajarmu sendiri</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={isTablet ? styles.gridWrap : undefined}>
            {paths
              .filter(p => {
                const s = stats[p.id];
                if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
                if (filter === "active" && (!s || s.modules === 0)) return false;
                if (filter === "empty" && (s && s.modules > 0)) return false;
                return true;
              })
              .map((p, idx) => {
                const grad = COURSE_GRADIENTS[idx % COURSE_GRADIENTS.length];
                const s = stats[p.id] ?? { modules: 0, lessons: 0, flashcards: 0, quizzes: 0 };

                if (viewMode === "large") {
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => router.push(`/course/${p.id}`)}
                      onLongPress={() =>
                        Alert.alert(p.name, undefined, [
                          { text: "Ganti Ikon", onPress: () => handleChangeIcon(p) },
                          { text: "Bagikan Bundle", onPress: () => handleShare(p) },
                          { text: t.common.delete, style: "destructive", onPress: () => handleDelete(p) },
                          { text: t.common.cancel, style: "cancel" },
                        ])
                      }
                      activeOpacity={0.92}
                      style={[styles.largeCard, isTablet && styles.courseCardTablet]}
                    >
                      <LinearGradient
                        colors={grad}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.courseGrad}
                      >
                        {/* Decorative circles */}
                        <View style={styles.cardCircle1} />
                        <View style={styles.cardCircle2} />

                        {/* Top row: icon + arrow */}
                        <View style={styles.cardTopRow}>
                          <View style={styles.courseIconWrap}>
                             <Feather name={p.icon as any || "book"} size={22} color="#fff" />
                          </View>
                          <View style={styles.arrowWrap}>
                            <Feather name="arrow-right" size={18} color="rgba(255,255,255,0.8)" />
                          </View>
                        </View>

                        {/* Course name & description */}
                        <Text style={styles.courseNameLarge} numberOfLines={2}>{p.name}</Text>
                        {!!p.description && (
                          <Text style={styles.courseDesc} numberOfLines={2}>{p.description}</Text>
                        )}

                        {/* Stats row */}
                        <View style={styles.statsRow}>
                          <StatPill styles={styles} icon="layers" value={s.modules} label={t.learn.stat_modules} />
                          <StatPill styles={styles} icon="book" value={s.lessons} label={t.learn.stat_lessons} />
                          <StatPill styles={styles} icon="credit-card" value={s.flashcards} label={t.learn.stat_cards} />
                          <StatPill styles={styles} icon="help-circle" value={s.quizzes} label={t.learn.stat_quiz} />
                        </View>

                        {/* Share button */}
                        <View style={styles.shareDivider} />
                        <TouchableOpacity
                          onPress={(e) => { e.stopPropagation?.(); handleShare(p); }}
                          style={styles.shareBtn}
                          activeOpacity={0.75}
                          disabled={!!sharingId}
                        >
                          {sharingId === p.id ? (
                            <>
                              <ActivityIndicator size="small" color="rgba(255,255,255,0.9)" />
                              <Text style={styles.shareBtnText}>Menyiapkan bundle...</Text>
                            </>
                          ) : (
                            <>
                              <Feather name="share-2" size={14} color="rgba(255,255,255,0.9)" />
                              <Text style={styles.shareBtnText}>{t.learn.share_btn}</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                }

                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => router.push(`/course/${p.id}`)}
                      onLongPress={() =>
                        Alert.alert(p.name, undefined, [
                          { text: "Ganti Ikon", onPress: () => handleChangeIcon(p) },
                          { text: "Bagikan Bundle", onPress: () => handleShare(p) },
                          { text: t.common.delete, style: "destructive", onPress: () => handleDelete(p) },
                          { text: t.common.cancel, style: "cancel" },
                        ])
                      }
                      activeOpacity={0.9}
                      style={[styles.courseCard, isTablet && styles.courseCardTablet]}
                    >
                      <LinearGradient
                        colors={grad}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.courseCardGrad}
                      >
                        <Feather name={p.icon as any || "book"} size={22} color="#fff" />
                      </LinearGradient>
                      
                      <View style={styles.courseCardBody}>
                        <Text style={styles.courseName} numberOfLines={1}>{p.name}</Text>
                        {!!p.description && (
                          <Text style={styles.courseSub} numberOfLines={1}>{p.description}</Text>
                        )}
                        <View style={styles.courseStatRow}>
                          <View style={styles.courseStatChip}>
                            <Feather name="layers" size={10} color={grad[0]} />
                            <Text style={[styles.courseStatText, { color: grad[0] }]}>{s.modules} Modul</Text>
                          </View>
                          <View style={styles.courseStatChip}>
                            <Feather name="check-circle" size={10} color={grad[0]} />
                            <Text style={[styles.courseStatText, { color: grad[0] }]}>
                              {s.percentage}%
                            </Text>
                          </View>
                          <View style={styles.courseStatChip}>
                            <Feather name="book-open" size={10} color={grad[0]} />
                            <Text style={[styles.courseStatText, { color: grad[0] }]}>{s.lessons} Materi</Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.courseCardArrow}>
                        <LinearGradient colors={grad} style={styles.courseArrowCircle} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                          <Feather name="chevron-right" size={14} color="#fff" />
                        </LinearGradient>
                      </View>
                    </TouchableOpacity>
                  );
              })}

            {/* Add another course card */}
            <TouchableOpacity
              onPress={() => setShowNewPath(true)}
              activeOpacity={0.8}
              style={[styles.addMoreCard, isTablet && styles.courseCardTablet]}
            >
              <Feather name="plus-circle" size={22} color={colors.primary} />
              <Text style={styles.addMoreText}>{t.learn.add_more}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* MODAL: New Course */}
      <Modal visible={showNewPath} transparent animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.mOverlay}>
            <View style={styles.mBox}>
              <Text style={styles.mTitle}>{t.learn.new_course_modal}</Text>
              <TouchableOpacity
                style={styles.iconPickRow}
                onPress={() => { setEditingIconFor(null); setShowIconPicker(true); }}
                activeOpacity={0.7}
              >
                <View style={styles.iconPickPreview}>
                  <Feather name={pathIcon as any} size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.iconPickLabel}>Ikon Course</Text>
                  <Text style={styles.iconPickSub}>Tap untuk ganti ikon</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textMuted} />
              </TouchableOpacity>
              <TextInput
                placeholder="Nama kursus" value={pathName}
                onChangeText={setPathName} style={styles.mInput}
                placeholderTextColor={colors.textMuted} autoFocus
              />
              <TextInput
                placeholder="Deskripsi (opsional)" value={pathDesc}
                onChangeText={setPathDesc} style={styles.mInput}
                placeholderTextColor={colors.textMuted}
              />
              <View style={styles.mBtns}>
                <TouchableOpacity onPress={() => { setShowNewPath(false); setPathName(""); setPathDesc(""); }} style={styles.mBtnCancel}>
                  <Text style={styles.mBtnCancelText}>Batal</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={createPath} style={styles.mBtnOk}>
                  <LinearGradient colors={[colors.primary, colors.purple]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.mBtnOkGrad}>
                    <Text style={styles.mBtnOkText}>{t.learn.create_btn}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <IconPicker
        visible={showIconPicker}
        current={editingIconFor?.icon ?? pathIcon}
        onClose={() => setShowIconPicker(false)}
        onSelect={handleIconSelected}
      />
    </View>
  );
}

function StatPill({ styles, icon, value, label }: { styles: any; icon: React.ComponentProps<typeof Feather>["name"]; value: number; label: string }) {
  return (
    <View style={styles.statPill}>
      <Feather name={icon} size={10} color="rgba(255,255,255,0.75)" />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (c: ColorScheme, isDark: boolean, palette: string) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },

  header: { paddingHorizontal: 20, paddingBottom: 16, overflow: "hidden" },
  hdot1: { position: "absolute", width: 200, height: 200, borderRadius: 100, backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.06)", top: -60, right: -50 },
  hdot2: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.05)", top: 20, right: 70 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  headerSub: { fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: "700", letterSpacing: 1.5, marginBottom: 4 },
  headerTitle: { fontSize: 28, fontWeight: "900", color: "#fff", letterSpacing: -0.5 },
  headerCount: { fontSize: 13, color: "rgba(255,255,255,0.6)", fontWeight: "600", marginTop: 2 },
  addBtn: { borderRadius: 16, overflow: "hidden" },
  addGrad: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },

  searchBarRow: { marginTop: 16, marginBottom: 12 },
  searchInputWrap: {
    height: 46, backgroundColor: "rgba(0,0,0,0.15)", borderRadius: 14,
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 10,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "600" },
  filterRow: { marginHorizontal: -20, marginBottom: -10 },
  filterContent: { paddingHorizontal: 20, gap: 8, paddingBottom: 10 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
  },
  filterChipActive: { backgroundColor: "#fff", borderColor: "#fff" },
  filterText: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.7)" },
  filterTextActive: { color: "#1A222F" },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 60, gap: 14 },
  gridWrap: { flexDirection: "row", flexWrap: "wrap", gap: 12 },

  emptyCard: {
    borderRadius: 24, padding: 40, alignItems: "center",
    gap: 10, overflow: "hidden", marginBottom: 8,
  },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: "900", color: "#fff" },
  emptySub: { fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: "500", textAlign: "center" },

  courseCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: c.surface, width: "100%",
    borderRadius: 18, overflow: "hidden",
    minHeight: 76, borderWidth: 1, borderColor: c.border
  },
  courseCardTablet: { width: "48.5%" },
  courseCardGrad: {
    width: 72, alignSelf: "stretch",
    alignItems: "center", justifyContent: "center",
  },
  courseCardBody: {
    flex: 1, paddingVertical: 11, paddingHorizontal: 12, gap: 2,
  },
  courseName: { fontSize: 15, fontWeight: "800", color: c.text, lineHeight: 20 },
  courseSub: { fontSize: 12, color: c.textMuted, fontWeight: "500", marginBottom: 2 },
  courseStatRow: { flexDirection: "row", gap: 6, marginTop: 2, flexWrap: "wrap" },
  courseStatChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: c.background, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  courseStatText: { fontSize: 10, fontWeight: "700" },
  courseCardArrow: { paddingRight: 14 },
  courseArrowCircle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },

  addMoreCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 18, borderRadius: 18, width: "100%",
    borderWidth: 2, borderColor: c.primary, borderStyle: "dashed",
    backgroundColor: c.primaryLight,
    marginBottom: 4,
  },
  addMoreText: { fontSize: 13, fontWeight: "700", color: c.textSecondary },

  largeCard: { borderRadius: 22, overflow: "hidden", marginBottom: 2, width: "100%" },
  courseGrad: { 
    width: "100%", padding: 18, minHeight: 155, 
    overflow: "hidden", position: "relative" 
  },
  cardCircle1: {
    position: "absolute", width: 180, height: 180, borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.07)", top: -60, right: -50,
  },
  cardCircle2: {
    position: "absolute", width: 100, height: 100, borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.05)", bottom: -20, left: 20,
  },
  cardTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  courseIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  arrowWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  courseNameLarge: { fontSize: 20, fontWeight: "900", color: "#fff", letterSpacing: -0.3, marginBottom: 4 },
  courseDesc: { fontSize: 13, color: "rgba(255,255,255,0.72)", fontWeight: "500", marginBottom: 12, lineHeight: 17 },
  statsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 },
  statPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(0,0,0,0.18)", borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  statValue: { fontSize: 12, fontWeight: "800", color: "#fff" },
  statLabel: { fontSize: 10, fontWeight: "600", color: "rgba(255,255,255,0.75)" },
  shareDivider: {
    height: 1, backgroundColor: "rgba(255,255,255,0.18)", marginVertical: 12,
  },
  shareBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 10, borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.2)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  shareBtnText: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.92)" },

  mOverlay: { flex: 1, backgroundColor: "rgba(10,22,40,0.6)", justifyContent: "flex-end" },
  mBox: { backgroundColor: c.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 12 },
  iconPickRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: c.background, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: c.border,
  },
  iconPickPreview: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: c.primary,
    alignItems: "center", justifyContent: "center",
  },
  iconPickLabel: { fontSize: 13, fontWeight: "700", color: c.text },
  iconPickSub: { fontSize: 11, color: c.textMuted, marginTop: 2 },
  mTitle: { fontSize: 20, fontWeight: "900", color: c.dark },
  mInput: {
    backgroundColor: c.background, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 14, fontWeight: "600", color: c.dark,
    borderWidth: 1.5, borderColor: c.border,
  },
  mBtns: { flexDirection: "row", gap: 10 },
  mBtnCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 999,
    alignItems: "center", backgroundColor: c.background,
    borderWidth: 1, borderColor: c.border,
  },
  mBtnCancelText: { fontSize: 14, fontWeight: "700", color: c.textSecondary },
  mBtnOk: { flex: 1, borderRadius: 999, overflow: "hidden" },
  mBtnOkGrad: { paddingVertical: 14, alignItems: "center" },
  mBtnOkText: { fontSize: 14, fontWeight: "900", color: "#fff" },
});
