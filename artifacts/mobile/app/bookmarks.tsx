import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { getBookmarks, toggleBookmark, type BookmarkedItem } from "@/utils/storage";
import { useColors } from "@/contexts/ThemeContext";

export default function BookmarksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const C = useColors();
  const [items, setItems] = useState<BookmarkedItem[]>([]);
  const [filter, setFilter] = useState<"all" | "flashcard" | "quiz">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    getBookmarks().then(setItems);
  }, []));

  const filtered = filter === "all" ? items : items.filter((i) => i.type === filter);

  const handleRemove = (item: BookmarkedItem) => {
    Alert.alert("Hapus Bookmark?", `"${item.question}"`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: async () => {
          await toggleBookmark(item);
          setItems((prev) => prev.filter((x) => x.id !== item.id));
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <LinearGradient
        colors={["#F59E0B", "#EF4444"]}
        style={[styles.header, { paddingTop: Platform.OS === "web" ? 56 : insets.top + 16 }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bookmark</Text>
        <Text style={styles.headerSub}>{items.length} item tersimpan</Text>
      </LinearGradient>

      {/* Filter */}
      <View style={[styles.filterRow, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        {(["all", "flashcard", "quiz"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === "all" ? "Semua" : f === "flashcard" ? "Flashcard" : "Kuis"}
              {" "}({f === "all" ? items.length : items.filter((i) => i.type === f).length})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: Math.max(insets.bottom, 24) + 16 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🔖</Text>
            <Text style={[styles.emptyTitle, { color: C.text }]}>Belum Ada Bookmark</Text>
            <Text style={[styles.emptySub, { color: C.textMuted }]}>
              Tekan ikon bookmark saat belajar flashcard atau kuis untuk menyimpan soal di sini.
            </Text>
          </View>
        ) : (
          filtered.map((item) => {
            const isFC = item.type === "flashcard";
            const isOpen = expanded === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.card, { backgroundColor: C.surface }]}
                onPress={() => setExpanded(isOpen ? null : item.id)}
                activeOpacity={0.85}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.typeTag, { backgroundColor: isFC ? "#EEF0FF" : "#FFF8EB" }]}>
                    <Feather name={isFC ? "credit-card" : "help-circle"} size={12} color={isFC ? "#4C6FFF" : "#FF9500"} />
                    <Text style={[styles.typeText, { color: isFC ? "#4C6FFF" : "#FF9500" }]}>
                      {isFC ? "Flashcard" : "Kuis"}
                    </Text>
                  </View>
                  <Text style={[styles.lessonName, { color: C.textMuted }]} numberOfLines={1}>
                    {item.lessonName}
                  </Text>
                  <TouchableOpacity onPress={() => handleRemove(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Feather name="bookmark" size={16} color="#F59E0B" />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.question, { color: C.text }]} numberOfLines={isOpen ? undefined : 2}>
                  {item.question}
                </Text>
                {isOpen && (
                  <View style={[styles.answerBox, { backgroundColor: C.primaryLight ?? "#EEF0FF" }]}>
                    <Text style={[styles.answerLabel, { color: C.primary }]}>Jawaban:</Text>
                    <Text style={[styles.answerText, { color: C.text }]}>{item.answer}</Text>
                  </View>
                )}
                <View style={styles.cardFooter}>
                  <Text style={[styles.dateText, { color: C.textMuted }]}>
                    {new Date(item.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </Text>
                  <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={14} color={C.textMuted} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    alignItems: "center",
    position: "relative",
  },
  backBtn: {
    position: "absolute",
    left: 20,
    top: Platform.OS === "web" ? 56 : 52,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#fff", marginBottom: 4 },
  headerSub: { fontSize: 13, color: "rgba(255,255,255,0.75)", fontWeight: "500" },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#CBD5E0",
  },
  filterBtnActive: { backgroundColor: "#4C6FFF", borderColor: "#4C6FFF" },
  filterText: { fontSize: 12, fontWeight: "700", color: "#99AAC3" },
  filterTextActive: { color: "#fff" },
  scroll: { padding: 16, gap: 10 },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: "800" },
  emptySub: { fontSize: 13, textAlign: "center", lineHeight: 20, paddingHorizontal: 32 },
  card: {
    borderRadius: 16,
    padding: 14,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  typeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  typeText: { fontSize: 11, fontWeight: "700" },
  lessonName: { flex: 1, fontSize: 11, fontWeight: "500" },
  question: { fontSize: 14, fontWeight: "600", lineHeight: 21 },
  answerBox: { borderRadius: 10, padding: 12 },
  answerLabel: { fontSize: 11, fontWeight: "800", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  answerText: { fontSize: 13, fontWeight: "500", lineHeight: 20 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dateText: { fontSize: 11, fontWeight: "500" },
});
