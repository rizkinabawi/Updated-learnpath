import { useColors, useTheme } from "@/contexts/ThemeContext";
import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Platform,
  Modal,
  Animated,
  ScrollView,
  Image,
  KeyboardAvoidingView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import {
  X,
  Plus,
  Trash2,
  ChevronRight,
  PenLine,
  FileText,
  Clock,
  FileImage,
  FileDown,
  Paperclip,
  Share2,
  Download,
  Camera,
  Sparkles,
} from "lucide-react-native";
import * as DocumentPicker from "expo-document-picker";
import { printHtml } from "@/utils/print-compat";
import * as Sharing from "expo-sharing";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "@/utils/fs-compat";
import {
  getNotes,
  saveNote,
  deleteNote,
  getLessons,
  generateId,
  type Note,
} from "@/utils/storage";
import { type ColorScheme } from "@/constants/colors";
import { toast } from "@/components/Toast";
import { useTranslation } from "@/contexts/LanguageContext";
import { resolveAssetUri } from "@/utils/path-resolver";

const NOTES_DIR = ((FileSystem as any).documentDirectory ?? "") + "notes/";
const ensureNotesDir = async () => {
  if (Platform.OS === "web") return;
  const info = await FileSystem.getInfoAsync(NOTES_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(NOTES_DIR, { intermediates: true });
  }
};

export default function NotesScreen() {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);

  const { lessonId, openEditId } = useLocalSearchParams<{
    lessonId: string;
    openEditId?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { t } = useTranslation();
  const [notes, setNotes] = useState<Note[]>([]);
  const [lessonName, setLessonName] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editNote, setEditNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [lessonId]);

  // Auto-open edit when arriving from fullview
  useEffect(() => {
    const id = Array.isArray(openEditId) ? openEditId[0] : openEditId;
    if (!id || notes.length === 0) return;
    const n = notes.find((x) => x.id === id);
    if (n) {
      openEdit(n);
      router.setParams({ openEditId: "" });
    }
  }, [openEditId, notes]);

  const openFullView = (note: Note) => {
    router.push({
      pathname: "/notes/view/[noteId]",
      params: { noteId: note.id, lessonId: note.lessonId },
    });
  };

  const addImage = async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Izin", "Izinkan akses galeri.");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 8,
    });
    if (!result.canceled && result.assets?.length) {
      setImages((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
    }
  };

  const removeImage = (i: number) => {
    setImages((prev) => prev.filter((_, idx) => idx !== i));
  };

  const loadData = async () => {
    const data = await getNotes(lessonId);
    setNotes(data.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    const lessons = await getLessons();
    const lesson = lessons.find((l) => l.id === lessonId);
    if (lesson) setLessonName(lesson.name);
  };

  const openAdd = () => {
    setEditNote(null);
    setTitle("");
    setContent("");
    setImages([]);
    setShowModal(true);
  };

  const openEdit = (note: Note) => {
    setEditNote(note);
    setTitle(note.title);
    setContent(note.content);
    setImages(note.images ? [...note.images] : []);
    setShowModal(true);
  };

  const handleImportFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      
      setSaving(true);
      const { saveStudyMaterial } = await import("@/utils/storage");
      const MATERIAL_DIR = ((FileSystem as any).documentDirectory ?? "") + "study-materials/";
      
      // Ensure dir
      if (Platform.OS !== "web") {
        const info = await FileSystem.getInfoAsync(MATERIAL_DIR);
        if (!info.exists) await FileSystem.makeDirectoryAsync(MATERIAL_DIR, { intermediates: true });
      }

      const ext = asset.name.split(".").pop() ?? "file";
      const dest = MATERIAL_DIR + `${generateId()}.${ext}`;
      if (Platform.OS !== "web") {
        await FileSystem.copyAsync({ from: asset.uri, to: dest });
      }

      await saveStudyMaterial({
        id: generateId(),
        lessonId: lessonId ?? "",
        title: `Impor: ${asset.name}`,
        type: "file",
        content: `File diimpor dari dokumen asli.`,
        filePath: Platform.OS === "web" ? asset.uri : dest,
        fileName: asset.name,
        fileSize: asset.size,
        fileMime: asset.mimeType ?? undefined,
        createdAt: new Date().toISOString(),
      });

      toast.success("Dokumen berhasil diimpor ke Materi Belajar");
      // Optional: create a link note? User just wanted import. 
      // Navigating to materials might be helpful
      Alert.alert("Impor Berhasil", `File "${asset.name}" telah ditambahkan ke Materi Belajar pelajaran ini.`, [
        { text: "Buka Materi", onPress: () => router.push(`/study-material/${lessonId}`) },
        { text: "Oke", style: "cancel" }
      ]);
    } catch (e) {
      toast.error("Gagal mengimpor file");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error(t.notes.error_title);
      return;
    }
    setSaving(true);
    // Persist images locally on native
    let savedImages: string[] = [];
    if (images.length > 0) {
      if (Platform.OS !== "web") {
        await ensureNotesDir();
        for (const uri of images) {
          try {
            if (uri.startsWith(NOTES_DIR)) {
              savedImages.push(uri);
              continue;
            }
            const ext = uri.split(".").pop()?.split("?")[0] ?? "jpg";
            const dest = NOTES_DIR + `${generateId()}.${ext}`;
            await FileSystem.copyAsync({ from: uri, to: dest });
            savedImages.push(dest);
          } catch {
            savedImages.push(uri);
          }
        }
      } else {
        savedImages = [...images];
      }
    }
    const now = new Date().toISOString();
    const note: Note = {
      id: editNote?.id ?? generateId(),
      lessonId: lessonId ?? "",
      title: title.trim(),
      content: content.trim(),
      images: savedImages.length > 0 ? savedImages : undefined,
      createdAt: editNote?.createdAt ?? now,
      updatedAt: now,
    };
    await saveNote(note);
    setSaving(false);
    setShowModal(false);
    toast.success(editNote ? t.notes.updated : t.notes.saved);
    loadData();
  };

  const handleDelete = (note: Note) => {
    Alert.alert(t.notes.delete_title, t.notes.delete_msg(note.title), [
      { text: t.common.cancel, style: "cancel" },
      {
        text: t.common.delete,
        style: "destructive",
        onPress: async () => {
          await deleteNote(note.id);
          toast.info(t.notes.deleted);
          loadData();
        },
      },
    ]);
  };

  const exportAllToPDF = async () => {
    if (notes.length === 0) return;
    try {
      const html = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica', sans-serif; padding: 40px; color: #1a1a1a; line-height: 1.6; }
              .header { border-bottom: 2px solid #6366f1; padding-bottom: 10px; marginBottom: 30px; }
              .course { font-size: 14px; color: #6366f1; font-weight: bold; text-transform: uppercase; }
              .title { font-size: 28px; font-weight: 900; margin-top: 5px; }
              .note { margin-bottom: 40px; page-break-inside: avoid; }
              .note-title { font-size: 18px; font-weight: bold; color: #4338ca; border-left: 4px solid #6366f1; padding-left: 12px; margin-bottom: 8px; }
              .note-date { font-size: 11px; color: #666; margin-bottom: 12px; }
              .note-content { font-size: 14px; white-space: pre-wrap; }
              .footer { margin-top: 50px; font-size: 10px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 10px; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="course">${lessonName}</div>
              <div class="title">Ringkasan Catatan Belajar</div>
            </div>
            ${notes.map(n => `
              <div class="note">
                <div class="note-title">${n.title}</div>
                <div class="note-date">${formatDate(n.updatedAt)}</div>
                <div class="note-content">${n.content}</div>
              </div>
            `).join("")}
            <div class="footer">Dibuat otomatis oleh LearnPath - ${new Date().toLocaleDateString()}</div>
          </body>
        </html>
      `;
      await printHtml(html, { dialogTitle: `Catatan - ${lessonName}` });
    } catch {
      toast.error("Gagal mengekspor PDF");
    }
  };

  const exportToTxt = async () => {
    if (notes.length === 0) return;
    try {
      let text = `RINGKASAN CATATAN: ${lessonName.toUpperCase()}\n`;
      text += `Dibuat pada: ${new Date().toLocaleString()}\n`;
      text += `==========================================\n\n`;
      
      notes.forEach(n => {
        text += `[${n.title}]\n`;
        text += `Terakhir diupdate: ${formatDate(n.updatedAt)}\n`;
        text += `------------------------------------------\n`;
        text += `${n.content}\n\n`;
      });

      const fileName = `catatan-${lessonName.replace(/\s+/g, "_").toLowerCase()}.txt`;
      const path = ((FileSystem as any).cacheDirectory ?? "") + fileName;
      await (FileSystem as any).writeAsStringAsync(path, text);
      await Sharing.shareAsync(path);
    } catch {
      toast.error("Gagal mengekspor TXT");
    }
  };

  const handleExportMenu = () => {
    Alert.alert("Ekspor Catatan", "Pilih format file untuk menyimpan seluruh catatan pelajaran ini.", [
      { text: "PDF (Rapi)", onPress: exportAllToPDF },
      { text: "Teks Tradisional (.txt)", onPress: exportToTxt },
      { text: "Batal", style: "cancel" }
    ]);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("id-ID", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

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
          <X size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSub} numberOfLines={1}>
            {lessonName}
          </Text>
          <Text style={styles.headerTitle}>{t.common.notes}</Text>
        </View>
        <TouchableOpacity onPress={handleImportFile} style={[styles.addBtn, { backgroundColor: "rgba(255,255,255,0.12)", marginRight: 8 }]}>
          <Paperclip size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleExportMenu} style={[styles.addBtn, { backgroundColor: "rgba(255,255,255,0.12)", marginRight: 8 }]}>
          <Download size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={openAdd} style={styles.addBtn}>
          <Plus size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      >
        {notes.length === 0 ? (
          <TouchableOpacity style={styles.emptyCard} onPress={openAdd} activeOpacity={0.85}>
            <FileText size={40} color={colors.primary} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>{t.notes.empty_title}</Text>
            <Text style={styles.emptySub}>{t.notes.empty_sub}</Text>
          </TouchableOpacity>
        ) : (
          notes.map((note) => {
            const hasImages = note.images && note.images.length > 0;
            return (
              <View key={note.id} style={styles.noteCard}>
                <TouchableOpacity
                  style={styles.noteHeader}
                  onPress={() => openFullView(note)}
                  activeOpacity={0.75}
                >
                  <View style={styles.noteIconWrap}>
                    <PenLine size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.noteTitle}>{note.title}</Text>
                    <View style={styles.noteMeta}>
                      <Clock size={10} color={colors.textMuted} />
                      <Text style={styles.noteDate}>{formatDate(note.updatedAt)}</Text>
                    </View>
                  </View>
                  <View style={styles.noteActions}>
                    <TouchableOpacity
                      onPress={() => openEdit(note)}
                      style={styles.iconBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <PenLine size={14} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(note)}
                      style={[styles.iconBtn, styles.iconBtnDanger]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Trash2 size={14} color={colors.danger} />
                    </TouchableOpacity>
                    {hasImages && (
                      <View style={styles.attachBadge}>
                        <FileImage size={11} color={colors.success} />
                        <Text style={styles.attachBadgeText}>
                          {note.images!.length}
                        </Text>
                      </View>
                    )}
                    <ChevronRight size={16} color={colors.textMuted} />
                  </View>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </KeyboardAwareScrollViewCompat>

      {/* Add / Edit Modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalBox,
              { paddingBottom: Math.max(insets.bottom, 24) + 16, maxHeight: "90%" },
            ]}
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
               <Text style={styles.modalTitle}>
                 {editNote ? t.notes.modal_edit : t.notes.modal_new}
               </Text>
               <TouchableOpacity 
                 onPress={() => router.push({ pathname: "/smart-scanner", params: { mode: "note", lessonId } })}
                 style={styles.scanBtn}
               >
                 <Camera size={18} color={colors.primary} />
                 <Text style={styles.scanBtnText}>Smart Scan</Text>
               </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
            <Text style={styles.fieldLabel}>{t.notes.title_ph.replace("...", "")}</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t.notes.title_ph}
              style={styles.input}
              placeholderTextColor={colors.textMuted}
              autoFocus
            />

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t.common.notes}</Text>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder={t.notes.content_ph}
              style={[styles.input, styles.textArea]}
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
            />

            <View style={{ marginTop: 12, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={[styles.fieldLabel, { flex: 1 }]}>
                  Lampiran Gambar {images.length > 0 ? `(${images.length})` : ""}
                </Text>
                <TouchableOpacity
                  onPress={addImage}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 4,
                    backgroundColor: colors.successLight, borderRadius: 8,
                    paddingHorizontal: 10, paddingVertical: 6,
                  }}
                >
                  <Plus size={12} color={colors.success} />
                  <Text style={{ fontSize: 11, fontWeight: "800", color: colors.success }}>
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
                        source={{ uri: resolveAssetUri(uri) }}
                        style={{ width: 84, height: 84, borderRadius: 10, backgroundColor: "#eee" }}
                      />
                      <TouchableOpacity
                        onPress={() => removeImage(i)}
                        style={{
                          position: "absolute", top: -6, right: -6,
                          width: 22, height: 22, borderRadius: 11,
                          backgroundColor: colors.danger,
                          alignItems: "center", justifyContent: "center",
                        }}
                      >
                        <X size={12} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>

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

const makeStyles = (c: ColorScheme, isDark: boolean, palette: string) => StyleSheet.create({
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
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerSub: {
    fontSize: 11,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "700",
    textTransform: "uppercase",
  },
  headerTitle: { fontSize: 22, fontWeight: "900", color: "#fff" },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: { padding: 16, paddingBottom: 40, gap: 10 },
  emptyCard: {
    backgroundColor: c.surface,
    borderRadius: 20,
    padding: 36,
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: c.primaryLight,
    borderStyle: "dashed",
    marginTop: 24,
  },
  emptyTitle: { fontSize: 17, fontWeight: "900", color: c.text },
  emptySub: {
    fontSize: 13,
    color: c.textMuted,
    fontWeight: "500",
    textAlign: "center",
  },
  noteCard: {
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    overflow: "hidden",
  },
  noteHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
  },
  noteIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: c.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  noteTitle: { fontSize: 14, fontWeight: "800", color: c.text },
  noteMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  noteDate: { fontSize: 10, color: c.textMuted, fontWeight: "500" },
  noteActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: c.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnDanger: { backgroundColor: c.dangerLight },
  noteBody: {
    borderTopWidth: 1,
    borderTopColor: c.border,
    padding: 14,
    backgroundColor: c.background,
  },
  noteContent: {
    fontSize: 14,
    color: c.textSecondary,
    fontWeight: "500",
    lineHeight: 22,
  },
  noteContentEmpty: {
    fontSize: 13,
    color: c.textMuted,
    fontStyle: "italic",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: isDark ? "rgba(0,0,0,0.7)" : "rgba(10,22,40,0.55)",
    justifyContent: "flex-end",
  },
  modalBox: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 20,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.border,
    alignSelf: "center",
    marginBottom: 8,
  },
  modalHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: "900", color: c.text },
  scanBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.primary + "15", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  scanBtnText: { fontSize: 12, fontWeight: "800", color: c.primary },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: c.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  input: {
    backgroundColor: c.background,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "600",
    color: c.text,
    borderWidth: 1.5,
    borderColor: c.border,
    marginTop: 6,
  },
  textArea: { height: 160, textAlignVertical: "top" },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 12 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: c.background,
    borderWidth: 1.5,
    borderColor: c.border,
    alignItems: "center",
  },
  cancelBtnText: { fontSize: 14, fontWeight: "700", color: c.textSecondary },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: c.primary,
    alignItems: "center",
  },
  saveBtnText: { fontSize: 14, fontWeight: "900", color: "#fff" },
  attachBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: c.successLight, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 3, marginRight: 2,
  },
  attachBadgeText: { fontSize: 10, fontWeight: "800", color: c.success },
});
