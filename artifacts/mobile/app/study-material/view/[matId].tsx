import { useColors, useTheme } from "@/contexts/ThemeContext";
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  Image,
  Dimensions,
  Linking,
  Modal,
  ActivityIndicator,
} from "react-native";
import { WebView } from "react-native-webview";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChevronLeft,
  ChevronRight,
  X,
  PencilLine,
  Paperclip,
  ExternalLink,
  Globe,
  Video,
  Code2,
  FileText,
  FileImage,
  BookOpen,
  Clock,
  Eye,
} from "lucide-react-native";
import { Feather } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import {
  getStudyMaterials,
  getLessons,
  type StudyMaterial,
} from "@/utils/storage";
import { type ColorScheme } from "@/constants/colors";
import { toast } from "@/components/Toast";
import { isCancellationError } from "@/utils/safe-share";
import { resolveAssetUri } from "@/utils/path-resolver";
import { isFeatureAllowed } from "@/utils/security/app-license";
import * as FileSystem from "@/utils/fs-compat";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const PLAYER_WIDTH = Math.min(SCREEN_WIDTH - 32, 720);
const PLAYER_HEIGHT = Math.round((PLAYER_WIDTH * 9) / 16);

const extractYoutubeId = (url: string): string | null => {
  try {
    const u = url.trim();
    const m =
      u.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) ||
      u.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/) ||
      u.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/) ||
      u.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
};

/** Transform Google Docs/Sheets URLs for better in-app embedding */
const transformDocUrl = (url: string): string => {
  if (!url.includes("docs.google.com")) return url;
  // Handle Sheets
  if (url.includes("/spreadsheets/")) {
    if (url.includes("/edit")) return url.split("/edit")[0] + "/preview";
    return url;
  }
  // Handle Docs
  if (url.includes("/edit")) return url.replace("/edit", "/preview");
  if (url.includes("/view")) return url.replace("/view", "/preview");
  return url;
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const makeTypeMeta = (colors: ColorScheme): Record<
  StudyMaterial["type"],
  { label: string; color: string; bg: string; Icon: any }
> => ({
  text: { label: "Teks", color: colors.primary, bg: colors.primaryLight, Icon: FileText },
  html: { label: "HTML", color: colors.purple, bg: colors.purpleLight, Icon: Code2 },
  file: { label: "File", color: colors.amber, bg: colors.amberLight, Icon: Paperclip },
  youtube: { label: "YouTube", color: "#FF0000", bg: "#FFF0F0", Icon: Video },
  googledoc: { label: "Google Docs", color: "#1967D2", bg: "#E8F0FE", Icon: Globe },
  image: { label: "Gambar", color: colors.success, bg: colors.successLight, Icon: FileImage },
});

import { useOverlay } from "@/contexts/OverlayContext";

function YoutubePlayer({ 
  url, 
  title, 
  linkBoxStyle, 
  mutedColor 
}: { 
  url: string; 
  title?: string;
  linkBoxStyle: any; 
  mutedColor: string 
}) {
  const { showVideo } = useOverlay();
  const id = extractYoutubeId(url);
  
  if (!id)
    return (
      <TouchableOpacity
        style={linkBoxStyle}
        onPress={() => Linking.openURL(url).catch(() => {})}
      >
        <Video size={20} color="#FF0000" />
        <Text style={{ flex: 1, fontWeight: "700", color: "#FF0000" }}>
          Buka di YouTube
        </Text>
        <ExternalLink size={14} color={mutedColor} />
      </TouchableOpacity>
    );

  const embedUrl = `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&modestbranding=1`;

  return (
    <View style={{ width: PLAYER_WIDTH, gap: 10 }}>
      {Platform.OS === "web" ? (
        // @ts-ignore
        <iframe
          src={embedUrl}
          width={PLAYER_WIDTH}
          height={PLAYER_HEIGHT}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ borderRadius: 12, display: "block" }}
        />
      ) : (
        <WebView
          source={{ 
            html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;background:#000}.w{position:relative;padding-top:56.25%}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head><body><div class="w"><iframe src="${embedUrl}" allow="autoplay;encrypted-media;picture-in-picture;fullscreen" allowfullscreen></iframe></div></body></html>`, 
            baseUrl: "https://www.youtube-nocookie.com" 
          }}
          style={{ width: PLAYER_WIDTH, height: PLAYER_HEIGHT, borderRadius: 12 }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          allowsFullscreenVideo
          scrollEnabled={false}
          onShouldStartLoadWithRequest={(req) => {
            const u = req.url;
            return !(
              u.startsWith("intent://") ||
              u.startsWith("vnd.youtube") ||
              u.startsWith("youtube://") ||
              u.startsWith("market://")
            );
          }}
        />
      )}
      
      <TouchableOpacity 
        style={[linkBoxStyle, { borderStyle: "dashed", borderWidth: 1 }]}
        onPress={async () => {
          const allowed = await isFeatureAllowed("pip");
          if (!allowed) {
            Alert.alert("Fitur Terkunci", "Mode Gambar-dalam-Gambar (PiP) hanya tersedia di versi Premium.");
            return;
          }
          showVideo(id, title);
          toast.success("Video melayang! Kamu bisa navigasi ke layar lain.");
        }}
      >
        <Feather name="external-link" size={16} color={mutedColor} />
        <Text style={{ flex: 1, fontWeight: "700", color: mutedColor }}>
          Aktifkan Video Melayang (PIP)
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function MaterialFullView() {
  const { isDark, palette } = useTheme();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);

  const { matId, lessonId } = useLocalSearchParams<{
    matId: string;
    lessonId?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [lessonName, setLessonName] = useState("");
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [csvData, setCsvData] = useState<string[][] | null>(null);
  const [isBookMode, setIsBookMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  const safeMatId = Array.isArray(matId) ? matId[0] : matId ?? "";

  useEffect(() => {
    (async () => {
      let lid = Array.isArray(lessonId) ? lessonId[0] : lessonId;
      if (!lid) {
        // Fallback: load all materials and find the one we want
        const all = await getStudyMaterials();
        const found = all.find((m) => m.id === safeMatId);
        if (!found) return;
        lid = found.lessonId;
      }
      const list = await getStudyMaterials(lid);
      list.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setMaterials(list);
      const lessons = await getLessons();
      const lesson = lessons.find((l) => l.id === lid);
      if (lesson) setLessonName(lesson.name);
    })();
  }, [safeMatId, lessonId]);

  // Handle CSV parsing when the material is a CSV
  useEffect(() => {
    const isCsv = 
      current?.type === "file" && 
      current.filePath && 
      (
        current.fileMime?.toLowerCase().includes("epub") || 
        current.fileName?.toLowerCase().endsWith(".epub") ||
        current.fileMime?.toLowerCase().includes("csv") || 
        current.fileName?.toLowerCase().endsWith(".csv") ||
        current.fileMime === "text/comma-separated-values" ||
        current.fileMime === "text/plain" && current.fileName?.toLowerCase().endsWith(".csv")
      );

    if (isCsv) {
      (async () => {
        try {
          let text = "";
          if (Platform.OS === "web") {
            const res = await fetch(current.filePath!);
            text = await res.text();
          } else {
            text = await FileSystem.readAsStringAsync(current.filePath!);
          }
          if (!text || !text.trim()) {
            setCsvData([]);
            return;
          }
          // Detect separator (comma or semicolon)
          const firstLine = text.split(/\r?\n/)[0] || "";
          const sep = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
          
          const rows = text.split(/\r?\n/)
            .filter(r => r.trim())
            .map(r => r.split(sep).map(c => c.trim().replace(/^["']|["']$/g, "")));
          setCsvData(rows);
        } catch (e: any) {
          console.warn("CSV parse failed", e);
          toast.error("Gagal membaca file CSV: " + (e?.message || "Format tidak didukung"));
          setCsvData(null);
        }
      })();
    } else {
      setCsvData(null);
    }
  }, [current]);

  const idx = useMemo(
    () => materials.findIndex((m) => m.id === safeMatId),
    [materials, safeMatId],
  );

  const current = idx >= 0 ? materials[idx] : null;
  const goPrev = () => {
    if (idx > 0) {
      router.replace({
        pathname: "/study-material/view/[matId]",
        params: { matId: materials[idx - 1].id, lessonId: materials[idx - 1].lessonId },
      });
    }
  };
  const goNext = () => {
    if (idx >= 0 && idx < materials.length - 1) {
      router.replace({
        pathname: "/study-material/view/[matId]",
        params: { matId: materials[idx + 1].id, lessonId: materials[idx + 1].lessonId },
      });
    }
  };

  const goEdit = () => {
    if (!current) return;
    router.push({
      pathname: "/study-material/[lessonId]",
      params: { lessonId: current.lessonId, openEditId: current.id },
    });
  };

  const openFile = async (mat: StudyMaterial) => {
    if (!mat.filePath) return;
    try {
      if (Platform.OS !== "web") {
        const can = await Sharing.isAvailableAsync();
        if (can) {
          await Sharing.shareAsync(mat.filePath, {
            dialogTitle: mat.title,
            mimeType: mat.fileMime,
            UTI: mat.fileMime,
          });
        }
      } else {
        await Linking.openURL(mat.filePath);
      }
    } catch (e) {
      if (!isCancellationError(e)) toast.error("Tidak bisa membuka file");
    }
  };

  if (!current) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: colors.textMuted }}>Materi tidak ditemukan</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.editBtn, { marginTop: 12 }]}>
          <Text style={styles.editBtnText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const meta = makeTypeMeta(colors)[current.type];
  const Icon = meta.Icon;
  const total = materials.length;
  const hasPrev = idx > 0;
  const hasNext = idx < total - 1;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === "web" ? 60 : insets.top + 12, backgroundColor: meta.color },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <X size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSub} numberOfLines={1}>
            {lessonName} · {idx + 1}/{total}
          </Text>
          <Text style={styles.headerTitle} numberOfLines={2}>
            {current.title}
          </Text>
        </View>
        <TouchableOpacity onPress={goEdit} style={styles.editBtn}>
          <PencilLine size={16} color="#fff" />
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
        {(current.type === "text" || current.type === "html") && (
          <TouchableOpacity 
            onPress={() => setIsBookMode(!isBookMode)} 
            style={[styles.backBtn, { marginLeft: 0, backgroundColor: isBookMode ? "#fff" : "rgba(255,255,255,0.2)" }]}
          >
            <BookOpen size={18} color={isBookMode ? meta.color : "#fff"} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 100 }]}
      >
        <View style={[styles.metaRow, { backgroundColor: meta.bg }]}>
          <Icon size={14} color={meta.color} />
          <Text style={[styles.metaText, { color: meta.color }]}>{meta.label}</Text>
          <View style={{ flex: 1 }} />
          {isBookMode && (
            <Text style={[styles.metaText, { color: meta.color, marginRight: 8 }]}>
              Hal. {currentPage + 1}
            </Text>
          )}
          <Clock size={11} color={colors.textMuted} />
          <Text style={styles.metaDate}>{formatDate(current.createdAt)}</Text>
        </View>

        {(current.type === "text" || current.type === "html") && isBookMode ? (
          <View style={{ height: SCREEN_HEIGHT - insets.top - insets.bottom - 160 }}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const page = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_WIDTH - 32));
                setCurrentPage(page);
              }}
            >
              {(current.type === "text" 
                ? (current.content.match(/[\s\S]{1,1500}(?:\n\n|$)/g) || [current.content])
                : (current.content.split(/<hr\s*\/?>/i))
              ).map((pageContent, pidx) => (
                <View key={pidx} style={{ width: SCREEN_WIDTH - 32, paddingRight: 16 }}>
                  {current.type === "text" ? (
                    <Text style={[styles.bodyText, { fontSize: 18 }]} selectable>{pageContent}</Text>
                  ) : (
                    <WebView
                      originWhitelist={["*"]}
                      source={{ html: `<style>body{font-family:sans-serif;font-size:18px;line-height:1.6;color:${colors.text};background:transparent;margin:0;padding:0;}</style>${pageContent}` }}
                      style={{ flex: 1, backgroundColor: "transparent" }}
                    />
                  )}
                </View>
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 4, marginTop: 12 }}>
              {(current.type === "text" 
                ? (current.content.match(/[\s\S]{1,1500}(?:\n\n|$)/g) || [current.content]) 
                : (current.content.split(/<hr\s*\/?>/i))
              ).map((_, i) => (
                <View 
                  key={i} 
                  style={{ 
                    width: i === currentPage ? 16 : 6, 
                    height: 6, 
                    borderRadius: 3, 
                    backgroundColor: i === currentPage ? meta.color : colors.border 
                  }} 
                />
              ))}
            </View>
          </View>
        ) : (
          <>
            {current.type === "text" && (
              <Text style={styles.bodyText} selectable>
                {current.content}
              </Text>
            )}

            {current.type === "html" && (
              <View>
                {Platform.OS === "web" ? (
                  // @ts-ignore
                  <iframe
                    srcDoc={current.content}
                    style={{ width: "100%", minHeight: 400, border: "1px solid " + colors.border, borderRadius: 12 }}
                  />
                ) : (
                  <WebView
                    originWhitelist={["*"]}
                    source={{ html: current.content }}
                    style={{ minHeight: SCREEN_HEIGHT - insets.top - insets.bottom - 160, borderRadius: 12 }}
                  />
                )}
              </View>
            )}
          </>
        )}

        {current.type === "file" && (
          <View style={{ gap: 12 }}>
            {csvData && csvData.length > 0 ? (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                style={{ marginHorizontal: -16 }}
                nestedScrollEnabled
              >
                <View style={{ paddingHorizontal: 16 }}>
                  <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surface }}>
                    {csvData.map((row, ri) => (
                      <View key={ri} style={{ flexDirection: "row", borderBottomWidth: ri === csvData.length - 1 ? 0 : 1, borderBottomColor: colors.border, backgroundColor: ri === 0 ? colors.primaryLight : "transparent" }}>
                        {row.map((cell, ci) => (
                          <View key={ci} style={{ padding: 12, minWidth: 100, borderRightWidth: ci === row.length - 1 ? 0 : 1, borderRightColor: colors.border }}>
                            <Text style={{ fontSize: 13, fontWeight: ri === 0 ? "800" : "500", color: ri === 0 ? colors.primary : colors.text }} numberOfLines={2}>
                              {cell}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                </View>
              </ScrollView>
            ) : csvData && csvData.length === 0 ? (
              <View style={[styles.fileBox, { padding: 30, alignItems: "center" }]}>
                <FileText size={40} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, marginTop: 8 }}>File CSV kosong</Text>
              </View>
            ) : (current.fileMime?.includes("epub") || current.fileName?.toLowerCase().endsWith(".epub")) ? (
              <View style={[styles.fileBox, { padding: 40, alignItems: "center", backgroundColor: colors.primaryLight }]}>
                <BookOpen size={48} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: "800", marginTop: 12, fontSize: 16 }}>File EPUB (E-Book)</Text>
                <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 6, fontSize: 12 }}>
                  Gunakan aplikasi eksternal (seperti Google Play Books atau Apple Books) untuk membaca file ini dengan nyaman.
                </Text>
              </View>
            ) : (current.fileMime?.includes("pdf") || 
              current.fileMime?.includes("msword") ||
              current.fileMime?.includes("officedocument") ||
              current.fileName?.toLowerCase().endsWith(".pdf") ||
              current.fileName?.toLowerCase().endsWith(".docx") ||
              current.fileName?.toLowerCase().endsWith(".xlsx") ||
              current.fileName?.toLowerCase().endsWith(".pptx")
            ) ? (
              <WebView
                source={{ uri: current.filePath! }}
                style={{
                  width: "100%",
                  height: SCREEN_HEIGHT - insets.top - insets.bottom - 160,
                  borderRadius: 16,
                  backgroundColor: colors.surface,
                }}
                startInLoadingState
                originWhitelist={["*"]}
                allowFileAccess
              />
            ) : (
              <View style={styles.fileBox}>
                <Paperclip size={28} color={colors.amber} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fileName}>{current.fileName}</Text>
                  {current.fileSize ? (
                    <Text style={styles.fileSize}>{formatBytes(current.fileSize)}</Text>
                  ) : null}
                </View>
              </View>
            )}
            
            <TouchableOpacity 
              style={[styles.openFileBtn, { backgroundColor: colors.amber, paddingVertical: 14 }]} 
              onPress={() => openFile(current)}
            >
              <ExternalLink size={16} color={colors.white} />
              <Text style={[styles.openFileBtnText, { fontSize: 14 }]}>Buka di Aplikasi Eksternal</Text>
            </TouchableOpacity>
          </View>
        )}

        {current.type === "youtube" && (
          <View style={{ alignItems: "center" }}>
            <YoutubePlayer 
              url={current.videoUrl || current.content} 
              title={current.title}
              linkBoxStyle={[styles.linkBox, { backgroundColor: isDark ? "rgba(255,0,0,0.1)" : "#FFF0F0" }]} 
              mutedColor={isDark ? "#FF6B6B" : "#FF0000"} 
            />
          </View>
        )}

        {current.type === "googledoc" && (
          <View style={{ gap: 12 }}>
            <WebView
              source={{ uri: transformDocUrl(current.content) }}
              style={{
                width: "100%",
                height: 500,
                borderRadius: 16,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
              startInLoadingState
              renderLoading={() => (
                <View style={{ position: "absolute", inset: 0, justifyContent: "center", alignItems: "center" }}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              )}
            />
            <TouchableOpacity
              style={[styles.linkBox, { backgroundColor: colors.primaryLight, borderStyle: "dashed", borderWidth: 1 }]}
              onPress={() => Linking.openURL(current.content).catch(() => {})}
            >
              <Globe size={18} color={colors.primary} />
              <Text style={{ flex: 1, fontWeight: "700", color: colors.primary }}>
                Buka di Aplikasi Google Docs
              </Text>
              <ExternalLink size={14} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}

        {current.type === "image" && current.filePath ? (
          <TouchableOpacity activeOpacity={0.9} onPress={() => setZoomImage(resolveAssetUri(current.filePath) ?? current.filePath!)}>
            <Image source={{ uri: resolveAssetUri(current.filePath) }} style={styles.heroImage} resizeMode="contain" />
          </TouchableOpacity>
        ) : null}

        {current.images && current.images.length > 0 && (
          <View style={styles.attachSection}>
            <Text style={styles.attachLabel}>Lampiran Gambar ({current.images.length})</Text>
            {current.images.map((rawUri, i) => {
              const uri = resolveAssetUri(rawUri);
              if (!uri) return null;
              return (
                <TouchableOpacity key={i} activeOpacity={0.9} onPress={() => setZoomImage(uri)}>
                  <Image source={{ uri }} style={styles.attachImage} resizeMode="cover" />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Bottom navigation */}
      <View style={[styles.navBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity
          style={[styles.navBtn, !hasPrev && styles.navBtnDisabled]}
          onPress={goPrev}
          disabled={!hasPrev}
          activeOpacity={0.8}
        >
          <ChevronLeft size={18} color={hasPrev ? colors.dark : colors.textMuted} />
          <Text style={[styles.navBtnText, !hasPrev && { color: colors.textMuted }]}>Sebelumnya</Text>
        </TouchableOpacity>
        <View style={styles.navCounter}>
          <Text style={styles.navCounterText}>
            {idx + 1} / {total}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.navBtn, !hasNext && styles.navBtnDisabled]}
          onPress={goNext}
          disabled={!hasNext}
          activeOpacity={0.8}
        >
          <Text style={[styles.navBtnText, !hasNext && { color: colors.textMuted }]}>Selanjutnya</Text>
          <ChevronRight size={18} color={hasNext ? colors.dark : colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Image zoom modal */}
      <Modal visible={!!zoomImage} transparent animationType="fade">
        <TouchableOpacity
          style={styles.zoomOverlay}
          activeOpacity={1}
          onPress={() => setZoomImage(null)}
        >
          <TouchableOpacity onPress={() => setZoomImage(null)} style={styles.zoomCloseBtn}>
            <X size={22} color="#fff" />
          </TouchableOpacity>
          {zoomImage ? (
            <Image source={{ uri: zoomImage }} style={styles.zoomImage} resizeMode="contain" />
          ) : null}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const makeStyles = (c: ColorScheme, isDark: boolean, palette: string) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  headerSub: {
    fontSize: 11, color: "rgba(255,255,255,0.7)",
    fontWeight: "700", textTransform: "uppercase",
  },
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#fff" },
  editBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  editBtnText: { fontSize: 12, fontWeight: "800", color: "#fff" },
  body: { padding: 16, gap: 14 },
  metaRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
  },
  metaText: { fontSize: 12, fontWeight: "800" },
  metaDate: { fontSize: 11, color: c.textMuted, fontWeight: "600" },
  bodyText: { fontSize: 16, color: c.dark, lineHeight: 26, fontWeight: "500" },
  fileBox: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: c.amberLight, borderRadius: 14, padding: 16,
  },
  fileName: { fontSize: 14, fontWeight: "800", color: c.dark },
  fileSize: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  openFileBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: c.amber, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  openFileBtnText: { fontSize: 12, fontWeight: "800", color: "#fff" },
  linkBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#FFF0F0", borderRadius: 12, padding: 14,
  },
  heroImage: { width: "100%", aspectRatio: 4 / 3, borderRadius: 14, backgroundColor: "#f0f0f0" },
  attachSection: { gap: 10, marginTop: 8 },
  attachLabel: {
    fontSize: 11, fontWeight: "800", color: c.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.8,
  },
  attachImage: { width: "100%", aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: "#f0f0f0" },
  navBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 12, paddingTop: 10,
    backgroundColor: c.white, borderTopWidth: 1, borderTopColor: c.border,
  },
  navBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 4, backgroundColor: c.background, borderWidth: 1.5, borderColor: c.border,
    borderRadius: 12, paddingVertical: 12,
  },
  navBtnDisabled: { opacity: 0.5 },
  navBtnText: { fontSize: 13, fontWeight: "800", color: c.dark },
  navCounter: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: c.background,
  },
  navCounterText: { fontSize: 12, fontWeight: "800", color: c.textSecondary },
  zoomOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.95)",
    alignItems: "center", justifyContent: "center",
  },
  zoomImage: { width: "100%", height: "85%" },
  zoomCloseBtn: {
    position: "absolute", top: 50, right: 20, zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
});
