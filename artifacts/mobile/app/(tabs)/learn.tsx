import React, { useCallback, useState } from "react";
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
  generateId, type LearningPath,
} from "@/utils/storage";
import { embedAssetsInPack, countEmbeddedAssets } from "@/utils/bundle-assets";
import { isCancellationError, safeShareFile } from "@/utils/safe-share";
import Colors from "@/constants/colors";
import { useTranslation } from "@/contexts/LanguageContext";
import { toast } from "@/components/Toast";

const COURSE_GRADIENTS: [string, string][] = [
  ["#4C6FFF", "#7C47FF"],
  ["#FF6B6B", "#FF9500"],
  ["#38BDF8", "#0EA5E9"],
  ["#7C3AED", "#A855F7"],
  ["#059669", "#10B981"],
  ["#F59E0B", "#EF4444"],
  ["#06B6D4", "#3B82F6"],
  ["#EC4899", "#8B5CF6"],
];

const COURSE_EMOJIS = ["📘", "🎨", "🌐", "🧠", "⚗️", "🚀", "💡", "🎯"];

interface CourseStats {
  modules: number;
  lessons: number;
  flashcards: number;
  quizzes: number;
}

export default function LearnPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 720;
  const { t } = useTranslation();

  const [paths, setPaths] = useState<LearningPath[]>([]);
  const [stats, setStats] = useState<Record<string, CourseStats>>({});
  const [showNewPath, setShowNewPath] = useState(false);
  const [pathName, setPathName] = useState("");
  const [pathDesc, setPathDesc] = useState("");
  const [sharingId, setSharingId] = useState<string | null>(null);

  const loadData = async () => {
    const data = await getLearningPaths();
    setPaths(data);
    const sMap: Record<string, CourseStats> = {};
    for (const p of data) {
      const mods = await getModules(p.id);
      let lessons = 0, flashcards = 0, quizzes = 0;
      for (const m of mods) {
        const ls = await getLessons(m.id);
        lessons += ls.length;
        for (const l of ls) {
          flashcards += (await getFlashcards(l.id)).length;
          quizzes += (await getQuizzes(l.id)).length;
        }
      }
      sMap[p.id] = { modules: mods.length, lessons, flashcards, quizzes };
    }
    setStats(sMap);
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const createPath = async () => {
    if (!pathName.trim()) return;
    const p: LearningPath = {
      id: generateId(), name: pathName.trim(),
      description: pathDesc.trim(), userId: "local",
      createdAt: new Date().toISOString(),
    };
    await saveLearningPath(p);
    setPathName(""); setPathDesc(""); setShowNewPath(false);
    loadData();
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
        colors={["#4C6FFF", "#7C47FF"]}
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
                colors={["#4A9EFF", "#6C63FF"]}
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
            <TouchableOpacity
              onPress={() => router.push("/import-roadmap")}
              activeOpacity={0.85}
              style={styles.importRoadmapCard}
            >
              <Feather name="download" size={22} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.importRoadmapTitle}>Import dari Roadmap JSON</Text>
                <Text style={styles.importRoadmapSub}>Generate dengan AI lalu import otomatis</Text>
              </View>
              <Feather name="chevron-right" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={isTablet ? styles.tabletGrid : undefined}>
            {paths.map((p, idx) => {
              const grad = COURSE_GRADIENTS[idx % COURSE_GRADIENTS.length];
              const emoji = COURSE_EMOJIS[idx % COURSE_EMOJIS.length];
              const s = stats[p.id] ?? { modules: 0, lessons: 0, flashcards: 0, quizzes: 0 };

              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => router.push(`/course/${p.id}`)}
                  onLongPress={() => handleDelete(p)}
                  activeOpacity={0.92}
                  style={[styles.courseCard, isTablet && styles.courseCardTablet]}
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

                    {/* Top row: emoji icon + arrow */}
                    <View style={styles.cardTopRow}>
                      <View style={styles.courseIconWrap}>
                        <Text style={styles.courseEmoji}>{emoji}</Text>
                      </View>
                      <View style={styles.arrowWrap}>
                        <Feather name="arrow-right" size={18} color="rgba(255,255,255,0.8)" />
                      </View>
                    </View>

                    {/* Course name & description */}
                    <Text style={styles.courseName} numberOfLines={2}>{p.name}</Text>
                    {!!p.description && (
                      <Text style={styles.courseDesc} numberOfLines={2}>{p.description}</Text>
                    )}

                    {/* Stats row */}
                    <View style={styles.statsRow}>
                      <StatPill icon="layers" value={s.modules} label={t.learn.stat_modules} />
                      <StatPill icon="book" value={s.lessons} label={t.learn.stat_lessons} />
                      <StatPill icon="credit-card" value={s.flashcards} label={t.learn.stat_cards} />
                      <StatPill icon="help-circle" value={s.quizzes} label={t.learn.stat_quiz} />
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
            })}

            {/* Add another course card */}
            <TouchableOpacity
              onPress={() => setShowNewPath(true)}
              activeOpacity={0.8}
              style={[styles.addMoreCard, isTablet && styles.courseCardTablet]}
            >
              <Feather name="plus-circle" size={22} color={Colors.primary} />
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
              <TextInput
                placeholder="Nama kursus" value={pathName}
                onChangeText={setPathName} style={styles.mInput}
                placeholderTextColor={Colors.textMuted} autoFocus
              />
              <TextInput
                placeholder="Deskripsi (opsional)" value={pathDesc}
                onChangeText={setPathDesc} style={styles.mInput}
                placeholderTextColor={Colors.textMuted}
              />
              <View style={styles.mBtns}>
                <TouchableOpacity onPress={() => { setShowNewPath(false); setPathName(""); setPathDesc(""); }} style={styles.mBtnCancel}>
                  <Text style={styles.mBtnCancelText}>Batal</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={createPath} style={styles.mBtnOk}>
                  <LinearGradient colors={["#4A9EFF", "#6C63FF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.mBtnOkGrad}>
                    <Text style={styles.mBtnOkText}>{t.learn.create_btn}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function StatPill({ icon, value, label }: { icon: React.ComponentProps<typeof Feather>["name"]; value: number; label: string }) {
  return (
    <View style={styles.statPill}>
      <Feather name={icon} size={10} color="rgba(255,255,255,0.75)" />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: { paddingHorizontal: 20, paddingBottom: 20, overflow: "hidden" },
  hdot1: { position: "absolute", width: 200, height: 200, borderRadius: 100, backgroundColor: "rgba(255,255,255,0.06)", top: -60, right: -50 },
  hdot2: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(255,255,255,0.05)", top: 20, right: 70 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  headerSub: { fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: "700", letterSpacing: 1.5, marginBottom: 4 },
  headerTitle: { fontSize: 28, fontWeight: "900", color: "#fff", letterSpacing: -0.5 },
  headerCount: { fontSize: 13, color: "rgba(255,255,255,0.6)", fontWeight: "600", marginTop: 2 },
  addBtn: { borderRadius: 16, overflow: "hidden" },
  addGrad: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 12 },
  tabletGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },

  emptyCard: {
    borderRadius: 24, padding: 40, alignItems: "center",
    gap: 10, overflow: "hidden", marginBottom: 8,
  },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  emptyTitle: { fontSize: 20, fontWeight: "900", color: "#fff" },
  emptySub: { fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: "500", textAlign: "center" },
  importRoadmapCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: Colors.white, borderRadius: 18,
    borderWidth: 1.5, borderColor: Colors.primaryLight,
    paddingVertical: 16, paddingHorizontal: 18,
  },
  importRoadmapTitle: { fontSize: 14, fontWeight: "800", color: Colors.dark },
  importRoadmapSub: { fontSize: 12, color: Colors.textMuted, fontWeight: "500", marginTop: 2 },

  courseCard: { borderRadius: 22, overflow: "hidden", marginBottom: 4 },
  courseCardTablet: { width: "48.5%", marginBottom: 0 },
  courseGrad: { padding: 22, minHeight: 180, overflow: "hidden", position: "relative" },
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
    width: 54, height: 54, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  courseEmoji: { fontSize: 26 },
  arrowWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  courseName: { fontSize: 22, fontWeight: "900", color: "#fff", letterSpacing: -0.3, marginBottom: 6 },
  courseDesc: { fontSize: 13, color: "rgba(255,255,255,0.72)", fontWeight: "500", marginBottom: 16, lineHeight: 18 },
  statsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 },
  statPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(0,0,0,0.18)", borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  statValue: { fontSize: 12, fontWeight: "800", color: "#fff" },
  statLabel: { fontSize: 10, fontWeight: "600", color: "rgba(255,255,255,0.75)" },

  shareDivider: {
    height: 1, backgroundColor: "rgba(255,255,255,0.18)", marginVertical: 14,
  },
  shareBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 10, borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.2)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  shareBtnText: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.92)" },

  addMoreCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 18, borderRadius: 18,
    borderWidth: 2, borderColor: Colors.primary, borderStyle: "dashed",
    backgroundColor: Colors.primaryLight,
    marginBottom: 4,
  },
  addMoreText: { fontSize: 14, fontWeight: "700", color: Colors.primary },

  mOverlay: { flex: 1, backgroundColor: "rgba(10,22,40,0.6)", justifyContent: "flex-end" },
  mBox: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 12 },
  mTitle: { fontSize: 20, fontWeight: "900", color: Colors.dark },
  mInput: {
    backgroundColor: Colors.background, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 14, fontWeight: "600", color: Colors.dark,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  mBtns: { flexDirection: "row", gap: 10 },
  mBtnCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 999,
    alignItems: "center", backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
  },
  mBtnCancelText: { fontSize: 14, fontWeight: "700", color: Colors.textSecondary },
  mBtnOk: { flex: 1, borderRadius: 999, overflow: "hidden" },
  mBtnOkGrad: { paddingVertical: 14, alignItems: "center" },
  mBtnOkText: { fontSize: 14, fontWeight: "900", color: "#fff" },
});
