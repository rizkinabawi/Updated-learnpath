import { useColors } from "@/contexts/ThemeContext";
import React, { useEffect, useState, useMemo } from "react";
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
import { exportCoursePackAsZip } from "@/utils/zip-handler";
import { shadowSm, type ColorScheme } from "@/constants/colors";
import { isCancellationError } from "@/utils/safe-share";
import { toast } from "@/components/Toast";

type ShareFormat = "json" | "zip";

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
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState<string | null>(null);
  const [sharingStep, setSharingStep] = useState<string>("");
  const [pathStats, setPathStats] = useState<PathStat[]>([]);
  const [format, setFormat] = useState<ShareFormat>("json");

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

  const doShare = async (pathId?: string, isDownload: boolean = false) => {
    const id = pathId ?? "all";
    setSharing(id);
    try {
      setSharingStep(isDownload ? "Menyiapkan file download..." : "Memuat data kursus...");
      const rawPack = pathId ? await exportCourse(pathId) : await exportCourse("*");

      setSharingStep("Menyiapkan gambar & file...");
      const pack = await embedAssetsInPack(rawPack);

      const pathName = pathId
        ? (pathStats.find((s) => s.path.id === pathId)?.path.name ?? "kursus")
        : "semua-kursus";

      const ext = format === "zip" ? "lzip" : "lpack";
      const filename = `${pathName.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.${ext}`;

      if (format === "zip") {
        setSharingStep(isDownload ? "Menyimpan ke memori..." : "Membuat file ZIP...");
        // Use the ZIP handler to get the URI
        const zipUri = await exportCoursePackAsZip(pack, pathName, true); // Added 'silent' or 'returnUri' flag logic later
        
        if (isDownload) {
          const success = await FileSystem.downloadToFile(zipUri, filename, "application/zip");
          if (success) toast.success("File berhasil disimpan ke perangkat!");
        } else {
          // Share logic is handled inside exportCoursePackAsZip normally, 
          // but we might need to adjust it to support download
          await exportCoursePackAsZip(pack, pathName);
        }
        return;
      }

      setSharingStep("Memproses bundle...");
      const json = JSON.stringify(pack);

      if (Platform.OS === "web") {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
      } else {
        const fileUri = (FileSystem.cacheDirectory ?? "") + filename;
        await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
        
        if (isDownload) {
           const success = await FileSystem.downloadToFile(fileUri, filename, "application/json");
           if (success) toast.success("File berhasil disimpan ke perangkat!");
        } else {
          const assets = countEmbeddedAssets(pack);
          const assetSummary = [
            assets.images > 0 ? `${assets.images} gambar` : "",
            assets.files > 0 ? `${assets.files} file` : "",
            assets.links > 0 ? `${assets.links} link` : "",
          ].filter(Boolean).join(", ");

          setSharingStep("Membagikan...");
          const assetMsg = assetSummary ? ` Sudah termasuk ${assetSummary}.` : "";
          const shareMsg =
            `Bundle Kursus: ${pathName}\n` +
            `${pack.lessons?.length ?? 0} pelajaran · ${pack.flashcards?.length ?? 0} flashcard · ${pack.quizzes?.length ?? 0} soal quiz.${assetMsg}\n` +
            `Import file ini ke Mobile Learning App untuk langsung belajar!`;

          if (Platform.OS === "ios") {
            await Share.share({ url: fileUri, title: `Bundle Kursus: ${pathName}` });
          } else {
            await Share.share({ url: fileUri, title: `Bundle Kursus: ${pathName}`, message: shareMsg });
          }
        }
      }
    } catch (e) {
      if (!isCancellationError(e)) console.warn("[CourseBundleModal] action error", e);
      toast.error("Terjadi kesalahan saat memproses file.");
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
            <Feather name="x" size={20} color={colors.dark} />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>
          Gambar, file, dan link materi belajar ikut dibundel. Teman cukup import satu file dan semua struktur kursus otomatis terbuat!
        </Text>

        {/* Format toggle: JSON vs ZIP */}
        <View style={styles.formatRow}>
          <Text style={styles.formatLabel}>Format:</Text>
          <View style={styles.segmented}>
            <TouchableOpacity
              style={[styles.segment, format === "json" && styles.segmentActive]}
              onPress={() => setFormat("json")}
              disabled={sharing !== null}
              activeOpacity={0.8}
            >
              <Feather name="file-text" size={13} color={format === "json" ? colors.white : colors.textMuted} />
              <Text style={[styles.segmentText, format === "json" && styles.segmentTextActive]}>JSON</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segment, format === "zip" && styles.segmentActive]}
              onPress={() => setFormat("zip")}
              disabled={sharing !== null}
              activeOpacity={0.8}
            >
              <Feather name="archive" size={13} color={format === "zip" ? colors.white : colors.textMuted} />
              <Text style={[styles.segmentText, format === "zip" && styles.segmentTextActive]}>ZIP</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Sharing progress step */}
        {sharing !== null && sharingStep ? (
          <View style={styles.stepBanner}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.stepText}>{sharingStep}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
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
            <View style={[styles.allCard, shadowSm]}>
              <View style={styles.allCardLeft}>
                <View style={styles.allIcon}>
                  <Feather name="package" size={22} color={colors.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.allCardTitle}>Semua Kursus</Text>
                  <Text style={styles.allCardSub}>
                    {pathStats.length} kursus · {totalStats.modules} modul · {totalStats.lessons} pelajaran
                  </Text>
                </View>
              </View>
              
              <View style={styles.allActions}>
                <TouchableOpacity 
                  style={styles.actionIconButton} 
                  onPress={() => doShare(undefined, true)}
                  disabled={sharing !== null}
                >
                   {sharing === "all" ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="download" size={18} color="#fff" />}
                </TouchableOpacity>
                <View style={styles.actionDivider} />
                <TouchableOpacity 
                  style={styles.actionIconButton} 
                  onPress={() => doShare(undefined, false)}
                  disabled={sharing !== null}
                >
                   {sharing === "all" ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="share-2" size={18} color="#fff" />}
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.sectionLabel}>Atau pilih satu kursus:</Text>

            {pathStats.map((s) => (
              <View key={s.path.id} style={[styles.pathCard, shadowSm]}>
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
                
                <View style={styles.rowActions}>
                   <TouchableOpacity 
                    style={styles.shareBtn} 
                    onPress={() => doShare(s.path.id, true)}
                    disabled={sharing !== null}
                   >
                     {sharing === s.path.id ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="download" size={16} color={colors.primary} />}
                   </TouchableOpacity>
                   <TouchableOpacity 
                    style={styles.shareBtn} 
                    onPress={() => doShare(s.path.id, false)}
                    disabled={sharing !== null}
                   >
                     {sharing === s.path.id ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="share-2" size={16} color={colors.primary} />}
                   </TouchableOpacity>
                </View>
              </View>
            ))}

            <View style={styles.tipBox}>
              <Feather name="info" size={13} color={colors.primary} />
              <Text style={styles.tipText}>
                {format === "zip"
                  ? "Bundle dibagikan sebagai .zip — gambar & file disimpan terpisah agar ukuran lebih kecil. Import lewat Profil → Import Bundle Kursus → pilih file .zip."
                  : "File bundle akan dibagikan sebagai .json. Pilih ZIP jika kursus berisi banyak gambar/file untuk hasil yang lebih kecil."}
              </Text>
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function StatChip({ icon, val, label }: { icon: string; val: number; label: string }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (val === 0) return null;
  return (
    <View style={styles.chip}>
      <Feather name={icon as any} size={10} color={colors.textMuted} />
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
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
            <Feather name="x" size={20} color={colors.dark} />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>Berikut isi bundle yang akan diimport ke akunmu:</Text>

        {/* Asset badge */}
        {hasAssets && (
          <View style={styles.assetBadgeRow}>
            {assets.images > 0 && <AssetBadge icon="image" label={`${assets.images} gambar`} color="#8B5CF6" />}
            {assets.files > 0 && <AssetBadge icon="file" label={`${assets.files} file`} color={colors.teal} />}
            {assets.links > 0 && <AssetBadge icon="link" label={`${assets.links} link`} color={colors.primary} />}
            {isV2 && <AssetBadge icon="check-circle" label="Aset disertakan" color={colors.success} />}
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
                  <PreviewStat label="Modul" val={mods.length} color={colors.primary} />
                  <PreviewStat label="Pelajaran" val={lessons.length} color={colors.teal} />
                  <PreviewStat label="Flashcard" val={fc} color={colors.purple} />
                  <PreviewStat label="Soal Quiz" val={qz} color={colors.amber} />
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Total summary */}
        <View style={styles.totalBox}>
          <Feather name="package" size={14} color={colors.primary} />
          <Text style={styles.totalText}>
            Total: <Text style={{ fontWeight: "900", color: colors.primary }}>{totalItems} item</Text> · Dibuat: {exportDate}
          </Text>
        </View>

        <View style={styles.importNote}>
          <Feather name="alert-circle" size={13} color={colors.amber} />
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
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Feather name="download" size={16} color={colors.white} />
            )}
            <Text style={styles.confirmBtnText}>{importing ? "Mengimport..." : "Import Sekarang"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function PreviewStat({ label, val, color }: { label: string; val: number; color: string }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.previewStat, { backgroundColor: color + "15" }]}>
      <Text style={[styles.previewStatVal, { color }]}>{val}</Text>
      <Text style={[styles.previewStatLabel, { color }]}>{label}</Text>
    </View>
  );
}

function AssetBadge({ icon, label, color }: { icon: string; label: string; color: string }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.assetBadge, { backgroundColor: color + "18", borderColor: color + "40" }]}>
      <Feather name={icon as any} size={11} color={color} />
      <Text style={[styles.assetBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

const makeStyles = (c: ColorScheme) => StyleSheet.create({
  overlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end", zIndex: 200,
  },
  sheet: {
    backgroundColor: c.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingBottom: 32, maxHeight: "85%",
  },
  importSheet: { maxHeight: "90%" },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: c.border,
    alignSelf: "center", marginTop: 12, marginBottom: 8,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  title: { fontSize: 18, fontWeight: "900", color: c.dark },
  closeBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: c.background, alignItems: "center", justifyContent: "center",
  },
  subtitle: { fontSize: 13, color: c.textMuted, fontWeight: "500", lineHeight: 19, marginBottom: 16 },
  loadingWrap: { alignItems: "center", gap: 10, paddingVertical: 40 },
  loadingText: { color: c.textMuted, fontWeight: "600" },
  emptyWrap: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyEmoji: { fontSize: 36 },
  emptyText: { fontSize: 14, color: c.textMuted, fontWeight: "600" },
  listContent: { gap: 12, paddingBottom: 8 },
  allCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: c.primary, borderRadius: 18, padding: 16,
  },
  allCardLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  allIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center",
  },
  allCardTitle: { fontSize: 15, fontWeight: "900", color: c.white },
  allCardSub: { fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: "600", marginTop: 2 },
  allActions: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 14,
    paddingHorizontal: 4,
  },
  actionIconButton: {
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionDivider: {
    width: 1,
    height: 18,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  sectionLabel: {
    fontSize: 11, fontWeight: "800", color: c.textMuted,
    textTransform: "uppercase", letterSpacing: 1, marginTop: 4,
  },
  pathCard: {
    backgroundColor: c.white, borderRadius: 18, padding: 14,
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1.5, borderColor: c.border,
  },
  pathCardLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  pathIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: c.primaryLight, alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  pathIconText: { fontSize: 20, fontWeight: "900", color: c.primary },
  pathName: { fontSize: 14, fontWeight: "800", color: c.dark, marginBottom: 2 },
  pathDesc: { fontSize: 12, color: c.textMuted, fontWeight: "500", marginBottom: 6 },
  statChips: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: c.background, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  chipText: { fontSize: 10, fontWeight: "700", color: c.textMuted },
  rowActions: {
    flexDirection: "row",
    gap: 8,
  },
  shareBtn: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: c.primaryLight,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  tipBox: {
    flexDirection: "row", gap: 8, backgroundColor: c.primaryLight,
    borderRadius: 14, padding: 14, alignItems: "flex-start",
  },
  tipText: { flex: 1, fontSize: 12, color: c.primary, fontWeight: "600", lineHeight: 18 },

  formatRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 4, marginTop: 4,
  },
  formatLabel: { fontSize: 12, fontWeight: "700", color: c.textMuted },
  segmented: {
    flexDirection: "row", backgroundColor: c.background,
    borderRadius: 10, padding: 3, gap: 3, flex: 1,
    borderWidth: 1, borderColor: c.border,
  },
  segment: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingVertical: 7, borderRadius: 8,
  },
  segmentActive: { backgroundColor: c.primary },
  segmentText: { fontSize: 12, fontWeight: "700", color: c.textMuted },
  segmentTextActive: { color: c.white },

  // Import preview
  previewPathCard: {
    backgroundColor: c.white, borderRadius: 16, padding: 14,
    borderWidth: 1.5, borderColor: c.border, marginBottom: 10,
  },
  previewPathHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  previewStats: { flexDirection: "row", gap: 6 },
  previewStat: { flex: 1, borderRadius: 10, padding: 8, alignItems: "center" },
  previewStatVal: { fontSize: 18, fontWeight: "900" },
  previewStatLabel: { fontSize: 9, fontWeight: "800", textTransform: "uppercase" },
  totalBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: c.primaryLight, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, marginTop: 12, marginBottom: 8,
  },
  totalText: { fontSize: 13, color: c.primary, fontWeight: "600", flex: 1 },
  importNote: {
    flexDirection: "row", gap: 8, backgroundColor: c.amberLight,
    borderRadius: 12, padding: 12, alignItems: "flex-start", marginBottom: 16,
  },
  importNoteText: { flex: 1, fontSize: 12, color: c.amber, fontWeight: "600", lineHeight: 18 },
  importBtns: { flexDirection: "row", gap: 10 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: "center",
    backgroundColor: c.background, borderWidth: 1.5, borderColor: c.border,
  },
  cancelBtnText: { fontSize: 14, fontWeight: "800", color: c.textSecondary },
  confirmBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 16, alignItems: "center",
    backgroundColor: c.primary, flexDirection: "row", justifyContent: "center", gap: 8,
  },
  confirmBtnText: { fontSize: 14, fontWeight: "900", color: c.white },

  stepBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: c.primaryLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 10,
  },
  stepText: { fontSize: 12, fontWeight: "600", color: c.primary, flex: 1 },

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
