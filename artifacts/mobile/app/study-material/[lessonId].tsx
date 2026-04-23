import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Platform,
  Modal,
  ScrollView,
  Linking,
  KeyboardAvoidingView,
  Image,
  Dimensions,
} from "react-native";
import { WebView } from "react-native-webview";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import {
  X,
  Plus,
  Trash2,
  PencilLine,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  FileText,
  Code2,
  Paperclip,
  Eye,
  ExternalLink,
  BookOpen,
  Clock,
  Video,
  FileImage,
  Globe,
} from "lucide-react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "@/utils/fs-compat";
import * as Sharing from "expo-sharing";
import * as ImagePicker from "expo-image-picker";
import {
  getStudyMaterials,
  saveStudyMaterial,
  deleteStudyMaterial,
  getLessons,
  generateId,
  type StudyMaterial,
} from "@/utils/storage";
import Colors from "@/constants/colors";
import { toast } from "@/components/Toast";
import { isCancellationError } from "@/utils/safe-share";
import { useTranslation } from "@/contexts/LanguageContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PLAYER_WIDTH = Math.min(SCREEN_WIDTH - 32, 480);
const PLAYER_HEIGHT = Math.round(PLAYER_WIDTH * 9 / 16);

/** Extract YouTube video ID from any YouTube URL format */
const extractYoutubeId = (url: string): string | null => {
  try {
    const cleaned = url.trim();
    // youtu.be/ID
    const short = cleaned.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (short) return short[1];
    // youtube.com/shorts/ID
    const shorts = cleaned.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shorts) return shorts[1];
    // youtube.com/embed/ID
    const embed = cleaned.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embed) return embed[1];
    // youtube.com/watch?v=ID  (v= anywhere in query string)
    const watch = cleaned.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (watch) return watch[1];
  } catch {}
  return null;
};

/** Inline YouTube embed using WebView */
function YoutubeEmbed({ url }: { url: string }) {
  const videoId = extractYoutubeId(url);
  if (!videoId) {
    return (
      <TouchableOpacity
        style={ytStyles.fallback}
        onPress={() => Linking.openURL(url).catch(() => {})}
        activeOpacity={0.8}
      >
        <Video size={20} color="#FF0000" />
        <Text style={ytStyles.fallbackText}>Buka di YouTube</Text>
        <ExternalLink size={14} color={Colors.textMuted} />
      </TouchableOpacity>
    );
  }

  // Use youtube-nocookie.com to reduce cookie/auth prompts that can trigger app opening
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=https://www.youtube-nocookie.com`;

  if ((Platform.OS as string) === "web") {
    return (
      <View style={ytStyles.container}>
        {/* @ts-ignore - iframe is valid on web */}
        <iframe
          src={embedUrl}
          width={PLAYER_WIDTH}
          height={PLAYER_HEIGHT}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ borderRadius: 12, display: "block" }}
        />
      </View>
    );
  }

  // Android: Use inline HTML to avoid YouTube Error 153 and prevent YouTube app from
  // intercepting playback. setSupportMultipleWindows=false + onShouldStartLoadWithRequest
  // intercepts intent:// and vnd.youtube:// schemes that trigger the native app.
  const html = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; background: #000; }
  body { background: #000; overflow: hidden; }
  .wrap { position: relative; width: 100%; padding-top: 56.25%; }
  iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
</style>
</head>
<body>
<div class="wrap">
  <iframe
    src="${embedUrl}"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
    allowfullscreen
    webkitallowfullscreen
    mozallowfullscreen>
  </iframe>
</div>
</body>
</html>`;

  return (
    <View style={ytStyles.container}>
      <WebView
        source={{ html, baseUrl: "https://www.youtube-nocookie.com" }}
        style={{ width: PLAYER_WIDTH, height: PLAYER_HEIGHT, borderRadius: 12, backgroundColor: "#000" }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        scrollEnabled={false}
        allowsFullscreenVideo
        originWhitelist={["*"]}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(req) => {
          const u = req.url;
          // Block intent:// and vnd.youtube:// schemes — these open the YouTube app
          if (
            u.startsWith("intent://") ||
            u.startsWith("vnd.youtube") ||
            u.startsWith("youtube://") ||
            u.startsWith("market://")
          ) {
            return false;
          }
          // Allow youtube-nocookie, googlevideo (CDN), and blank/about pages
          return true;
        }}
      />
      <TouchableOpacity
        style={ytStyles.openBtn}
        onPress={() => Linking.openURL(url).catch(() => {})}
        activeOpacity={0.8}
      >
        <ExternalLink size={12} color={Colors.textMuted} />
        <Text style={ytStyles.openBtnText}>Buka di YouTube</Text>
      </TouchableOpacity>
    </View>
  );
}

const ytStyles = StyleSheet.create({
  container: { gap: 8 },
  fallback: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#FFF0F0", borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: "#FFD0D0",
  },
  fallbackText: { flex: 1, fontSize: 14, fontWeight: "700", color: "#FF0000" },
  openBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 6,
  },
  openBtnText: { fontSize: 12, color: Colors.textMuted, fontWeight: "600" },
});

const MATERIAL_DIR =
  ((FileSystem as any).documentDirectory ?? "") + "study-materials/";

const ensureDir = async () => {
  if (Platform.OS === "web") return;
  const info = await FileSystem.getInfoAsync(MATERIAL_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(MATERIAL_DIR, { intermediates: true });
  }
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
};

type TabType = "text" | "html" | "file" | "youtube" | "googledoc" | "image";

const TYPE_INFO: Record<TabType, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  text: {
    icon: <FileText size={14} color={Colors.primary} />,
    label: "Teks",
    color: Colors.primary,
    bg: Colors.primaryLight,
  },
  html: {
    icon: <Code2 size={14} color={Colors.purple} />,
    label: "HTML",
    color: Colors.purple,
    bg: Colors.purpleLight,
  },
  file: {
    icon: <Paperclip size={14} color={Colors.amber} />,
    label: "File",
    color: Colors.amber,
    bg: Colors.amberLight,
  },
  youtube: {
    icon: <Video size={14} color="#FF0000" />,
    label: "YouTube",
    color: "#FF0000",
    bg: "#FFF0F0",
  },
  googledoc: {
    icon: <Globe size={14} color="#1967D2" />,
    label: "Google Docs",
    color: "#1967D2",
    bg: "#E8F0FE",
  },
  image: {
    icon: <FileImage size={14} color={Colors.success} />,
    label: "Gambar",
    color: Colors.success,
    bg: Colors.successLight,
  },
};

function ExtraImagesEditor({
  images,
  onAdd,
  onRemove,
}: {
  images: string[];
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <View style={{ marginTop: 12, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={[styles.fieldLabel, { flex: 1 }]}>
          Lampiran Gambar {images.length > 0 ? `(${images.length})` : ""}
        </Text>
        <TouchableOpacity
          onPress={onAdd}
          style={{
            flexDirection: "row", alignItems: "center", gap: 4,
            backgroundColor: Colors.successLight, borderRadius: 8,
            paddingHorizontal: 10, paddingVertical: 6,
          }}
        >
          <Plus size={12} color={Colors.success} />
          <Text style={{ fontSize: 11, fontWeight: "800", color: Colors.success }}>
            Tambah
          </Text>
        </TouchableOpacity>
      </View>
      {images.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {images.map((uri, i) => (
            <View key={`${uri}-${i}`} style={{ position: "relative" }}>
              <Image
                source={{ uri }}
                style={{ width: 84, height: 84, borderRadius: 10, backgroundColor: "#eee" }}
              />
              <TouchableOpacity
                onPress={() => onRemove(i)}
                style={{
                  position: "absolute", top: -6, right: -6,
                  width: 22, height: 22, borderRadius: 11,
                  backgroundColor: Colors.danger,
                  alignItems: "center", justifyContent: "center",
                }}
              >
                <X size={12} color={Colors.white} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export default function StudyMaterialScreen() {
  const { lessonId, openEditId } = useLocalSearchParams<{
    lessonId: string;
    openEditId?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { t } = useTranslation();
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [lessonName, setLessonName] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("text");
  const [editMat, setEditMat] = useState<StudyMaterial | null>(null);

  // Form state
  const [matTitle, setMatTitle] = useState("");
  const [matContent, setMatContent] = useState("");
  const [pickedFile, setPickedFile] = useState<{
    name: string; uri: string; size?: number; mimeType?: string;
  } | null>(null);
  const [pickedImage, setPickedImage] = useState<string | null>(null);
  /** Extra images attached to the material (canvas-style) */
  const [extraImages, setExtraImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const safeLesson = Array.isArray(lessonId) ? lessonId[0] : (lessonId ?? "");

  useEffect(() => {
    loadData();
  }, [safeLesson]);

  const loadData = async () => {
    const data = await getStudyMaterials(safeLesson);
    setMaterials(
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    );
    const lessons = await getLessons();
    const lesson = lessons.find((l) => l.id === safeLesson);
    if (lesson) setLessonName(lesson.name);
  };

  const openAdd = () => {
    setEditMat(null);
    setMatTitle("");
    setMatContent("");
    setPickedFile(null);
    setPickedImage(null);
    setExtraImages([]);
    setActiveTab("text");
    setShowModal(true);
  };

  const openEdit = (mat: StudyMaterial) => {
    setEditMat(mat);
    setMatTitle(mat.title);
    // youtube materials from import may store URL in videoUrl instead of content
    const urlContent = mat.type === "youtube" ? (mat.videoUrl || mat.content) : mat.content;
    setMatContent(urlContent);
    setPickedFile(
      mat.type === "file" && mat.filePath
        ? { name: mat.fileName ?? "file", uri: mat.filePath, size: mat.fileSize, mimeType: mat.fileMime }
        : null
    );
    setPickedImage(
      mat.type === "image" && mat.filePath ? mat.filePath : null
    );
    setExtraImages(mat.images ? [...mat.images] : []);
    setActiveTab(mat.type as any);
    setShowModal(true);
  };

  // Auto-open edit modal when arriving via fullview's "Edit" button
  useEffect(() => {
    const id = Array.isArray(openEditId) ? openEditId[0] : openEditId;
    if (!id || materials.length === 0) return;
    const mat = materials.find((m) => m.id === id);
    if (mat) {
      openEdit(mat);
      // clear param so it doesn't reopen on rerender
      router.setParams({ openEditId: "" });
    }
  }, [openEditId, materials]);

  const openFullView = (mat: StudyMaterial) => {
    router.push({
      pathname: "/study-material/view/[matId]",
      params: { matId: mat.id, lessonId: mat.lessonId },
    });
  };

  const addAttachmentImage = async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { Alert.alert("Izin", "Izinkan akses galeri."); return; }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 8,
    });
    if (!result.canceled && result.assets?.length) {
      setExtraImages((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
    }
  };

  const removeAttachmentImage = (i: number) => {
    setExtraImages((prev) => prev.filter((_, idx) => idx !== i));
  };

  const pickMaterialImage = async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { Alert.alert("Izin", "Izinkan akses galeri."); return; }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPickedImage(result.assets[0].uri);
    }
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setPickedFile({
        name: asset.name,
        uri: asset.uri,
        size: asset.size,
        mimeType: asset.mimeType ?? undefined,
      });
    } catch {
      toast.error("Gagal memilih file");
    }
  };

  const handleSave = async () => {
    if (!matTitle.trim()) { toast.error(t.material.error_title); return; }

    const urlTypes = ["youtube", "googledoc"] as const;
    const isUrlType = urlTypes.includes(activeTab as any);

    if (isUrlType && !matContent.trim()) { toast.error(t.material.error_url); return; }
    if (activeTab === "youtube") {
      const url = matContent.trim().toLowerCase();
      const isValidYoutube = url.includes("youtube.com") || url.includes("youtu.be");
      if (!isValidYoutube) {
        toast.error(t.material.error_youtube);
        return;
      }
    }
    if (activeTab === "text" && !matContent.trim()) { toast.error(t.material.error_content); return; }
    if (activeTab === "html" && !matContent.trim()) { toast.error(t.material.error_html); return; }
    if (activeTab === "file" && !pickedFile) { toast.error(t.material.error_file); return; }
    if (activeTab === "image" && !pickedImage) { toast.error(t.material.error_image); return; }

    const safeId = Array.isArray(lessonId) ? lessonId[0] : (lessonId ?? "");

    setSaving(true);
    try {
      let filePath: string | undefined;
      let fileName: string | undefined;
      let fileSize: number | undefined;
      let fileMime: string | undefined;

      if (activeTab === "file" && pickedFile) {
        fileName = pickedFile.name;
        fileSize = pickedFile.size;
        fileMime = pickedFile.mimeType;
        if (Platform.OS !== "web") {
          try {
            await ensureDir();
            const ext = pickedFile.name.split(".").pop() ?? "bin";
            const dest = MATERIAL_DIR + `${generateId()}.${ext}`;
            await FileSystem.copyAsync({ from: pickedFile.uri, to: dest });
            filePath = dest;
          } catch { filePath = pickedFile.uri; }
        } else { filePath = pickedFile.uri; }
      }

      if (activeTab === "image" && pickedImage) {
        if (Platform.OS !== "web") {
          try {
            await ensureDir();
            const ext = pickedImage.split(".").pop()?.split("?")[0] ?? "jpg";
            const dest = MATERIAL_DIR + `${generateId()}.${ext}`;
            await FileSystem.copyAsync({ from: pickedImage, to: dest });
            filePath = dest;
          } catch { filePath = pickedImage; }
        } else { filePath = pickedImage; }
        fileMime = "image/*";
      }

      // Persist extra-image attachments (copy local files when on native)
      let savedExtraImages: string[] = [];
      if (extraImages.length > 0) {
        if (Platform.OS !== "web") {
          await ensureDir();
          for (const uri of extraImages) {
            try {
              // already-persisted (inside our dir) → reuse
              if (uri.startsWith(MATERIAL_DIR)) {
                savedExtraImages.push(uri);
                continue;
              }
              const ext = uri.split(".").pop()?.split("?")[0] ?? "jpg";
              const dest = MATERIAL_DIR + `${generateId()}.${ext}`;
              await FileSystem.copyAsync({ from: uri, to: dest });
              savedExtraImages.push(dest);
            } catch {
              savedExtraImages.push(uri);
            }
          }
        } else {
          savedExtraImages = [...extraImages];
        }
      }

      const mat: StudyMaterial = {
        id: editMat?.id ?? generateId(),
        lessonId: safeId,
        title: matTitle.trim(),
        type: activeTab,
        content: (activeTab === "file" || activeTab === "image") ? "" : matContent.trim(),
        filePath,
        fileName,
        fileSize,
        fileMime,
        images: savedExtraImages.length > 0 ? savedExtraImages : undefined,
        createdAt: editMat?.createdAt ?? new Date().toISOString(),
      };
      await saveStudyMaterial(mat);
      setShowModal(false);
      setPickedImage(null);
      setExtraImages([]);
      toast.success(t.material.saved);
      loadData();
    } catch (e: any) {
      toast.error(`${t.common.error}: ${e?.message ?? t.common.error}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (mat: StudyMaterial) => {
    Alert.alert(t.material.delete_title, t.material.delete_msg(mat.title), [
      { text: t.common.cancel, style: "cancel" },
      {
        text: t.common.delete,
        style: "destructive",
        onPress: async () => {
          await deleteStudyMaterial(mat.id);
          toast.info(t.material.deleted);
          loadData();
        },
      },
    ]);
  };

  const handleOpenFile = async (mat: StudyMaterial) => {
    if (!mat.filePath) return;
    try {
      if (Platform.OS !== "web") {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(mat.filePath, {
            dialogTitle: mat.title,
            mimeType: mat.fileMime,
            UTI: mat.fileMime,
          });
        } else {
          toast.error("Sharing tidak tersedia di perangkat ini");
        }
      } else {
        await Linking.openURL(mat.filePath);
      }
    } catch (e) {
      if (!isCancellationError(e)) toast.error("Tidak bisa membuka file");
    }
  };

  const handlePreviewHtml = async (mat: StudyMaterial) => {
    if (Platform.OS === "web") {
      const win = window.open();
      if (win) {
        win.document.write(mat.content);
        win.document.close();
      }
    } else {
      // Write HTML to temp file and open in browser
      try {
        const tmpPath = ((FileSystem as any).cacheDirectory ?? "") + "preview.html";
        await (FileSystem as any).writeAsStringAsync(tmpPath, mat.content);
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(tmpPath, {
            mimeType: "text/html",
            dialogTitle: mat.title,
            UTI: "public.html",
          });
        }
      } catch (e) {
        if (!isCancellationError(e)) toast.error("Tidak bisa preview HTML di perangkat ini");
      }
    }
  };

  const TABS: { key: TabType; label: string }[] = [
    { key: "text", label: t.material.tab_text },
    { key: "html", label: t.material.tab_html },
    { key: "youtube", label: t.material.tab_youtube },
    { key: "googledoc", label: t.material.tab_googledoc },
    { key: "image", label: t.material.tab_image },
    { key: "file", label: t.material.tab_file },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === "web" ? 60 : insets.top + 12 },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <X size={20} color={Colors.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSub} numberOfLines={1}>
            {lessonName}
          </Text>
          <Text style={styles.headerTitle}>{t.common.material}</Text>
        </View>
        <TouchableOpacity onPress={openAdd} style={styles.addBtn}>
          <Plus size={20} color={Colors.white} />
        </TouchableOpacity>
      </View>

      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      >
        {materials.length === 0 ? (
          <TouchableOpacity
            style={styles.emptyCard}
            onPress={openAdd}
            activeOpacity={0.85}
          >
            <BookOpen size={40} color={Colors.purple} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>{t.material.empty_title}</Text>
            <Text style={styles.emptySub}>{t.material.empty_sub}</Text>
          </TouchableOpacity>
        ) : (
          materials.map((mat) => {
            const info = TYPE_INFO[mat.type];
            const hasAttachments = mat.images && mat.images.length > 0;
            return (
              <View key={mat.id} style={styles.matCard}>
                <TouchableOpacity
                  style={styles.matHeader}
                  onPress={() => openFullView(mat)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.typeTag, { backgroundColor: info.bg }]}>
                    {info.icon}
                    <Text style={[styles.typeTagText, { color: info.color }]}>
                      {info.label}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.matTitle}>{mat.title}</Text>
                    <View style={styles.matMeta}>
                      <Clock size={10} color={Colors.textMuted} />
                      <Text style={styles.matDate}>{formatDate(mat.createdAt)}</Text>
                      {mat.type === "file" && mat.fileSize && (
                        <Text style={styles.matDate}>
                          · {formatBytes(mat.fileSize)}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.matActions}>
                    <TouchableOpacity
                      onPress={() => { openEdit(mat); }}
                      style={[styles.iconBtn, styles.iconBtnEdit]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <PencilLine size={13} color={Colors.purple} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(mat)}
                      style={[styles.iconBtn, styles.iconBtnDanger]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Trash2 size={13} color={Colors.danger} />
                    </TouchableOpacity>
                    {hasAttachments && (
                      <View style={styles.attachBadge}>
                        <FileImage size={11} color={Colors.success} />
                        <Text style={styles.attachBadgeText}>
                          {mat.images!.length}
                        </Text>
                      </View>
                    )}
                    <ChevronRight size={16} color={Colors.textMuted} />
                  </View>
                </TouchableOpacity>

                {false && (
                  <View style={styles.matBody as any}>
                    {mat.type === "text" && (
                      <ScrollView
                        style={styles.textScroll}
                        nestedScrollEnabled
                      >
                        <Text style={styles.matText}>{mat.content}</Text>
                      </ScrollView>
                    )}

                    {mat.type === "html" && (
                      <View style={styles.htmlBox}>
                        <View style={styles.htmlPreviewBar}>
                          <Code2 size={13} color={Colors.purple} />
                          <Text style={styles.htmlPreviewLabel}>Konten HTML</Text>
                          <TouchableOpacity
                            style={styles.previewBtn}
                            onPress={() => handlePreviewHtml(mat)}
                          >
                            <Eye size={13} color={Colors.white} />
                            <Text style={styles.previewBtnText}>Buka Preview</Text>
                          </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.htmlCodeScroll} nestedScrollEnabled>
                          <Text style={styles.htmlCode}>{mat.content}</Text>
                        </ScrollView>
                      </View>
                    )}

                    {mat.type === "file" && (
                      <View style={styles.fileBox}>
                        <View style={styles.fileInfo}>
                          <Paperclip size={20} color={Colors.amber} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.fileName}>{mat.fileName}</Text>
                            {mat.fileSize && (
                              <Text style={styles.fileSize}>
                                {formatBytes(mat.fileSize)}
                              </Text>
                            )}
                          </View>
                        </View>
                        <TouchableOpacity
                          style={styles.openFileBtn}
                          onPress={() => handleOpenFile(mat)}
                        >
                          <ExternalLink size={14} color={Colors.white} />
                          <Text style={styles.openFileBtnText}>
                            Buka / Bagikan File
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {mat.type === "youtube" && (
                      <YoutubeEmbed url={mat.videoUrl || mat.content} />
                    )}

                    {mat.type === "googledoc" && (
                      <View style={styles.linkBox}>
                        <View style={[styles.linkIconWrap, { backgroundColor: "#E8F0FE" }]}>
                          <Globe size={24} color="#1967D2" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.linkLabel, { color: "#1967D2" }]}>Google Docs</Text>
                          <Text style={styles.linkUrl} numberOfLines={2}>{mat.content}</Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.openLinkBtn, { backgroundColor: "#1967D2" }]}
                          onPress={() => Linking.openURL(mat.content).catch(() => toast.error("Tidak bisa buka URL"))}
                        >
                          <ExternalLink size={14} color="#fff" />
                          <Text style={styles.openLinkBtnText}>Buka</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {mat.type === "image" && mat.filePath && (
                      <View style={styles.imageBox}>
                        <Image
                          source={{ uri: mat.filePath }}
                          style={styles.materialImage}
                          resizeMode="contain"
                        />
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </KeyboardAwareScrollViewCompat>

      {/* Add Modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalBox,
              { paddingBottom: Math.max(insets.bottom, 24) + 16 },
            ]}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{editMat ? "Edit Materi" : `${t.common.add} ${t.common.material}`}</Text>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 440 }}
              contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
            >
              {/* Type Tabs */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.tabRow, { paddingRight: 4 }]}>
                {TABS.map((t) => (
                  <TouchableOpacity
                    key={t.key}
                    style={[
                      styles.tabBtn,
                      activeTab === t.key && styles.tabBtnActive,
                    ]}
                    onPress={() => {
                      setActiveTab(t.key);
                      setMatContent("");
                      setPickedFile(null);
                      setPickedImage(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.tabBtnText,
                        activeTab === t.key && styles.tabBtnTextActive,
                      ]}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.fieldLabel}>{t.material.title_ph}</Text>
              <TextInput
                value={matTitle}
                onChangeText={setMatTitle}
                placeholder={t.material.title_ph}
                style={styles.input}
                placeholderTextColor={Colors.textMuted}
                autoFocus
              />

              {activeTab === "text" && (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 6 }]}>
                    {t.material.content_ph_text}
                  </Text>
                  <TextInput
                    value={matContent}
                    onChangeText={setMatContent}
                    placeholder={t.material.content_ph_text}
                    style={[styles.input, styles.textArea]}
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    textAlignVertical="top"
                  />
                  <ExtraImagesEditor
                    images={extraImages}
                    onAdd={addAttachmentImage}
                    onRemove={removeAttachmentImage}
                  />
                </>
              )}

              {activeTab === "html" && (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 6 }]}>
                    {t.material.tab_html}
                  </Text>
                  <Text style={styles.fieldHint}>
                    {t.material.content_ph_html}
                  </Text>
                  <TextInput
                    value={matContent}
                    onChangeText={setMatContent}
                    placeholder={t.material.content_ph_html}
                    style={[styles.input, styles.textArea, styles.codeInput]}
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    textAlignVertical="top"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </>
              )}

              {activeTab === "file" && (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 6 }]}>
                    Upload File (PPT, PDF, DOC, dll)
                  </Text>
                  {pickedFile ? (
                    <View style={styles.pickedFile}>
                      <Paperclip size={16} color={Colors.amber} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickedFileName}>{pickedFile.name}</Text>
                        {pickedFile.size && (
                          <Text style={styles.pickedFileSize}>
                            {formatBytes(pickedFile.size)}
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity onPress={() => setPickedFile(null)}>
                        <X size={16} color={Colors.danger} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.uploadBtn}
                      onPress={pickFile}
                      activeOpacity={0.8}
                    >
                      <Paperclip size={20} color={Colors.amber} />
                      <Text style={styles.uploadBtnText}>{t.material.pick_file}</Text>
                      <Text style={styles.uploadBtnHint}>PPT, PDF, DOC, DOCX</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              {activeTab === "youtube" && (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 6 }]}>{t.material.tab_youtube}</Text>
                  <Text style={styles.fieldHint}>{t.material.content_ph_youtube}</Text>
                  <TextInput
                    value={matContent}
                    onChangeText={setMatContent}
                    placeholder={t.material.content_ph_youtube}
                    style={styles.input}
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </>
              )}

              {activeTab === "googledoc" && (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 6 }]}>{t.material.tab_googledoc}</Text>
                  <Text style={styles.fieldHint}>{t.material.content_ph_googledoc}</Text>
                  <TextInput
                    value={matContent}
                    onChangeText={setMatContent}
                    placeholder={t.material.content_ph_googledoc}
                    style={styles.input}
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </>
              )}

              {activeTab === "image" && (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 6 }]}>{t.material.tab_image}</Text>
                  {pickedImage ? (
                    <View style={styles.pickedImageWrap}>
                      <Image source={{ uri: pickedImage }} style={styles.pickedImagePreview} resizeMode="cover" />
                      <TouchableOpacity onPress={() => setPickedImage(null)} style={styles.removeImageBtn}>
                        <X size={14} color={Colors.danger} />
                        <Text style={styles.removeImageText}>Ganti Gambar</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.uploadBtn, { borderColor: Colors.success }]}
                      onPress={pickMaterialImage}
                      activeOpacity={0.8}
                    >
                      <FileImage size={20} color={Colors.success} />
                      <Text style={[styles.uploadBtnText, { color: Colors.success }]}>{t.material.pick_image}</Text>
                      <Text style={styles.uploadBtnHint}>JPG, PNG, WebP</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </ScrollView>

            <View style={styles.modalBtns}>
              <TouchableOpacity
                onPress={() => setShowModal(false)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>{t.common.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                style={styles.saveBtn}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? t.common.saving : t.common.save}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.purple,
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  headerSub: {
    fontSize: 11, color: "rgba(255,255,255,0.6)",
    fontWeight: "700", textTransform: "uppercase",
  },
  headerTitle: { fontSize: 22, fontWeight: "900", color: Colors.white },
  addBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  listContent: { padding: 16, paddingBottom: 40, gap: 10 },
  emptyCard: {
    backgroundColor: Colors.white, borderRadius: 20, padding: 36,
    alignItems: "center", gap: 10, borderWidth: 1.5,
    borderColor: Colors.purpleLight, borderStyle: "dashed", marginTop: 24,
  },
  emptyTitle: { fontSize: 17, fontWeight: "900", color: Colors.dark },
  emptySub: { fontSize: 13, color: Colors.textMuted, fontWeight: "500", textAlign: "center" },
  matCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border, overflow: "hidden",
  },
  matHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  typeTag: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  typeTagText: { fontSize: 11, fontWeight: "800" },
  matTitle: { fontSize: 14, fontWeight: "800", color: Colors.dark },
  matMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  matDate: { fontSize: 10, color: Colors.textMuted, fontWeight: "500" },
  matActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  iconBtn: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  iconBtnDanger: { backgroundColor: Colors.dangerLight },
  iconBtnEdit: { backgroundColor: "#EDE9FE" },
  matBody: {
    borderTopWidth: 1, borderTopColor: Colors.border,
    padding: 14, backgroundColor: Colors.background,
  },
  textScroll: { maxHeight: 240 },
  matText: {
    fontSize: 14, color: Colors.textSecondary,
    fontWeight: "500", lineHeight: 22,
  },
  htmlBox: { gap: 8 },
  htmlPreviewBar: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.purpleLight, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  htmlPreviewLabel: { flex: 1, fontSize: 12, fontWeight: "700", color: Colors.purple },
  previewBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.purple, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  previewBtnText: { fontSize: 11, fontWeight: "800", color: Colors.white },
  htmlCodeScroll: { maxHeight: 180, backgroundColor: "#1E1E2E", borderRadius: 10, padding: 10 },
  htmlCode: { fontSize: 11, color: "#A9B1D6", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", lineHeight: 18 },
  fileBox: { gap: 10 },
  fileInfo: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.amberLight, borderRadius: 12, padding: 12 },
  fileName: { fontSize: 13, fontWeight: "700", color: Colors.dark },
  fileSize: { fontSize: 11, color: Colors.textMuted, fontWeight: "500" },
  openFileBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.amber, borderRadius: 12, paddingVertical: 12,
  },
  openFileBtnText: { fontSize: 13, fontWeight: "800", color: Colors.white },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(10,22,40,0.55)", justifyContent: "flex-end",
  },
  modalBox: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 12, gap: 8,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: "center", marginBottom: 8,
  },
  modalTitle: { fontSize: 20, fontWeight: "900", color: Colors.dark, marginBottom: 4 },
  tabRow: { flexDirection: "row", gap: 6, marginBottom: 4 },
  tabBtn: {
    paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10,
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border,
    alignItems: "center",
  },
  tabBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabBtnText: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary },
  tabBtnTextActive: { color: Colors.white },
  fieldLabel: {
    fontSize: 11, fontWeight: "800", color: Colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.8,
  },
  fieldHint: { fontSize: 11, color: Colors.textMuted, fontWeight: "500" },
  input: {
    backgroundColor: Colors.background, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontWeight: "600", color: Colors.dark,
    borderWidth: 1.5, borderColor: Colors.border, marginTop: 6,
  },
  textArea: { height: 160, textAlignVertical: "top" },
  codeInput: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12, backgroundColor: "#1E1E2E", color: "#A9B1D6",
    borderColor: "#3B3B5C",
  },
  uploadBtn: {
    borderRadius: 14, borderWidth: 1.5, borderColor: Colors.amber,
    borderStyle: "dashed", padding: 20, alignItems: "center", gap: 6,
    backgroundColor: Colors.amberLight, marginTop: 6,
  },
  uploadBtnText: { fontSize: 15, fontWeight: "800", color: Colors.amber },
  uploadBtnHint: { fontSize: 11, color: Colors.textMuted, fontWeight: "500" },
  pickedFile: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: Colors.amberLight, borderRadius: 12, padding: 12, marginTop: 6,
    borderWidth: 1, borderColor: Colors.amber,
  },
  pickedFileName: { fontSize: 13, fontWeight: "700", color: Colors.dark },
  pickedFileSize: { fontSize: 11, color: Colors.textMuted },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 12 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border,
    alignItems: "center",
  },
  cancelBtnText: { fontSize: 14, fontWeight: "700", color: Colors.textSecondary },
  saveBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 14,
    backgroundColor: Colors.primary, alignItems: "center",
  },
  saveBtnText: { fontSize: 14, fontWeight: "900", color: Colors.white },

  // YouTube / Google Docs link display
  linkBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: Colors.white, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  linkIconWrap: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: "#FFF0F0", alignItems: "center", justifyContent: "center",
  },
  linkLabel: { fontSize: 12, fontWeight: "800", color: "#FF0000", marginBottom: 2 },
  linkUrl: { fontSize: 11, color: Colors.textMuted, fontWeight: "500" },
  openLinkBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  openLinkBtnText: { fontSize: 11, fontWeight: "800", color: "#fff" },

  // Image display
  imageBox: { borderRadius: 12, overflow: "hidden", backgroundColor: "#f0f0f0" },
  materialImage: { width: "100%", aspectRatio: 4 / 3, borderRadius: 12 },

  // Picked image in modal
  pickedImageWrap: { gap: 8, marginTop: 6 },
  pickedImagePreview: { width: "100%", height: 160, borderRadius: 12 },
  removeImageBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "center",
  },
  removeImageText: { fontSize: 12, color: Colors.danger, fontWeight: "700" },

  // Attachment badge on list card
  attachBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: Colors.successLight, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 3, marginRight: 2,
  },
  attachBadgeText: { fontSize: 10, fontWeight: "800", color: Colors.success },
});
