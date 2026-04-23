import React, { useEffect, useState, useRef } from "react";
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
} from "lucide-react-native";
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
import Colors from "@/constants/colors";
import { toast } from "@/components/Toast";
import { useTranslation } from "@/contexts/LanguageContext";

const NOTES_DIR = ((FileSystem as any).documentDirectory ?? "") + "notes/";
const ensureNotesDir = async () => {
  if (Platform.OS === "web") return;
  const info = await FileSystem.getInfoAsync(NOTES_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(NOTES_DIR, { intermediates: true });
  }
};

export default function NotesScreen() {
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
          <X size={20} color={Colors.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSub} numberOfLines={1}>
            {lessonName}
          </Text>
          <Text style={styles.headerTitle}>{t.common.notes}</Text>
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
        {notes.length === 0 ? (
          <TouchableOpacity style={styles.emptyCard} onPress={openAdd} activeOpacity={0.85}>
            <FileText size={40} color={Colors.primary} strokeWidth={1.5} />
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
                    <PenLine size={16} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.noteTitle}>{note.title}</Text>
                    <View style={styles.noteMeta}>
                      <Clock size={10} color={Colors.textMuted} />
                      <Text style={styles.noteDate}>{formatDate(note.updatedAt)}</Text>
                    </View>
                  </View>
                  <View style={styles.noteActions}>
                    <TouchableOpacity
                      onPress={() => openEdit(note)}
                      style={styles.iconBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <PenLine size={14} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(note)}
                      style={[styles.iconBtn, styles.iconBtnDanger]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Trash2 size={14} color={Colors.danger} />
                    </TouchableOpacity>
                    {hasImages && (
                      <View style={styles.attachBadge}>
                        <FileImage size={11} color={Colors.success} />
                        <Text style={styles.attachBadgeText}>
                          {note.images!.length}
                        </Text>
                      </View>
                    )}
                    <ChevronRight size={16} color={Colors.textMuted} />
                  </View>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </KeyboardAwareScrollViewCompat>

      {/* Add / Edit Modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalBox,
              { paddingBottom: Math.max(insets.bottom, 24) + 16 },
            ]}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {editNote ? t.notes.modal_edit : t.notes.modal_new}
            </Text>

            <Text style={styles.fieldLabel}>{t.notes.title_ph.replace("...", "")}</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t.notes.title_ph}
              style={styles.input}
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t.common.notes}</Text>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder={t.notes.content_ph}
              style={[styles.input, styles.textArea]}
              placeholderTextColor={Colors.textMuted}
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
                        onPress={() => removeImage(i)}
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
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary,
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
  headerTitle: { fontSize: 22, fontWeight: "900", color: Colors.white },
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
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 36,
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: Colors.primaryLight,
    borderStyle: "dashed",
    marginTop: 24,
  },
  emptyTitle: { fontSize: 17, fontWeight: "900", color: Colors.dark },
  emptySub: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: "500",
    textAlign: "center",
  },
  noteCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
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
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  noteTitle: { fontSize: 14, fontWeight: "800", color: Colors.dark },
  noteMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  noteDate: { fontSize: 10, color: Colors.textMuted, fontWeight: "500" },
  noteActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnDanger: { backgroundColor: Colors.dangerLight },
  noteBody: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 14,
    backgroundColor: Colors.background,
  },
  noteContent: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: "500",
    lineHeight: 22,
  },
  noteContentEmpty: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: "italic",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(10,22,40,0.55)",
    justifyContent: "flex-end",
  },
  modalBox: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 8,
  },
  modalTitle: { fontSize: 20, fontWeight: "900", color: Colors.dark, marginBottom: 4 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginTop: 6,
  },
  textArea: { height: 160, textAlignVertical: "top" },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 12 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: "center",
  },
  cancelBtnText: { fontSize: 14, fontWeight: "700", color: Colors.textSecondary },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
  },
  saveBtnText: { fontSize: 14, fontWeight: "900", color: Colors.white },
  attachBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: Colors.successLight, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 3, marginRight: 2,
  },
  attachBadgeText: { fontSize: 10, fontWeight: "800", color: Colors.success },
});
