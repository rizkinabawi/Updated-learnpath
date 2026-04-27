import { useColors } from "@/contexts/ThemeContext";
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Platform,
  ScrollView,
  Image,
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChevronLeft,
  ChevronRight,
  X,
  PencilLine,
  Clock,
  Download,
} from "lucide-react-native";
import { printHtml } from "@/utils/print-compat";
import * as Sharing from "expo-sharing";
import * as FileSystem from "@/utils/fs-compat";
import { toast } from "@/components/Toast";
import { getNotes, getLessons, type Note } from "@/utils/storage";
import { resolveAssetUri } from "@/utils/path-resolver";
import { type ColorScheme } from "@/constants/colors";
import { RichTextRenderer } from "@/components/RichTextRenderer";

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function NoteFullView() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { noteId, lessonId } = useLocalSearchParams<{
    noteId: string;
    lessonId?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [notes, setNotes] = useState<Note[]>([]);
  const [lessonName, setLessonName] = useState("");
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  const safeNoteId = Array.isArray(noteId) ? noteId[0] : noteId ?? "";

  useEffect(() => {
    (async () => {
      let lid = Array.isArray(lessonId) ? lessonId[0] : lessonId;
      if (!lid) {
        const all = await getNotes();
        const found = all.find((n) => n.id === safeNoteId);
        if (!found) return;
        lid = found.lessonId;
      }
      const list = await getNotes(lid);
      list.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      setNotes(list);
      const lessons = await getLessons();
      const lesson = lessons.find((l) => l.id === lid);
      if (lesson) setLessonName(lesson.name);
    })();
  }, [safeNoteId, lessonId]);

  const idx = useMemo(
    () => notes.findIndex((n) => n.id === safeNoteId),
    [notes, safeNoteId],
  );
  const current = idx >= 0 ? notes[idx] : null;
  const total = notes.length;
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < total - 1;

  const goPrev = () => {
    if (hasPrev) {
      router.replace({
        pathname: "/notes/view/[noteId]",
        params: { noteId: notes[idx - 1].id, lessonId: notes[idx - 1].lessonId },
      });
    }
  };
  const goNext = () => {
    if (hasNext) {
      router.replace({
        pathname: "/notes/view/[noteId]",
        params: { noteId: notes[idx + 1].id, lessonId: notes[idx + 1].lessonId },
      });
    }
  };
  const goEdit = () => {
    if (!current) return;
    router.push({
      pathname: "/notes/[lessonId]",
      params: { lessonId: current.lessonId, openEditId: current.id },
    });
  };

  const exportSingleToPDF = async () => {
    if (!current) return;
    try {
      const html = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica', sans-serif; padding: 40px; color: #1a1a1a; line-height: 1.6; }
              .course { font-size: 13px; color: #6366f1; font-weight: bold; text-transform: uppercase; margin-bottom: 5px; }
              .title { font-size: 28px; font-weight: 900; margin-bottom: 5px; border-bottom: 2px solid #6366f1; padding-bottom: 10px; }
              .date { font-size: 11px; color: #666; margin-bottom: 30px; }
              .content { font-size: 15px; white-space: pre-wrap; color: #333; }
              .footer { margin-top: 60px; font-size: 10px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 10px; }
            </style>
          </head>
          <body>
            <div class="course">${lessonName}</div>
            <div class="title">${current.title}</div>
            <div class="date">Dicatat pada: ${formatDateTime(current.updatedAt)}</div>
            <div class="content">${current.content}</div>
            <div class="footer">Dibuat otomatis oleh LearnPath - ${new Date().toLocaleDateString()}</div>
          </body>
        </html>
      `;
      await printHtml(html, { dialogTitle: current.title || "Catatan" });
    } catch {
      toast.error("Gagal mengekspor PDF");
    }
  };

  const exportSingleToTxt = async () => {
    if (!current) return;
    try {
      let text = `${current.title.toUpperCase()}\n`;
      text += `Pelajaran: ${lessonName}\n`;
      text += `Tanggal: ${formatDateTime(current.updatedAt)}\n`;
      text += `==========================================\n\n`;
      text += current.content;
      text += `\n\n------------------------------------------\n`;
      text += `Dibuat via LearnPath App`;

      const fileName = `catatan-${current.title.replace(/\s+/g, "_").toLowerCase()}.txt`;
      const path = ((FileSystem as any).cacheDirectory ?? "") + fileName;
      await (FileSystem as any).writeAsStringAsync(path, text);
      await Sharing.shareAsync(path);
    } catch {
      toast.error("Gagal mengekspor TXT");
    }
  };

  const handleExport = () => {
    Alert.alert("Ekspor Catatan", "Simpan catatan ini sebagai file.", [
      { text: "PDF (Rapi)", onPress: exportSingleToPDF },
      { text: "Teks (.txt)", onPress: exportSingleToTxt },
      { text: "Batal", style: "cancel" }
    ], { cancelable: true });
  };

  if (!current) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: colors.textMuted }}>Catatan tidak ditemukan</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.editBtn, { marginTop: 12 }]}>
          <Text style={styles.editBtnText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === "web" ? 60 : insets.top + 12 },
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
        <TouchableOpacity onPress={handleExport} style={[styles.editBtn, { backgroundColor: "rgba(255,255,255,0.15)", marginRight: 6 }]}>
          <Download size={16} color={colors.white} />
        </TouchableOpacity>
        <TouchableOpacity onPress={goEdit} style={styles.editBtn}>
          <PencilLine size={16} color={colors.white} />
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 100 }]}
      >
        <View style={styles.metaRow}>
          <Clock size={11} color={colors.textMuted} />
          <Text style={styles.metaDate}>
            Diperbarui {formatDateTime(current.updatedAt)}
          </Text>
        </View>

        {current.content ? (
          <RichTextRenderer 
            content={current.content} 
            onNoteLinkPress={(noteId) => {
              router.push({ pathname: "/notes/view/[noteId]", params: { noteId } });
            }}
          />
        ) : (
          <Text style={styles.bodyEmpty}>(catatan kosong)</Text>
        )}

        {current.images && current.images.length > 0 && (
          <View style={styles.attachSection}>
            <Text style={styles.attachLabel}>
              Gambar ({current.images.length})
            </Text>
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

      <View style={[styles.navBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity
          style={[styles.navBtn, !hasPrev && styles.navBtnDisabled]}
          onPress={goPrev}
          disabled={!hasPrev}
          activeOpacity={0.8}
        >
          <ChevronLeft size={18} color={hasPrev ? colors.dark : colors.textMuted} />
          <Text style={[styles.navBtnText, !hasPrev && { color: colors.textMuted }]}>
            Sebelumnya
          </Text>
        </TouchableOpacity>
        <View style={styles.navCounter}>
          <Text style={styles.navCounterText}>{idx + 1} / {total}</Text>
        </View>
        <TouchableOpacity
          style={[styles.navBtn, !hasNext && styles.navBtnDisabled]}
          onPress={goNext}
          disabled={!hasNext}
          activeOpacity={0.8}
        >
          <Text style={[styles.navBtnText, !hasNext && { color: colors.textMuted }]}>
            Selanjutnya
          </Text>
          <ChevronRight size={18} color={hasNext ? colors.dark : colors.textMuted} />
        </TouchableOpacity>
      </View>

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

const makeStyles = (c: ColorScheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: {
    backgroundColor: c.primary,
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
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaDate: { fontSize: 11, color: c.textMuted, fontWeight: "600" },
  bodyText: { fontSize: 16, color: c.dark, lineHeight: 26, fontWeight: "500" },
  bodyEmpty: { fontSize: 14, color: c.textMuted, fontStyle: "italic" },
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
  navCounter: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: c.background },
  navCounterText: { fontSize: 12, fontWeight: "800", color: c.textSecondary },
  zoomOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  zoomImage: { width: "100%", height: "85%" },
  zoomCloseBtn: {
    position: "absolute", top: 50, right: 20, zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
});
