import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getQuizzes, getFlashcards, getLessons, type Quiz, type Flashcard, type Lesson } from "@/utils/storage";
import { useColors } from "@/contexts/ThemeContext";

const CHALLENGE_KEY = "daily_challenge_state";

interface ChallengeState {
  date: string;
  type: "quiz" | "flashcard";
  itemId: string;
  completed: boolean;
  wasCorrect?: boolean;
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

export default function DailyChallengeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const C = useColors();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [flashcard, setFlashcard] = useState<Flashcard | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [type, setType] = useState<"quiz" | "flashcard">("quiz");
  const [state, setState] = useState<ChallengeState | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [flipAnim] = useState(new Animated.Value(0));
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    loadChallenge();
  }, []));

  const loadChallenge = async () => {
    setLoading(true);
    const raw = await AsyncStorage.getItem(CHALLENGE_KEY);
    const savedState: ChallengeState | null = raw ? JSON.parse(raw) : null;

    if (savedState && savedState.date === todayStr()) {
      setState(savedState);
      await loadItem(savedState.type, savedState.itemId);
      if (savedState.completed) { setAnswered(true); setFlipped(true); }
      setType(savedState.type);
      setLoading(false);
      return;
    }

    const [allQuizzes, allFlashcards, lessons] = await Promise.all([
      getQuizzes(), getFlashcards(), getLessons(),
    ]);

    const seed = parseInt(todayStr().replace(/-/g, "")) % 7;
    const useQuiz = allQuizzes.length > 0 && (seed < 4 || allFlashcards.length === 0);
    const pool = useQuiz ? allQuizzes : allFlashcards;

    if (pool.length === 0) { setLoading(false); return; }

    const idx = parseInt(todayStr().replace(/-/g, "")) % pool.length;
    const item = pool[idx];
    const newState: ChallengeState = {
      date: todayStr(),
      type: useQuiz ? "quiz" : "flashcard",
      itemId: item.id,
      completed: false,
    };
    await AsyncStorage.setItem(CHALLENGE_KEY, JSON.stringify(newState));
    setState(newState);
    setType(newState.type);
    await loadItem(newState.type, item.id);
    setLoading(false);
  };

  const loadItem = async (t: "quiz" | "flashcard", id: string) => {
    if (t === "quiz") {
      const all = await getQuizzes();
      const q = all.find((x) => x.id === id) ?? all[0];
      if (q) {
        setQuiz(q);
        const lessons = await getLessons();
        setLesson(lessons.find((l) => l.id === q.lessonId) ?? null);
      }
    } else {
      const all = await getFlashcards();
      const f = all.find((x) => x.id === id) ?? all[0];
      if (f) {
        setFlashcard(f);
        const lessons = await getLessons();
        setLesson(lessons.find((l) => l.id === f.lessonId) ?? null);
      }
    }
  };

  const handleSelect = async (idx: number) => {
    if (answered || !quiz) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSelected(idx);
    setAnswered(true);
    const correct = quiz.options[idx] === quiz.answer;
    const updated: ChallengeState = { ...state!, completed: true, wasCorrect: correct };
    setState(updated);
    await AsyncStorage.setItem(CHALLENGE_KEY, JSON.stringify(updated));
  };

  const handleFlip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.spring(flipAnim, { toValue: flipped ? 0 : 1, useNativeDriver: true }).start();
    setFlipped((f) => !f);
    if (!answered) {
      setAnswered(true);
      const updated: ChallengeState = { ...state!, completed: true };
      setState(updated);
      AsyncStorage.setItem(CHALLENGE_KEY, JSON.stringify(updated));
    }
  };

  const frontInterpolate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const backInterpolate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.background }}>
        <Text style={{ fontSize: 32 }}>⏳</Text>
        <Text style={{ color: C.textMuted, fontWeight: "600", marginTop: 8 }}>Memuat tantangan...</Text>
      </View>
    );
  }

  if (!quiz && !flashcard) {
    return (
      <View style={{ flex: 1, backgroundColor: C.background }}>
        <LinearGradient colors={["#4C6FFF", "#7C47FF"]} style={[styles.header, { paddingTop: Platform.OS === "web" ? 56 : insets.top + 16 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Tantangan Harian</Text>
        </LinearGradient>
        <View style={styles.emptyCenter}>
          <Text style={styles.emptyEmoji}>📭</Text>
          <Text style={[styles.emptyTitle, { color: C.text }]}>Belum Ada Konten</Text>
          <Text style={[styles.emptySub, { color: C.textMuted }]}>
            Tambahkan flashcard atau soal kuis terlebih dahulu untuk mendapatkan tantangan harian.
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backHomeBtn}>
            <Text style={styles.backHomeBtnText}>Kembali</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <LinearGradient colors={["#FF6B6B", "#FF9500"]} style={[styles.header, { paddingTop: Platform.OS === "web" ? 56 : insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tantangan Harian</Text>
        <Text style={styles.headerSub}>
          {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        </Text>
        {lesson && <Text style={styles.lessonBadge}>{lesson.name}</Text>}
      </LinearGradient>

      <View style={styles.body}>
        {state?.completed && (
          <View style={[styles.doneBanner, { backgroundColor: state.wasCorrect ? "#ECFDF5" : "#FEF2F2" }]}>
            <Feather name={state.wasCorrect ? "check-circle" : "x-circle"} size={16} color={state.wasCorrect ? "#10B981" : "#EF4444"} />
            <Text style={[styles.doneTxt, { color: state.wasCorrect !== false ? "#10B981" : "#EF4444" }]}>
              {state.wasCorrect !== false ? "Kamu sudah menjawab tantangan hari ini!" : "Sudah diselesaikan hari ini."}
            </Text>
          </View>
        )}

        <View style={[styles.typeBadge, { backgroundColor: type === "quiz" ? "#EEF0FF" : "#FFF8EB" }]}>
          <Feather name={type === "quiz" ? "help-circle" : "credit-card"} size={14} color={type === "quiz" ? "#4C6FFF" : "#FF9500"} />
          <Text style={[styles.typeTxt, { color: type === "quiz" ? "#4C6FFF" : "#FF9500" }]}>
            {type === "quiz" ? "Soal Pilihan Ganda" : "Flashcard"}
          </Text>
        </View>

        {type === "quiz" && quiz ? (
          <>
            <Text style={[styles.question, { color: C.text }]}>{quiz.question}</Text>
            <View style={styles.options}>
              {quiz.options.map((opt, i) => {
                const isCorrect = opt === quiz.answer;
                const isSelected = selected === i;
                let bg = C.surface;
                let border = C.border;
                let textColor = C.text;
                if (answered) {
                  if (isCorrect) { bg = "#ECFDF5"; border = "#10B981"; textColor = "#059669"; }
                  else if (isSelected && !isCorrect) { bg = "#FEF2F2"; border = "#EF4444"; textColor = "#EF4444"; }
                }
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.option, { backgroundColor: bg, borderColor: border }]}
                    onPress={() => handleSelect(i)}
                    disabled={answered}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.optionLabel, { backgroundColor: border + "22" }]}>
                      <Text style={[styles.optionLabelTxt, { color: textColor }]}>
                        {String.fromCharCode(65 + i)}
                      </Text>
                    </View>
                    <Text style={[styles.optionText, { color: textColor }]}>{opt}</Text>
                    {answered && isCorrect && <Feather name="check" size={16} color="#10B981" />}
                    {answered && isSelected && !isCorrect && <Feather name="x" size={16} color="#EF4444" />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : flashcard ? (
          <TouchableOpacity onPress={handleFlip} activeOpacity={0.9}>
            <View style={styles.cardWrap}>
              <Animated.View style={[styles.cardFace, { backgroundColor: C.primary, transform: [{ rotateY: frontInterpolate as unknown as string }] }]}>
                <Text style={styles.cardLabel}>PERTANYAAN</Text>
                <Text style={styles.cardQuestion}>{flashcard.question}</Text>
                <Text style={styles.cardHint}>Tap untuk lihat jawaban</Text>
              </Animated.View>
              <Animated.View style={[styles.cardFace, styles.cardBack, { backgroundColor: C.surface, transform: [{ rotateY: backInterpolate as unknown as string }] }]}>
                <Text style={[styles.cardLabel, { color: C.textMuted }]}>JAWABAN</Text>
                <Text style={[styles.cardAnswer, { color: C.text }]}>{flashcard.answer}</Text>
              </Animated.View>
            </View>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity onPress={() => router.back()} style={styles.doneBtn} activeOpacity={0.85}>
          <LinearGradient colors={["#FF6B6B", "#FF9500"]} style={styles.doneBtnGrad}>
            <Text style={styles.doneBtnText}>Selesai</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 20, alignItems: "center", position: "relative" },
  backBtn: {
    position: "absolute", left: 20,
    top: (Platform.OS as string) === "web" ? 56 : 52,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#fff", marginBottom: 4 },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: "500", marginBottom: 4 },
  lessonBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999,
    fontSize: 12, fontWeight: "700", color: "#fff",
  },
  body: { flex: 1, padding: 20, gap: 16 },
  doneBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12 },
  doneTxt: { fontSize: 13, fontWeight: "600", flex: 1 },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, alignSelf: "flex-start" },
  typeTxt: { fontSize: 12, fontWeight: "700" },
  question: { fontSize: 17, fontWeight: "700", lineHeight: 26 },
  options: { gap: 10 },
  option: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, padding: 14, borderWidth: 1.5,
  },
  optionLabel: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  optionLabelTxt: { fontSize: 14, fontWeight: "800" },
  optionText: { flex: 1, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  cardWrap: { height: 220 },
  cardFace: {
    position: "absolute", width: "100%", height: "100%",
    borderRadius: 20, padding: 24,
    alignItems: "center", justifyContent: "center", gap: 12,
    backfaceVisibility: "hidden",
  },
  cardBack: {
    borderWidth: 1.5, borderColor: "#E6ECF8",
  },
  cardLabel: { fontSize: 11, fontWeight: "800", color: "rgba(255,255,255,0.6)", letterSpacing: 1 },
  cardQuestion: { fontSize: 18, fontWeight: "800", color: "#fff", textAlign: "center", lineHeight: 26 },
  cardHint: { fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: "500" },
  cardAnswer: { fontSize: 16, fontWeight: "700", textAlign: "center", lineHeight: 24 },
  doneBtn: { marginTop: "auto" },
  doneBtnGrad: { borderRadius: 16, padding: 16, alignItems: "center" },
  doneBtnText: { fontSize: 16, fontWeight: "800", color: "#fff" },
  emptyCenter: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: "800" },
  emptySub: { fontSize: 13, textAlign: "center", lineHeight: 20 },
  backHomeBtn: { backgroundColor: "#4C6FFF", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  backHomeBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
