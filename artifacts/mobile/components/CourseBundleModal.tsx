import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Platform, Share,
} from "react-native";
import * as FileSystem from "@/utils/fs-compat";
import { Feather } from "@expo/vector-icons";
import {
  getLearningPaths, getModules, getLessons, getFlashcards, getQuizzes,
  exportCourse,
  type LearningPath, type CoursePack,
} from "@/utils/storage";
import { embedAssetsInPack, countEmbeddedAssets } from "@/utils/bundle-assets";
import Colors, { shadowSm } from "@/constants/colors";
import { isCancellationError } from "@/utils/safe-share";

interface PathStat {
  path: LearningPath;
  modules: number;
  lessons: number;
  flashcards: number;
  quizzes: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function CourseBundleShareModal({ visible, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState<string | null>(null);
  const [sharingStep, setSharingStep] = useState<string>("");
  const [pathStats, setPathStats] = useState<PathStat[]>([]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    (async () => {
      const [paths, allModules, allLessons, allFlashcards, allQuizzes] = await Promise.all([
        getLearningPaths(), getModules(), getLessons(), getFlashcards(), getQuizzes(),
      ]);
      const stats: PathStat[] = paths.map((path) => {
        const mods = allModules.filter((m) => m.pathId === path.id);
        const modIds = new Set(mods.map((m) => m.id));
        const lessons = allLessons.filter((l) => modIds.has(l.moduleId));
        const lessonIds = new Set(lessons.map((l) => l.id));
        return {
          path,
          modules: mods.length,
          lessons: lessons.length,
          flashcards: allFlashcards.filter((f) => lessonIds.has(f.lessonId)).length,
          quizzes: allQuizzes.filter((q) => lessonIds.has(q.lessonId)).length,
        };
      });
      setPathStats(stats);
      setLoading(false);
    })();
  }, [visible]);

  if (!visible) return null;

  const totalStats = pathStats.reduce(
    (acc, s) => ({
      modules: acc.modules + s.modules,
      lessons: acc.lessons + s.lessons,
      flashcards: acc.flashcards + s.flashcards,
      quizzes: acc.quizzes + s.quizzes,
    }),
    { modules: 0, lessons: 0, flashcards: 0, quizzes: 0 }
  );

  const doShare = async (pathId?: string) => {
    const id = pathId ?? "all";
    setSharing(id);
    try {
      setSharingStep("Memuat data kursus...");
      const rawPack = await exportCourse(pathId);

      setSharingStep("Menyiapkan gambar & file...");
      const pack = await embedAssetsInPack(rawPack);

      setSharingStep("Membuat file bundle...");
      const json = JSON.stringify(pack);
      const pathName = pathId
        ? (pathStats.find((s) => s.path.id === pathId)?.path.name ?? "kursus")
        : "semua-kursus";
      const filename = `bundle-${pathName.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.json`;

      const assets = countEmbeddedAssets(pack);
      const assetSummary = [
        assets.images > 0 ? `${assets.images} gambar` : "",
        assets.files > 0 ? `${assets.files} file` : "",
        assets.links > 0 ? `${assets.links} link` : "",
      ].filter(Boolean).join(", ");

      setSharingStep("Membagikan...");
      if (Platform.OS === "web") {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
      } else {
        const fileUri = (FileSystem.cacheDirectory ?? "") + filename;
        await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
        const assetMsg = assetSummary ? ` Sudah termasuk ${assetSummary}.` : "";
        const shareMsg =
          `Bundle Kursus: ${pathName}\n` +
          `${pack.lessons?.length ?? 0} pelajaran · ${pack.flashcards?.length ?? 0} flashcard · ${pack.quizzes?.length ?? 0} soal quiz.${assetMsg}\n` +
          `Import file ini ke Mobile Learning App untuk langsung belajar!`;
        // On iOS, passing both url and message suppresses the file attachment.
        // Use url-only on iOS; use message+url on Android.
        if (Platform.OS === "ios") {
          await Share.share({ url: fileUri, title: `Bundle Kursus: ${pathName}` });
        } else {
          await Share.share({ url: fileUri, title: `Bundle Kursus: ${pathName}`, message: shareMsg });
        }
      }
    } catch (e) {
      if (!isCancellationError(e)) console.warn("[CourseBundleModal] share error", e);
    } finally {
      setSharing(null);
      setSharingStep("");
    }
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        {/* Handle bar */}
        <View style={styles.handle} />

        <View style={styles.header}>
          <Text style={styles.title}>Bagikan Bundle Kursus</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Feather name="x" size={20} color={Colors.dark} />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>
          Gambar, file, dan link materi belajar ikut dibundel. Teman cukup import satu file dan semua struktur kursus otomatis terbuat!
        </Text>

        {/* Sharing progress step */}
        {sharing !== null && sharingStep ? (
          <View style={styles.stepBanner}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.stepText}>{sharingStep}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.loadingText}>Memuat data kursus...</Text>
          </View>
        ) : pathStats.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyText}>Belum ada kursus yang bisa dibagikan.</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
            {/* Share All */}
            <TouchableOpacity
              style={[styles.allCard, shadowSm]}
              onPress={() => doShare(undefined)}
              disabled={sharing !== null}
              activeOpacity={0.8}
            >
              <View style={styles.allCardLeft}>
                <View style={styles.allIcon}>
                  <Feather name="package" size={22} color={Colors.white} />
                </View>
                <View>
                  <Text style={styles.allCardTitle}>Semua Kursus</Text>
                  <Text style={styles.allCardSub}>
                    {pathStats.length} kursus · {totalStats.modules} modul · {totalStats.lessons} pelajaran
                  </Text>
                </View>
              </View>
              {sharing === "all" ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Feather name="share-2" size={18} color={Colors.white} />
              )}
            </TouchableOpacity>

            <Text style={styles.sectionLabel}>Atau pilih satu kursus:</Text>

            {pathStats.map((s) => (
              <TouchableOpacity
                key={s.path.id}
                style={[styles.pathCard, shadowSm]}
                onPress={() => doShare(s.path.id)}
                disabled={sharing !== null}
                activeOpacity={0.8}
              >
                <View style={styles.pathCardLeft}>
                  <View style={styles.pathIconWrap}>
                    <Text style={styles.pathIconText}>{s.path.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pathName} numberOfLines={1}>{s.path.name}</Text>
                    {s.path.description ? (
                      <Text style={styles.pathDesc} numberOfLines={1}>{s.path.description}</Text>
                    ) : null}
                    <View style={styles.statChips}>
                      <StatChip icon="layers" val={s.modules} label="modul" />
                      <StatChip icon="book" val={s.lessons} label="pelajaran" />
                      <StatChip icon="zap" val={s.flashcards} label="flashcard" />
                      <StatChip icon="help-circle" val={s.quizzes} label="soal" />
                    </View>
                  </View>
                </View>
                <View style={styles.shareBtn}>
                  {sharing === s.path.id ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Feather name="share-2" size={16} color={Colors.primary} />
                  )}
                </View>
              </TouchableOpacity>
            ))}

            <View style={styles.tipBox}>
              <Feather name="info" size={13} color={Colors.primary} />
              <Text style={styles.tipText}>
                File bundle akan dibagikan sebagai JSON. Teman cukup buka app → Profil → Import Bundle Kursus → pilih file.
              </Text>
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function StatChip({ icon, val, label }: { icon: string; val: number; label: string }) {
  if (val === 0) return null;
  return (
    <View style={styles.chip}>
      <Feather name={icon as any} size={10} color={Colors.textMuted} />
      <Text style={styles.chipText}>{val} {label}</Text>
    </View>
  );
}

interface ImportPreviewProps {
  visible: boolean;
  pack: CoursePack | null;
  importing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CourseImportPreviewModal({ visible, pack, importing, onConfirm, onCancel }: ImportPreviewProps) {
  if (!visible || !pack) return null;

  const totalItems =
    (pack.paths?.length ?? 0) +
    (pack.modules?.length ?? 0) +
    (pack.lessons?.length ?? 0) +
    (pack.flashcards?.length ?? 0) +
    (pack.quizzes?.length ?? 0) +
    (pack.materials?.length ?? 0) +
    (pack.notes?.length ?? 0);

  const exportDate = pack.exportedAt
    ? new Date(pack.exportedAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : "Tidak diketahui";

  const assets = countEmbeddedAssets(pack);
  const hasAssets = assets.images > 0 || assets.files > 0 || assets.links > 0;
  const isV2 = pack.version >= 2;

  return (
    <View style={styles.overlay}>
      <View style={[styles.sheet, styles.importSheet]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>Preview Bundle Kursus</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={onCancel}>
            <Feather name="x" size={20} color={Colors.dark} />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>Berikut isi bundle yang akan diimport ke akunmu:</Text>

        {/* Asset badge */}
        {hasAssets && (
          <View style={styles.assetBadgeRow}>
            {assets.images > 0 && <AssetBadge icon="image" label={`${assets.images} gambar`} color="#8B5CF6" />}
            {assets.files > 0 && <AssetBadge icon="file" label={`${assets.files} file`} color={Colors.teal} />}
            {assets.links > 0 && <AssetBadge icon="link" label={`${assets.links} link`} color={Colors.primary} />}
            {isV2 && <AssetBadge icon="check-circle" label="Aset disertakan" color={Colors.success} />}
          </View>
        )}

        {/* Course list */}
        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 220 }}>
          {(pack.paths ?? []).map((p) => {
            const mods = (pack.modules ?? []).filter((m) => m.pathId === p.id);
            const modIds = new Set(mods.map((m) => m.id));
            const lessons = (pack.lessons ?? []).filter((l) => modIds.has(l.moduleId));
            const lessonIds = new Set(lessons.map((l) => l.id));
            const fc = (pack.flashcards ?? []).filter((f) => lessonIds.has(f.lessonId)).length;
            const qz = (pack.quizzes ?? []).filter((q) => lessonIds.has(q.lessonId)).length;
            return (
              <View key={p.id} style={[styles.previewPathCard, shadowSm]}>
                <View style={styles.previewPathHeader}>
                  <View style={styles.pathIconWrap}>
                    <Text style={styles.pathIconText}>{p.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pathName}>{p.name}</Text>
                    {p.description ? <Text style={styles.pathDesc} numberOfLines={1}>{p.description}</Text> : null}
                  </View>
                </View>
                <View style={styles.previewStats}>
                  <PreviewStat label="Modul" val={mods.length} color={Colors.primary} />
                  <PreviewStat label="Pelajaran" val={lessons.length} color={Colors.teal} />
                  <PreviewStat label="Flashcard" val={fc} color="#8B5CF6" />
                  <PreviewStat label="Soal Quiz" val={qz} color={Colors.amber} />
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Total summary */}
        <View style={styles.totalBox}>
          <Feather name="package" size={14} color={Colors.primary} />
          <Text style={styles.totalText}>
            Total: <Text style={{ fontWeight: "900", color: Colors.primary }}>{totalItems} item</Text> · Dibuat: {exportDate}
          </Text>
        </View>

        <View style={styles.importNote}>
          <Feather name="alert-circle" size={13} color={Colors.amber} />
          <Text style={styles.importNoteText}>
            Jika sudah ada kursus dengan ID yang sama, data lama akan ditimpa.
          </Text>
        </View>

        <View style={styles.importBtns}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={importing}>
            <Text style={styles.cancelBtnText}>Batal</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.confirmBtn, importing && { opacity: 0.6 }]} onPress={onConfirm} disabled={importing}>
            {importing ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Feather name="download" size={16} color={Colors.white} />
            )}
            <Text style={styles.confirmBtnText}>{importing ? "Mengimport..." : "Import Sekarang"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function PreviewStat({ label, val, color }: { label: string; val: number; color: string }) {
  return (
    <View style={[styles.previewStat, { backgroundColor: color + "15" }]}>
      <Text style={[styles.previewStatVal, { color }]}>{val}</Text>
      <Text style={[styles.previewStatLabel, { color }]}>{label}</Text>
    </View>
  );
}

function AssetBadge({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <View style={[styles.assetBadge, { backgroundColor: color + "18", borderColor: color + "40" }]}>
      <Feather name={icon as any} size={11} color={color} />
      <Text style={[styles.assetBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end", zIndex: 200,
  },
  sheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingBottom: 32, maxHeight: "85%",
  },
  importSheet: { maxHeight: "90%" },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border,
    alignSelf: "center", marginTop: 12, marginBottom: 8,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  title: { fontSize: 18, fontWeight: "900", color: Colors.dark },
  closeBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.background, alignItems: "center", justifyContent: "center",
  },
  subtitle: { fontSize: 13, color: Colors.textMuted, fontWeight: "500", lineHeight: 19, marginBottom: 16 },
  loadingWrap: { alignItems: "center", gap: 10, paddingVertical: 40 },
  loadingText: { color: Colors.textMuted, fontWeight: "600" },
  emptyWrap: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyEmoji: { fontSize: 36 },
  emptyText: { fontSize: 14, color: Colors.textMuted, fontWeight: "600" },
  listContent: { gap: 12, paddingBottom: 8 },
  allCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.primary, borderRadius: 18, padding: 16,
  },
  allCardLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  allIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center",
  },
  allCardTitle: { fontSize: 15, fontWeight: "900", color: Colors.white },
  allCardSub: { fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: "600", marginTop: 2 },
  sectionLabel: {
    fontSize: 11, fontWeight: "800", color: Colors.textMuted,
    textTransform: "uppercase", letterSpacing: 1, marginTop: 4,
  },
  pathCard: {
    backgroundColor: Colors.white, borderRadius: 18, padding: 14,
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  pathCardLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  pathIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: Colors.primaryLight, alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  pathIconText: { fontSize: 20, fontWeight: "900", color: Colors.primary },
  pathName: { fontSize: 14, fontWeight: "800", color: Colors.dark, marginBottom: 2 },
  pathDesc: { fontSize: 12, color: Colors.textMuted, fontWeight: "500", marginBottom: 6 },
  statChips: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: Colors.background, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  chipText: { fontSize: 10, fontWeight: "700", color: Colors.textMuted },
  shareBtn: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.primaryLight,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  tipBox: {
    flexDirection: "row", gap: 8, backgroundColor: Colors.primaryLight,
    borderRadius: 14, padding: 14, alignItems: "flex-start",
  },
  tipText: { flex: 1, fontSize: 12, color: Colors.primary, fontWeight: "600", lineHeight: 18 },

  // Import preview
  previewPathCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 14,
    borderWidth: 1.5, borderColor: Colors.border, marginBottom: 10,
  },
  previewPathHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  previewStats: { flexDirection: "row", gap: 6 },
  previewStat: { flex: 1, borderRadius: 10, padding: 8, alignItems: "center" },
  previewStatVal: { fontSize: 18, fontWeight: "900" },
  previewStatLabel: { fontSize: 9, fontWeight: "800", textTransform: "uppercase" },
  totalBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.primaryLight, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, marginTop: 12, marginBottom: 8,
  },
  totalText: { fontSize: 13, color: Colors.primary, fontWeight: "600", flex: 1 },
  importNote: {
    flexDirection: "row", gap: 8, backgroundColor: Colors.amberLight,
    borderRadius: 12, padding: 12, alignItems: "flex-start", marginBottom: 16,
  },
  importNoteText: { flex: 1, fontSize: 12, color: Colors.amber, fontWeight: "600", lineHeight: 18 },
  importBtns: { flexDirection: "row", gap: 10 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: "center",
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border,
  },
  cancelBtnText: { fontSize: 14, fontWeight: "800", color: Colors.textSecondary },
  confirmBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 16, alignItems: "center",
    backgroundColor: Colors.primary, flexDirection: "row", justifyContent: "center", gap: 8,
  },
  confirmBtnText: { fontSize: 14, fontWeight: "900", color: Colors.white },

  stepBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.primaryLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 10,
  },
  stepText: { fontSize: 12, fontWeight: "600", color: Colors.primary, flex: 1 },

  assetBadgeRow: {
    flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10,
  },
  assetBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    borderWidth: 1,
  },
  assetBadgeText: { fontSize: 11, fontWeight: "700" },
});
