import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  getWrongAnswers,
  getFlashcards,
  getQuizzes,
  type Progress,
  type Flashcard,
  type Quiz,
} from "@/utils/storage";
import Colors, { shadow } from "@/constants/colors";
import { useTranslation } from "@/contexts/LanguageContext";

type ReviewItem = {
  progress: Progress;
  content?: Flashcard | Quiz;
  type: "flashcard" | "quiz";
};

export default function MistakesReview() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const wrongs = await getWrongAnswers();
      const reviewItems: ReviewItem[] = [];
      for (const p of wrongs) {
        if (p.flashcardId) {
          const allCards = await getFlashcards();
          const card = allCards.find((c) => c.id === p.flashcardId);
          reviewItems.push({ progress: p, content: card, type: "flashcard" });
        } else if (p.quizId) {
          const allQuizzes = await getQuizzes();
          const quiz = allQuizzes.find((q) => q.id === p.quizId);
          reviewItems.push({ progress: p, content: quiz, type: "quiz" });
        }
      }
      setItems(reviewItems.filter((i) => i.content));
      setLoading(false);
    })();
  }, []);

  return (
    <View
      style={[
        styles.container,
        { paddingTop: Platform.OS === "web" ? 74 : insets.top + 12 },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={Colors.dark} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t.mistakes.header_title}</Text>
          <Text style={styles.headerSub}>
            {loading ? t.mistakes.loading : t.mistakes.count(items.length)}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <Text style={styles.loadingText}>{t.mistakes.loading}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 72 }}>🏆</Text>
          <Text style={styles.emptyTitle}>{t.mistakes.empty_title}</Text>
          <Text style={styles.emptySub}>{t.mistakes.empty_sub}</Text>
          <TouchableOpacity style={styles.ctaBtn} onPress={() => router.back()}>
            <Text style={styles.ctaBtnText}>{t.common.back}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {items.map((item, i) => {
            const { content, type, progress } = item;
            if (!content) return null;
            const isFlashcard = type === "flashcard";
            const card = isFlashcard ? (content as Flashcard) : null;
            const quiz = !isFlashcard ? (content as Quiz) : null;

            return (
              <View key={progress.id ?? i} style={styles.card}>
                {/* Badge */}
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: isFlashcard ? Colors.primaryLight : Colors.accentLight },
                  ]}
                >
                  <Text style={{ fontSize: 12 }}>{isFlashcard ? "🃏" : "❓"}</Text>
                  <Text
                    style={[
                      styles.badgeText,
                      { color: isFlashcard ? Colors.primaryDark : "#B45309" },
                    ]}
                  >
                    {isFlashcard ? "Flashcard" : "Quiz"}
                  </Text>
                </View>

                {/* Question */}
                <Text style={styles.question}>
                  {isFlashcard ? card!.question : quiz!.question}
                </Text>

                <View style={styles.divider} />

                {/* Correct answer */}
                <Text style={styles.answerLabel}>Jawaban Benar</Text>
                <Text style={styles.correctAnswer}>
                  {isFlashcard ? card!.answer : quiz!.answer}
                </Text>

                {/* User's wrong answer */}
                {progress.userAnswer && progress.userAnswer !== (isFlashcard ? card!.answer : quiz!.answer) && (
                  <>
                    <Text style={styles.answerLabel}>Jawaban Kamu</Text>
                    <Text style={styles.wrongAnswer}>{progress.userAnswer}</Text>
                  </>
                )}

                {/* Quiz options */}
                {quiz && (
                  <View style={styles.optionsWrap}>
                    {quiz.options.map((opt, idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.optionChip,
                          opt === quiz.answer && styles.optionCorrect,
                          opt === progress.userAnswer && opt !== quiz.answer && styles.optionWrong,
                        ]}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            opt === quiz.answer && { color: Colors.success, fontWeight: "800" },
                            opt === progress.userAnswer && opt !== quiz.answer && { color: Colors.danger },
                          ]}
                        >
                          {opt}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTitle: { fontSize: 22, fontWeight: "900", color: Colors.dark },
  headerSub: { fontSize: 12, color: Colors.textMuted, fontWeight: "600", marginTop: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 10,
  },
  loadingText: { fontSize: 15, color: Colors.textMuted, fontWeight: "600" },
  emptyTitle: { fontSize: 26, fontWeight: "900", color: Colors.dark, marginTop: 8 },
  emptySub: { fontSize: 14, color: Colors.textMuted, textAlign: "center", fontWeight: "500", lineHeight: 22 },
  ctaBtn: {
    marginTop: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 999,
  },
  ctaBtnText: { color: Colors.white, fontWeight: "800", fontSize: 15 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    gap: 8,
    ...shadow,
    shadowOpacity: 0.06,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 4,
  },
  badgeText: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  question: { fontSize: 16, fontWeight: "700", color: Colors.dark, lineHeight: 24 },
  divider: { height: 1, backgroundColor: Colors.border },
  answerLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  correctAnswer: { fontSize: 15, fontWeight: "700", color: Colors.success },
  wrongAnswer: { fontSize: 14, fontWeight: "600", color: Colors.danger },
  optionsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionCorrect: { backgroundColor: Colors.successLight, borderColor: Colors.success },
  optionWrong: { backgroundColor: Colors.dangerLight, borderColor: Colors.danger },
  optionText: { fontSize: 13, fontWeight: "600", color: Colors.textSecondary },
});
