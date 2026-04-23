import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  getLearningPaths,
  getModules,
  getLessons,
  getFlashcards,
  getQuizzes,
  getStandaloneCollections,
  type LearningPath,
  type Module,
  type Lesson,
  type Flashcard,
  type Quiz,
  type StandaloneCollection,
} from "@/utils/storage";
import Colors, { shadow } from "@/constants/colors";

// ─── Types ────────────────────────────────────────────────────────────────────
type ResultKind = "course" | "module" | "lesson" | "collection" | "flashcard" | "quiz";

interface SearchResult {
  id: string;
  kind: ResultKind;
  title: string;
  subtitle: string;
  meta?: string;
  navPath: string;
  navAs?: Record<string, string>;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const KIND_CONFIG: Record<ResultKind, { label: string; icon: React.ComponentProps<typeof Feather>["name"]; color: string; bg: string }> = {
  course:     { label: "Kursus",        icon: "book",          color: "#4C6FFF", bg: "#EEF1FF" },
  module:     { label: "Modul",         icon: "layers",        color: "#7C3AED", bg: "#F5F0FF" },
  lesson:     { label: "Pelajaran",     icon: "file-text",     color: "#0891B2", bg: "#E0F7FA" },
  collection: { label: "Koleksi",       icon: "folder",        color: "#059669", bg: "#E6F7F1" },
  flashcard:  { label: "Flashcard",     icon: "credit-card",   color: "#D97706", bg: "#FFF7E6" },
  quiz:       { label: "Soal Quiz",     icon: "help-circle",   color: "#DC2626", bg: "#FEF2F2" },
};

const SECTION_ORDER: ResultKind[] = ["course", "module", "lesson", "collection", "flashcard", "quiz"];
const SECTION_LABELS: Record<ResultKind, string> = {
  course:     "Kursus",
  module:     "Modul",
  lesson:     "Pelajaran",
  collection: "Koleksi Pribadi",
  flashcard:  "Flashcard",
  quiz:       "Soal Quiz",
};

// ─── Main component ──────────────────────────────────────────────────────────
export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Search engine ────────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const qLow = q.toLowerCase();
    const found: SearchResult[] = [];

    try {
      // 1. Learning paths (courses)
      const paths = await getLearningPaths();
      const pathMap: Record<string, LearningPath> = {};
      paths.forEach((p) => (pathMap[p.id] = p));
      paths.forEach((p) => {
        if (p.name.toLowerCase().includes(qLow) || (p.description ?? "").toLowerCase().includes(qLow)) {
          found.push({
            id: p.id,
            kind: "course",
            title: p.name,
            subtitle: p.description ?? "Kursus pembelajaran",
            meta: `${p.completedLessons ?? 0}/${p.totalLessons ?? 0} pelajaran`,
            navPath: `/course/${p.id}`,
          });
        }
      });

      // 2. Modules
      const modules = await getModules();
      const modMap: Record<string, Module> = {};
      modules.forEach((m) => (modMap[m.id] = m));
      modules.forEach((m) => {
        if (m.name.toLowerCase().includes(qLow) || (m.description ?? "").toLowerCase().includes(qLow)) {
          const path = pathMap[m.pathId];
          found.push({
            id: m.id,
            kind: "module",
            title: m.name,
            subtitle: path ? `Kursus: ${path.name}` : "Modul",
            navPath: `/course/${m.pathId}`,
          });
        }
      });

      // 3. Lessons
      const lessons = await getLessons();
      const lessonMap: Record<string, Lesson> = {};
      lessons.forEach((l) => (lessonMap[l.id] = l));
      lessons.forEach((l) => {
        if (l.name.toLowerCase().includes(qLow)) {
          const mod = modMap[l.moduleId];
          const path = mod ? pathMap[mod.pathId] : undefined;
          found.push({
            id: l.id,
            kind: "lesson",
            title: l.name,
            subtitle: [mod?.name, path?.name].filter(Boolean).join(" · ") || "Pelajaran",
            navPath: `/flashcard/${l.id}`,
          });
        }
      });

      // 4. Standalone collections
      const cols = await getStandaloneCollections();
      const colMap: Record<string, StandaloneCollection> = {};
      cols.forEach((c) => (colMap[c.id] = c));
      cols.forEach((c) => {
        if (c.name.toLowerCase().includes(qLow) || (c.description ?? "").toLowerCase().includes(qLow)) {
          const dest = c.type === "quiz" ? `/quiz/${c.id}` : `/flashcard/${c.id}`;
          found.push({
            id: c.id,
            kind: "collection",
            title: c.name,
            subtitle: c.description || (c.type === "quiz" ? "Koleksi Soal Quiz" : "Koleksi Flashcard"),
            meta: c.type === "quiz" ? "Quiz" : "Flashcard",
            navPath: dest,
          });
        }
      });

      // 5. Flashcard items — search by question or answer
      const allFlashcards: Flashcard[] = [];
      // Search lesson flashcards
      for (const l of lessons) {
        const cards = await getFlashcards(l.id);
        allFlashcards.push(...cards);
      }
      // Search standalone collection flashcards
      for (const c of cols.filter((c) => c.type !== "quiz")) {
        const cards = await getFlashcards(c.id);
        allFlashcards.push(...cards);
      }
      allFlashcards.forEach((card) => {
        if (
          card.question.toLowerCase().includes(qLow) ||
          card.answer.toLowerCase().includes(qLow) ||
          (card.tag ?? "").toLowerCase().includes(qLow)
        ) {
          // Get lesson or collection name
          const lesson = lessonMap[card.lessonId];
          const col = colMap[card.lessonId];
          const contextName = lesson?.name ?? col?.name ?? "Koleksi";
          found.push({
            id: card.id,
            kind: "flashcard",
            title: card.question,
            subtitle: `Jawaban: ${card.answer}`,
            meta: contextName,
            navPath: `/flashcard/${card.lessonId}`,
          });
        }
      });

      // 6. Quiz items — search by question
      const allQuizzes: Quiz[] = [];
      for (const l of lessons) {
        const qs = await getQuizzes(l.id);
        allQuizzes.push(...qs);
      }
      for (const c of cols.filter((c) => c.type === "quiz")) {
        const qs = await getQuizzes(c.id);
        allQuizzes.push(...qs);
      }
      allQuizzes.forEach((q) => {
        if (
          q.question.toLowerCase().includes(qLow) ||
          (q.answer ?? "").toLowerCase().includes(qLow)
        ) {
          const lesson = lessonMap[q.lessonId];
          const col = colMap[q.lessonId];
          const contextName = lesson?.name ?? col?.name ?? "Koleksi";
          found.push({
            id: q.id,
            kind: "quiz",
            title: q.question,
            subtitle: `Jawaban: ${q.answer}`,
            meta: contextName,
            navPath: `/quiz/${q.lessonId}`,
          });
        }
      });
    } finally {
      setResults(found);
      setLoading(false);
    }
  }, []);

  // ── Debounce ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => runSearch(query), 320);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  // ── Auto-focus ───────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  // ── Group results ─────────────────────────────────────────────────────────
  const grouped = SECTION_ORDER.reduce<Record<ResultKind, SearchResult[]>>(
    (acc, k) => ({ ...acc, [k]: results.filter((r) => r.kind === k) }),
    {} as Record<ResultKind, SearchResult[]>
  );
  const totalCount = results.length;

  // ── Navigate ──────────────────────────────────────────────────────────────
  const handleNav = (r: SearchResult) => {
    router.push(r.navPath as any);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header + Search Bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.searchBar}>
          <Feather name="search" size={16} color={Colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Cari kursus, modul, flashcard, soal..."
            placeholderTextColor={Colors.textSecondary}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x-circle" size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Body */}
      {!query.trim() ? (
        <EmptyPrompt />
      ) : loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Mencari...</Text>
        </View>
      ) : totalCount === 0 ? (
        <NoResults query={query} />
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Total count */}
          <Text style={styles.totalCount}>{totalCount} hasil untuk "{query}"</Text>

          {SECTION_ORDER.map((kind) => {
            const items = grouped[kind];
            if (!items || items.length === 0) return null;
            return (
              <View key={kind} style={styles.section}>
                {/* Section header */}
                <View style={styles.sectionHead}>
                  <View style={[styles.sectionDot, { backgroundColor: KIND_CONFIG[kind].color }]} />
                  <Text style={styles.sectionLabel}>{SECTION_LABELS[kind]}</Text>
                  <View style={[styles.countPill, { backgroundColor: KIND_CONFIG[kind].bg }]}>
                    <Text style={[styles.countPillText, { color: KIND_CONFIG[kind].color }]}>{items.length}</Text>
                  </View>
                </View>

                {/* Results */}
                {items.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.resultCard, shadow]}
                    onPress={() => handleNav(r)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.kindIcon, { backgroundColor: KIND_CONFIG[r.kind].bg }]}>
                      <Feather name={KIND_CONFIG[r.kind].icon} size={15} color={KIND_CONFIG[r.kind].color} />
                    </View>
                    <View style={styles.resultBody}>
                      <Text style={styles.resultTitle} numberOfLines={2}>
                        {highlightText(r.title, query)}
                      </Text>
                      <Text style={styles.resultSubtitle} numberOfLines={1}>
                        {r.subtitle}
                      </Text>
                      {r.meta ? (
                        <View style={[styles.metaPill, { backgroundColor: KIND_CONFIG[r.kind].bg }]}>
                          <Text style={[styles.metaPillText, { color: KIND_CONFIG[r.kind].color }]}>{r.meta}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Feather name="chevron-right" size={15} color={Colors.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Helper to highlight matching text ───────────────────────────────────────
function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      <Text style={styles.resultTitle}>{text.slice(0, idx)}</Text>
      <Text style={[styles.resultTitle, styles.highlight]}>{text.slice(idx, idx + query.length)}</Text>
      <Text style={styles.resultTitle}>{text.slice(idx + query.length)}</Text>
    </>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────
function EmptyPrompt() {
  const tips = [
    { icon: "book" as const,        text: "Kursus & modul pembelajaran" },
    { icon: "file-text" as const,   text: "Nama pelajaran dalam kursus" },
    { icon: "credit-card" as const, text: "Pertanyaan & jawaban flashcard" },
    { icon: "help-circle" as const, text: "Soal dan jawaban quiz" },
    { icon: "folder" as const,      text: "Koleksi pribadi" },
  ];
  return (
    <View style={styles.centerBox}>
      <View style={styles.emptyIcon}>
        <Feather name="search" size={32} color={Colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>Cari di semua konten</Text>
      <Text style={styles.emptySubtitle}>Ketik untuk mencari:</Text>
      <View style={styles.tipList}>
        {tips.map((tip, i) => (
          <View key={i} style={styles.tipRow}>
            <Feather name={tip.icon} size={14} color={Colors.primary} />
            <Text style={styles.tipText}>{tip.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <View style={styles.centerBox}>
      <Feather name="search" size={40} color="#CBD5E1" />
      <Text style={styles.noResultTitle}>Tidak ditemukan</Text>
      <Text style={styles.noResultSub}>Tidak ada hasil untuk "{query}"</Text>
      <Text style={styles.noResultHint}>Coba kata kunci yang berbeda atau lebih singkat</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#EAEDF0",
    gap: 10,
  },
  backBtn: {
    padding: 4,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F3F8",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    gap: 8,
  },
  searchIcon: {
    marginRight: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#1A1D23",
    padding: 0,
    margin: 0,
  },
  scrollArea: {
    flex: 1,
  },
  totalCount: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 4,
  },
  section: {
    marginTop: 16,
    marginHorizontal: 16,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 6,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    flex: 1,
  },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  countPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  kindIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  resultBody: {
    flex: 1,
    gap: 2,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1D23",
    lineHeight: 20,
  },
  highlight: {
    backgroundColor: "#FEF08A",
    color: "#92400E",
  },
  resultSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  metaPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 3,
  },
  metaPillText: {
    fontSize: 10,
    fontWeight: "600",
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 10,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#EEF1FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1D23",
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  tipList: {
    alignSelf: "stretch",
    gap: 8,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tipText: {
    fontSize: 13,
    color: "#374151",
  },
  noResultTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#374151",
    marginTop: 12,
  },
  noResultSub: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: "center",
  },
  noResultHint: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
    textAlign: "center",
  },
});
