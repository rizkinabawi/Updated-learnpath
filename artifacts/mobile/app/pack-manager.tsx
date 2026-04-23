import React, { useCallback, useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Platform, Alert, TextInput, Modal,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import {
  getFlashcardPacks, saveFlashcardPack, deleteFlashcardPack,
  getQuizPacks, saveQuizPack, deleteQuizPack,
  getLessons, getFlashcards, getQuizzes,
  type FlashcardPack, type QuizPack, type Lesson,
} from "@/utils/storage";
import Colors from "@/constants/colors";
import { toast } from "@/components/Toast";

type PackType = "flashcard" | "quiz";

interface EnrichedPack {
  id: string;
  name: string;
  lessonId: string;
  lessonName: string;
  type: PackType;
  count: number;
  createdAt: string;
}

export default function PackManager() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [packs, setPacks] = useState<EnrichedPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PackType | "all">("all");

  const [renameModal, setRenameModal] = useState(false);
  const [renamePack, setRenamePack] = useState<EnrichedPack | null>(null);
  const [renameText, setRenameText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [lessons, fpacks, qpacks, flashcards, quizzes] = await Promise.all([
      getLessons(),
      getFlashcardPacks(),
      getQuizPacks(),
      getFlashcards(),
      getQuizzes(),
    ]);

    const lessonMap: Record<string, string> = {};
    lessons.forEach((l: Lesson) => { lessonMap[l.id] = l.name; });

    const enriched: EnrichedPack[] = [
      ...fpacks.map((p: FlashcardPack) => ({
        id: p.id,
        name: p.name,
        lessonId: p.lessonId,
        lessonName: lessonMap[p.lessonId] ?? "Pelajaran",
        type: "flashcard" as const,
        count: flashcards.filter((f: any) => f.packId === p.id).length,
        createdAt: p.createdAt,
      })),
      ...qpacks.map((p: QuizPack) => ({
        id: p.id,
        name: p.name,
        lessonId: p.lessonId,
        lessonName: lessonMap[p.lessonId] ?? "Pelajaran",
        type: "quiz" as const,
        count: quizzes.filter((q: any) => q.packId === p.id).length,
        createdAt: p.createdAt,
      })),
    ];
    enriched.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setPacks(enriched);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDelete = (pack: EnrichedPack) => {
    Alert.alert(
      "Hapus Pack",
      `Hapus pack "${pack.name}"?\n\n⚠️ ${pack.type === "quiz" ? "Soal" : "Flashcard"} dalam pack ini tidak akan ikut terhapus, hanya pengelompokannya.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus Pack",
          style: "destructive",
          onPress: async () => {
            if (pack.type === "flashcard") await deleteFlashcardPack(pack.id);
            else await deleteQuizPack(pack.id);
            setPacks((prev) => prev.filter((p) => p.id !== pack.id));
            toast.info("Pack dihapus");
          },
        },
      ]
    );
  };

  const openRename = (pack: EnrichedPack) => {
    setRenamePack(pack);
    setRenameText(pack.name);
    setRenameModal(true);
  };

  const handleRename = async () => {
    if (!renamePack) return;
    const newName = renameText.trim();
    if (!newName) { Alert.alert("Nama kosong", "Masukkan nama pack."); return; }
    if (renamePack.type === "flashcard") {
      await saveFlashcardPack({ id: renamePack.id, lessonId: renamePack.lessonId, name: newName, createdAt: renamePack.createdAt });
    } else {
      await saveQuizPack({ id: renamePack.id, lessonId: renamePack.lessonId, name: newName, createdAt: renamePack.createdAt });
    }
    setPacks((prev) => prev.map((p) => p.id === renamePack.id ? { ...p, name: newName } : p));
    toast.success("Pack diperbarui");
    setRenameModal(false);
    setRenamePack(null);
  };

  const filtered = filter === "all" ? packs : packs.filter((p) => p.type === filter);
  const fcCount = packs.filter((p) => p.type === "flashcard").length;
  const qCount = packs.filter((p) => p.type === "quiz").length;

  const TYPE_META = {
    flashcard: { label: "Flashcard", icon: "layers" as const, color: "#8B5CF6", bg: "#8B5CF618" },
    quiz: { label: "Quiz", icon: "help-circle" as const, color: "#EF4444", bg: "#EF444418" },
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Header */}
      <LinearGradient
        colors={["#8B5CF6", "#4C6FFF"]}
        style={[styles.header, { paddingTop: Platform.OS === "web" ? 60 : insets.top + 16 }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Pack Manager</Text>
            <Text style={styles.headerSub}>{packs.length} pack total</Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { val: packs.length, lbl: "Total Pack", color: "#fff" },
            { val: fcCount, lbl: "Flashcard", color: "#C4B5FD" },
            { val: qCount, lbl: "Quiz", color: "#FCA5A5" },
          ].map((s, i) => (
            <View key={i} style={[styles.statChip, i > 0 && { borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.2)" }]}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.statLbl}>{s.lbl}</Text>
            </View>
          ))}
        </View>

        {/* Filter */}
        <View style={styles.filterRow}>
          {(["all", "flashcard", "quiz"] as const).map((f) => {
            const active = filter === f;
            const label = f === "all" ? `Semua (${packs.length})` : f === "flashcard" ? `Flashcard (${fcCount})` : `Quiz (${qCount})`;
            return (
              <TouchableOpacity
                key={f}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </LinearGradient>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: Colors.textMuted }}>Memuat pack...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 32 }}>
          <Feather name="inbox" size={48} color={Colors.border} />
          <Text style={{ color: Colors.textMuted, fontSize: 15, fontWeight: "700", textAlign: "center" }}>Belum ada pack</Text>
          <Text style={{ color: Colors.textMuted, fontSize: 13, textAlign: "center" }}>
            Buat pack saat menambahkan soal quiz atau flashcard dari JSON
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} showsVerticalScrollIndicator={false}>
          {filtered.map((pack) => {
            const meta = TYPE_META[pack.type];
            return (
              <View key={pack.id} style={styles.packCard}>
                <View style={[styles.packIcon, { backgroundColor: meta.bg }]}>
                  <Feather name={meta.icon} size={20} color={meta.color} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.packName}>{pack.name}</Text>
                  <Text style={styles.packLesson} numberOfLines={1}>
                    📚 {pack.lessonName}
                  </Text>
                  <View style={styles.packMeta}>
                    <View style={[styles.packTypeBadge, { backgroundColor: meta.bg }]}>
                      <Text style={[styles.packTypeBadgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <Text style={styles.packCount}>{pack.count} item</Text>
                  </View>
                </View>
                <View style={styles.packActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => openRename(pack)}>
                    <Feather name="edit-2" size={14} color={Colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => handleDelete(pack)}>
                    <Feather name="trash-2" size={14} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
          <View style={{ height: Math.max(insets.bottom, 16) }} />
        </ScrollView>
      )}

      {/* Rename Modal */}
      <Modal visible={renameModal} transparent animationType="fade" onRequestClose={() => setRenameModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Ganti Nama Pack</Text>
            <Text style={styles.modalSub}>{renamePack?.type === "quiz" ? "Quiz" : "Flashcard"} Pack</Text>
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              style={styles.modalInput}
              placeholderTextColor={Colors.textMuted}
              placeholder="Nama pack baru"
              autoFocus
              selectTextOnFocus
            />
            <TouchableOpacity style={styles.modalSave} onPress={handleRename}>
              <Text style={styles.modalSaveText}>Simpan</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setRenameModal(false)}>
              <Text style={styles.modalCancelText}>Batal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#fff" },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: "600", marginTop: 1 },
  statsRow: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 16, overflow: "hidden" },
  statChip: { flex: 1, alignItems: "center", paddingVertical: 12 },
  statVal: { fontSize: 22, fontWeight: "900" },
  statLbl: { fontSize: 10, color: "rgba(255,255,255,0.65)", fontWeight: "700", textTransform: "uppercase" },
  filterRow: { flexDirection: "row", gap: 8 },
  filterChip: {
    flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  filterChipActive: { backgroundColor: "#fff" },
  filterText: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.8)" },
  filterTextActive: { color: "#4C6FFF" },
  packCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: Colors.white, borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  packIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  packName: { fontSize: 15, fontWeight: "800", color: Colors.dark },
  packLesson: { fontSize: 12, color: Colors.textMuted, fontWeight: "500" },
  packMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  packTypeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  packTypeBadgeText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  packCount: { fontSize: 12, color: Colors.textMuted, fontWeight: "600" },
  packActions: { flexDirection: "column", gap: 6 },
  actionBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.primaryLight, alignItems: "center", justifyContent: "center",
  },
  actionBtnDanger: { backgroundColor: Colors.dangerLight },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center", alignItems: "center", paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: Colors.white, borderRadius: 20, padding: 24,
    width: "100%", gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 24, elevation: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: "900", color: Colors.dark },
  modalSub: { fontSize: 13, color: Colors.textMuted, fontWeight: "500" },
  modalInput: {
    backgroundColor: Colors.background, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, fontWeight: "700", color: Colors.dark,
    borderWidth: 1.5, borderColor: Colors.border,
    marginTop: 4,
  },
  modalSave: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 13, alignItems: "center",
  },
  modalSaveText: { fontSize: 15, fontWeight: "900", color: "#fff" },
  modalCancel: { alignItems: "center", paddingVertical: 6 },
  modalCancelText: { fontSize: 14, fontWeight: "700", color: Colors.textMuted },
});
