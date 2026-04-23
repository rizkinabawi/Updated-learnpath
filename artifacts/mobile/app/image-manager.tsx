import React, { useCallback, useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, Image, StyleSheet,
  Platform, Alert, ActivityIndicator, FlatList, Dimensions, Modal,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as FileSystem from "@/utils/fs-compat";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { toast } from "@/components/Toast";

const IMAGE_EXTS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "heic", "heif",
  "JPG", "JPEG", "PNG", "GIF", "WEBP", "HEIC", "HEIF",
]);

const DIR_DEFS = [
  { label: "Foto Quiz",      key: "quiz",      folder: "quiz-images/",     color: "#EF4444" },
  { label: "Foto Flashcard", key: "flashcard", folder: "flashcard-images/", color: "#8B5CF6" },
  { label: "Materi Belajar", key: "material",  folder: "study-materials/",  color: "#0EA5E9" },
  { label: "Foto Profil",    key: "avatar",    folder: "avatars/",           color: "#10B981" },
];

interface ImageItem {
  uri: string;
  name: string;
  dir: string;
  dirLabel: string;
  dirColor: string;
  size: number;
}

const { width: SW, height: SH } = Dimensions.get("window");
const COLS = 3;
const GUTTER = 6;
const PADDING = 16;
const THUMB = Math.floor((SW - PADDING * 2 - GUTTER * (COLS - 1)) / COLS);

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImageManager() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImageItem | null>(null);

  const load = useCallback(async () => {
    if ((Platform.OS as string) === "web") { setLoading(false); return; }
    setLoading(true);

    // Compute paths at runtime so FileSystem is fully initialized
    const base = FileSystem.documentDirectory ?? "";
    const DIRS = DIR_DEFS.map((d) => ({ ...d, path: base + d.folder }));

    const result: ImageItem[] = [];
    for (const dir of DIRS) {
      try {
        const info = await FileSystem.getInfoAsync(dir.path);
        if (!info.exists) continue;
        const files = await FileSystem.readDirectoryAsync(dir.path);
        for (const f of files) {
          const ext = f.split(".").pop() ?? "";
          if (!IMAGE_EXTS.has(ext)) continue;
          const uri = dir.path + f;
          let size = 0;
          try {
            const fi = await FileSystem.getInfoAsync(uri, { size: true });
            size = (fi as any).size ?? 0;
          } catch {}
          result.push({
            uri, name: f,
            dir: dir.key, dirLabel: dir.label, dirColor: dir.color, size,
          });
        }
      } catch {}
    }
    result.sort((a, b) => b.size - a.size);
    setImages(result);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleSelect = (uri: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  };

  const deleteSelected = () => {
    if (selected.size === 0) return;
    Alert.alert(
      "Hapus Gambar",
      `Hapus ${selected.size} gambar yang dipilih? Tindakan ini tidak bisa dibatalkan.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus", style: "destructive",
          onPress: async () => {
            let ok = 0;
            for (const uri of selected) {
              try { await FileSystem.deleteAsync(uri, { idempotent: true }); ok++; } catch {}
            }
            setImages((prev) => prev.filter((img) => !selected.has(img.uri)));
            setSelected(new Set());
            toast.success(`${ok} gambar dihapus`);
          },
        },
      ]
    );
  };

  const deleteOne = (item: ImageItem) => {
    Alert.alert("Hapus Gambar", `Hapus "${item.name}"?`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus", style: "destructive",
        onPress: async () => {
          try {
            await FileSystem.deleteAsync(item.uri, { idempotent: true });
            setImages((prev) => prev.filter((img) => img.uri !== item.uri));
            setSelected((prev) => { const n = new Set(prev); n.delete(item.uri); return n; });
            if (preview?.uri === item.uri) setPreview(null);
            toast.info("Gambar dihapus");
          } catch {
            toast.error("Gagal menghapus gambar");
          }
        },
      },
    ]);
  };

  const filtered = filter ? images.filter((img) => img.dir === filter) : images;
  const totalSize = images.reduce((s, i) => s + i.size, 0);
  const isSelecting = selected.size > 0;

  if ((Platform.OS as string) === "web") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: Colors.textMuted, fontSize: 14 }}>
          Image Manager hanya tersedia di perangkat mobile.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <LinearGradient
        colors={["#0EA5E9", "#6366F1"]}
        style={[styles.header, { paddingTop: (Platform.OS as string) === "web" ? 60 : insets.top + 16 }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Image Manager</Text>
            <Text style={styles.headerSub}>
              {images.length} gambar · {formatBytes(totalSize)} total
            </Text>
          </View>
          {isSelecting && (
            <TouchableOpacity style={styles.deleteBtn} onPress={deleteSelected}>
              <Feather name="trash-2" size={18} color="#fff" />
              <Text style={styles.deleteBtnText}>{selected.size}</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
          <TouchableOpacity
            style={[styles.filterChip, filter === null && styles.filterChipActive]}
            onPress={() => setFilter(null)}
          >
            <Text style={[styles.filterText, filter === null && styles.filterTextActive]}>
              Semua ({images.length})
            </Text>
          </TouchableOpacity>
          {DIR_DEFS.map((d) => {
            const cnt = images.filter((i) => i.dir === d.key).length;
            if (cnt === 0) return null;
            const active = filter === d.key;
            return (
              <TouchableOpacity
                key={d.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(active ? null : d.key)}
              >
                <View style={[styles.filterDot, { backgroundColor: d.color }]} />
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {d.label} ({cnt})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </LinearGradient>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ color: Colors.textMuted, fontSize: 14 }}>Memuat gambar...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <Feather name="image" size={48} color={Colors.border} />
          <Text style={{ color: Colors.textMuted, fontSize: 15, fontWeight: "700" }}>Tidak ada gambar</Text>
          <Text style={{ color: Colors.textMuted, fontSize: 13, textAlign: "center", paddingHorizontal: 32 }}>
            Gambar akan muncul di sini saat kamu menambahkannya ke quiz, flashcard, atau materi belajar
          </Text>
          <TouchableOpacity onPress={load} style={styles.refreshBtn}>
            <Feather name="refresh-cw" size={14} color={Colors.primary} />
            <Text style={styles.refreshBtnText}>Muat Ulang</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          numColumns={COLS}
          keyExtractor={(item) => item.uri}
          contentContainerStyle={{ padding: PADDING, gap: GUTTER }}
          columnWrapperStyle={{ gap: GUTTER }}
          renderItem={({ item }) => {
            const isSel = selected.has(item.uri);
            return (
              <TouchableOpacity
                style={[styles.imgCell, isSel && styles.imgCellSelected]}
                onPress={() => {
                  if (isSelecting) { toggleSelect(item.uri); }
                  else { setPreview(item); }
                }}
                onLongPress={() => toggleSelect(item.uri)}
                activeOpacity={0.85}
              >
                <Image
                  source={{ uri: item.uri }}
                  style={styles.thumb}
                  resizeMode="cover"
                />
                <View style={[styles.catDot, { backgroundColor: item.dirColor }]} />
                <View style={styles.sizeLabel}>
                  <Text style={styles.sizeLabelText}>{formatBytes(item.size)}</Text>
                </View>
                {isSel && (
                  <View style={styles.checkOverlay}>
                    <Feather name="check-circle" size={28} color="#fff" />
                  </View>
                )}
                {!isSelecting && (
                  <TouchableOpacity
                    style={styles.deleteOneBtn}
                    onPress={() => deleteOne(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="x" size={12} color="#fff" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {isSelecting && (
        <View style={[styles.selectBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity style={styles.selectBarCancel} onPress={() => setSelected(new Set())}>
            <Text style={styles.selectBarCancelText}>Batal</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectBarDelete} onPress={deleteSelected}>
            <Feather name="trash-2" size={16} color="#fff" />
            <Text style={styles.selectBarDeleteText}>Hapus {selected.size} Gambar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Fullscreen Lightbox ───────────────────────────────────────── */}
      <Modal
        visible={!!preview}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPreview(null)}
      >
        {preview && (
          <View style={styles.lightboxBg}>
            <StatusBar hidden />

            {/* Top bar */}
            <View style={[styles.lightboxTop, { paddingTop: insets.top + 8 }]}>
              <View style={[styles.lightboxDot, { backgroundColor: preview.dirColor }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.lightboxName} numberOfLines={1}>{preview.name}</Text>
                <Text style={styles.lightboxMeta}>{preview.dirLabel} · {formatBytes(preview.size)}</Text>
              </View>
              <TouchableOpacity onPress={() => setPreview(null)} style={styles.lightboxClose}>
                <Feather name="x" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Full image — flexible, shows full image */}
            <View style={styles.lightboxImgWrap}>
              <Image
                source={{ uri: preview.uri }}
                style={styles.lightboxImg}
                resizeMode="contain"
              />
            </View>

            {/* Bottom bar */}
            <View style={[styles.lightboxBottom, { paddingBottom: Math.max(insets.bottom, 20) }]}>
              <TouchableOpacity
                style={styles.lightboxDeleteBtn}
                onPress={() => {
                  setPreview(null);
                  setTimeout(() => deleteOne(preview), 300);
                }}
              >
                <Feather name="trash-2" size={16} color="#fff" />
                <Text style={styles.lightboxDeleteText}>Hapus Gambar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#fff" },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: "600", marginTop: 2 },
  deleteBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(239,68,68,0.85)", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  deleteBtnText: { fontSize: 14, fontWeight: "900", color: "#fff" },
  filterChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  filterChipActive: { backgroundColor: "#fff" },
  filterDot: { width: 7, height: 7, borderRadius: 999 },
  filterText: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.85)" },
  filterTextActive: { color: "#4C6FFF" },

  // Thumbnail grid
  imgCell: {
    width: THUMB, height: THUMB,
    borderRadius: 12, overflow: "hidden",
    backgroundColor: Colors.border,
    position: "relative",
  },
  imgCellSelected: { borderWidth: 3, borderColor: Colors.primary },
  thumb: { width: "100%", height: "100%" },
  catDot: {
    position: "absolute", top: 6, left: 6,
    width: 8, height: 8, borderRadius: 999,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.5)",
  },
  sizeLabel: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(0,0,0,0.45)", paddingVertical: 3, alignItems: "center",
  },
  sizeLabelText: { fontSize: 9, color: "#fff", fontWeight: "700" },
  checkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(76,111,255,0.55)",
    alignItems: "center", justifyContent: "center",
  },
  deleteOneBtn: {
    position: "absolute", top: 4, right: 4,
    width: 20, height: 20, borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center",
  },

  // Empty state refresh
  refreshBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 4, paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 12, borderWidth: 1.5, borderColor: Colors.primary,
  },
  refreshBtnText: { fontSize: 13, fontWeight: "700", color: Colors.primary },

  // Select bar
  selectBar: {
    flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  selectBarCancel: {
    flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: "center",
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border,
  },
  selectBarCancelText: { fontSize: 14, fontWeight: "800", color: Colors.textMuted },
  selectBarDelete: {
    flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 13, borderRadius: 14, backgroundColor: Colors.danger,
  },
  selectBarDeleteText: { fontSize: 14, fontWeight: "900", color: "#fff" },

  // Lightbox
  lightboxBg: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.96)",
    justifyContent: "space-between",
  },
  lightboxTop: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingBottom: 12,
  },
  lightboxDot: {
    width: 10, height: 10, borderRadius: 999,
  },
  lightboxName: {
    fontSize: 14, fontWeight: "800", color: "#fff",
  },
  lightboxMeta: {
    fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: "600", marginTop: 2,
  },
  lightboxClose: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  lightboxImgWrap: {
    flex: 1,
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 8,
  },
  lightboxImg: {
    width: SW - 16,
    height: SH * 0.7,
  },
  lightboxBottom: {
    paddingHorizontal: 16, paddingTop: 12,
    alignItems: "center",
  },
  lightboxDeleteBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(239,68,68,0.85)",
    paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 14,
  },
  lightboxDeleteText: { fontSize: 14, fontWeight: "800", color: "#fff" },
});
