import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  Image,
  Animated,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, ChevronRight, Check, Plus, RotateCcw } from "lucide-react-native";
import { Feather } from "@expo/vector-icons";
import { AdBanner } from "@/components/AdBanner";
import * as Haptics from "expo-haptics";
import {
  getQuizzes,
  saveProgress,
  updateStats,
  getStats,
  getLessons,
  generateId,
  saveSessionLog,
  toggleBookmark,
  isBookmarked,
  type Quiz,
  type Lesson,
} from "@/utils/storage";
import Colors from "@/constants/colors";
import { ProgressBar } from "@/components/ProgressBar";
import { AchievementPopup } from "@/components/AchievementPopup";
import { useTranslation } from "@/contexts/LanguageContext";

export default function QuizScreen() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { t } = useTranslation();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [nextLesson, setNextLesson] = useState<Lesson | null>(null);
  const [showAchievement, setShowAchievement] = useState(false);
  const [achievementValue, setAchievementValue] = useState(0);
  const [lessonName, setLessonName] = useState("");
  const [bookmarked, setBookmarked] = useState(false);
  const startTime = useRef(Date.now());
  const xpAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const data = await getQuizzes(lessonId);
      setQuizzes(data);
      if (lessonId?.startsWith("__sc__")) {
        const { getStandaloneCollections } = await import("@/utils/storage");
        const cols = await getStandaloneCollections();
        const col = cols.find((c) => c.id === lessonId);
        if (col) setLessonName(col.name);
      } else {
        const lessons = await getLessons();
        const lesson = lessons.find((l) => l.id === lessonId);
        if (lesson) setLessonName(lesson.name);
        const idx = lessons.findIndex((l) => l.id === lessonId);
        if (idx !== -1 && idx + 1 < lessons.length) {
          setNextLesson(lessons[idx + 1]);
        }
      }
    })();
  }, [lessonId]);

  useEffect(() => {
    if (currentIndex < quizzes.length && quizzes[currentIndex]) {
      isBookmarked(quizzes[currentIndex].id, "quiz").then(setBookmarked);
    }
  }, [currentIndex, quizzes]);

  const handleBookmark = async () => {
    if (!quizzes[currentIndex]) return;
    const q = quizzes[currentIndex];
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const added = await toggleBookmark({ type: "quiz", itemId: q.id, question: q.question, answer: q.answer, lessonId: lessonId ?? "", lessonName });
    setBookmarked(added);
  };

  const triggerXP = () => {
    xpAnim.setValue(0);
    Animated.timing(xpAnim, { toValue: 1, duration: 1200, useNativeDriver: true }).start();
  };

  const currentQuiz = quizzes[currentIndex];
  const progress = (currentIndex / Math.max(quizzes.length, 1)) * 100;

  const handleOptionSelect = async (idx: number) => {
    if (isAnswered) return;
    setSelectedOption(idx);
    setIsAnswered(true);

    const correct = currentQuiz.options[idx] === currentQuiz.answer;
    Haptics.impactAsync(
      correct ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium
    );

    if (correct) setScore((s) => s + 1);

    await saveProgress({
      id: generateId(),
      userId: "local",
      lessonId: lessonId ?? "",
      quizId: currentQuiz.id,
      isCorrect: correct,
      userAnswer: currentQuiz.options[idx],
      timestamp: new Date().toISOString(),
    });

    const stats = await getStats();
    await updateStats({
      totalAnswers: stats.totalAnswers + 1,
      correctAnswers: stats.correctAnswers + (correct ? 1 : 0),
    });
  };

  const handleNext = async () => {
    if (currentIndex < quizzes.length - 1) {
      setCurrentIndex((i) => i + 1);
      setSelectedOption(null);
      setIsAnswered(false);
    } else {
      const pct = Math.round((score / quizzes.length) * 100);
      setAchievementValue(pct);
      const durationSec = Math.round((Date.now() - startTime.current) / 1000);
      await saveSessionLog({
        id: `${Date.now()}`,
        type: "quiz",
        lessonId: lessonId ?? "",
        lessonName,
        total: quizzes.length,
        correct: score,
        durationSec,
        date: new Date().toISOString(),
      });
      setDone(true);
      setTimeout(() => { setShowAchievement(true); triggerXP(); }, 400);
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsAnswered(false);
    setScore(0);
    setDone(false);
  };

  if (quizzes.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>{t.quiz.empty_title}</Text>
        <Text style={styles.emptySub}>{t.quiz.empty_sub}</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push(`/create-quiz/${lessonId}`)}
        >
          <Plus size={16} color={Colors.white} />
          <Text style={styles.addBtnText}>{t.quiz.add_btn}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>{t.common.back}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (done) {
    const pct = Math.round((score / quizzes.length) * 100);
    const xpEarned = score * 10;
    const xpTranslateY = xpAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -60, -80] });
    const xpOpacity = xpAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [1, 1, 0] });
    const xpScale = xpAnim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.5, 1.2, 1] });
    return (
      <View
        style={[
          styles.resultWrap,
          { paddingTop: Platform.OS === "web" ? 80 : insets.top + 24 },
        ]}
      >
        <Animated.View style={[styles.xpBadge, { opacity: xpOpacity, transform: [{ translateY: xpTranslateY }, { scale: xpScale }] }]}>
          <Text style={styles.xpText}>+{xpEarned} XP ⚡</Text>
        </Animated.View>
        <Text style={styles.resultEmoji}>{pct >= 80 ? "🎉" : pct >= 50 ? "👍" : "💪"}</Text>
        <Text style={styles.resultTitle}>{t.quiz.result_title}</Text>
        <Text style={styles.resultScore}>{pct}%</Text>
        <Text style={styles.resultSub}>{t.quiz.result_score(score, quizzes.length)}</Text>
        <View style={{ width: "100%", marginVertical: 8 }}>
          <ProgressBar
            value={pct}
            color={pct >= 80 ? Colors.success : pct >= 50 ? Colors.warning : Colors.danger}
            height={10}
          />
        </View>
        <View style={styles.resultBtns}>
          <TouchableOpacity style={styles.restartBtn} onPress={handleRestart}>
            <RotateCcw size={16} color={Colors.white} />
            <Text style={styles.restartBtnText}>{t.common.restart}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
            <Text style={styles.doneBtnText}>{t.common.done}</Text>
          </TouchableOpacity>
        </View>
        {nextLesson && (
          <TouchableOpacity
            style={styles.nextLessonBtn}
            onPress={() => router.replace(`/quiz/${nextLesson.id}`)}
          >
            <Text style={styles.nextLessonBtnText}>{t.common.next}: {nextLesson.name}</Text>
            <Text style={styles.nextLessonArrow}>→</Text>
          </TouchableOpacity>
        )}
        <AchievementPopup
          visible={showAchievement}
          type={achievementValue >= 100 ? "quiz_perfect" : "quiz_done"}
          value={achievementValue}
          onClose={() => setShowAchievement(false)}
        />
        <AdBanner size="adaptiveBanner" style={{ marginTop: 16, width: "100%" }} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: Platform.OS === "web" ? 74 : insets.top + 12,
          paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 20,
        },
      ]}
    >
      {/* Nav */}
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navBtn}>
          <X size={20} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.navCount}>{currentIndex + 1} / {quizzes.length}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity onPress={handleBookmark} style={styles.navBtn}>
            <Feather name="bookmark" size={18} color={bookmarked ? "#F59E0B" : Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push(`/create-quiz/${lessonId}`)}
            style={styles.navBtn}
          >
            <Plus size={20} color={Colors.black} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress */}
      <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
        <ProgressBar value={progress} height={6} />
      </View>

      {/* Question + Image */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.questionCard}>
          <Text style={styles.questionLabel}>{t.quiz.question_label(currentIndex + 1)}</Text>
          {/* Image above question */}
          {currentQuiz.image && (
            <Image
              source={{ uri: currentQuiz.image }}
              style={styles.questionImage}
              resizeMode="cover"
            />
          )}
          <Text style={styles.questionText}>{currentQuiz.question}</Text>
        </View>

        {/* Options */}
        <View style={styles.optionsWrap}>
          {currentQuiz.options.map((opt, idx) => {
            const isSelected = selectedOption === idx;
            const isCorrectAnswer = opt === currentQuiz.answer;
            const showCorrect = isAnswered && isCorrectAnswer;
            const showWrong = isAnswered && isSelected && !isCorrectAnswer;

            return (
              <TouchableOpacity
                key={idx}
                onPress={() => handleOptionSelect(idx)}
                disabled={isAnswered}
                activeOpacity={0.7}
                style={[
                  styles.option,
                  showCorrect && styles.optionCorrect,
                  showWrong && styles.optionWrong,
                  isSelected && !isAnswered && styles.optionSelected,
                ]}
              >
                <View
                  style={[
                    styles.optionBadge,
                    showCorrect && styles.badgeCorrect,
                    showWrong && styles.badgeWrong,
                    isSelected && !isAnswered && styles.badgeSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionBadgeText,
                      (showCorrect || showWrong || isSelected) && styles.optionBadgeTextActive,
                    ]}
                  >
                    {String.fromCharCode(65 + idx)}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.optionText,
                    showCorrect && { color: Colors.success },
                    showWrong && { color: Colors.danger },
                    isSelected && !isAnswered && { color: Colors.black },
                  ]}
                >
                  {opt}
                </Text>
                {showCorrect && <Check size={18} color={Colors.success} />}
                {showWrong && <X size={18} color={Colors.danger} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: Platform.OS === "web" ? 20 : insets.bottom + 20 },
        ]}
      >
        {isAnswered && (
          <TouchableOpacity onPress={handleNext} style={styles.nextBtn}>
            <Text style={styles.nextBtnText}>
              {currentIndex === quizzes.length - 1 ? t.quiz.btn_finish : t.quiz.btn_next}
            </Text>
            <ChevronRight size={20} color={Colors.white} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
    backgroundColor: Colors.background,
  },
  emptyTitle: { fontSize: 22, fontWeight: "900", color: Colors.black },
  emptySub: { fontSize: 14, color: Colors.textMuted, textAlign: "center", fontWeight: "500" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.black,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 8,
  },
  addBtnText: { color: Colors.white, fontWeight: "800", fontSize: 14 },
  backLink: { marginTop: 8 },
  backLinkText: { color: Colors.primary, fontWeight: "700", fontSize: 14 },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  navCount: { fontSize: 14, fontWeight: "800", color: Colors.textSecondary },
  questionCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 10,
    overflow: "hidden",
  },
  questionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  questionImage: {
    width: "100%",
    height: 160,
    borderRadius: 16,
  },
  questionText: {
    fontSize: 19,
    fontWeight: "800",
    color: Colors.black,
    lineHeight: 26,
  },
  optionsWrap: { gap: 10 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 14,
    gap: 14,
    borderWidth: 2,
    borderColor: Colors.borderLight,
  },
  optionSelected: { borderColor: Colors.black, backgroundColor: Colors.surface },
  optionCorrect: { borderColor: Colors.success, backgroundColor: Colors.successLight },
  optionWrong: { borderColor: Colors.danger, backgroundColor: Colors.dangerLight },
  optionBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  badgeSelected: { backgroundColor: Colors.black, borderColor: Colors.black },
  badgeCorrect: { backgroundColor: Colors.success, borderColor: Colors.success },
  badgeWrong: { backgroundColor: Colors.danger, borderColor: Colors.danger },
  optionBadgeText: { fontSize: 13, fontWeight: "800", color: Colors.textSecondary },
  optionBadgeTextActive: { color: Colors.white },
  optionText: { flex: 1, fontSize: 15, fontWeight: "600", color: Colors.black },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.black,
    paddingVertical: 18,
    borderRadius: 20,
  },
  nextBtnText: { color: Colors.white, fontWeight: "800", fontSize: 16 },
  resultWrap: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.background,
  },
  resultEmoji: { fontSize: 64 },
  resultTitle: { fontSize: 26, fontWeight: "900", color: Colors.black },
  resultScore: { fontSize: 64, fontWeight: "900", color: Colors.black },
  resultSub: { fontSize: 16, color: Colors.textMuted, fontWeight: "600" },
  resultBtns: { flexDirection: "row", gap: 12, marginTop: 16, width: "100%" },
  restartBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.black,
    paddingVertical: 16,
    borderRadius: 18,
  },
  restartBtnText: { color: Colors.white, fontWeight: "800", fontSize: 15 },
  doneBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  doneBtnText: { color: Colors.black, fontWeight: "800", fontSize: 15 },
  nextLessonBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: Colors.primaryLight,
    borderWidth: 1.5, borderColor: Colors.primary,
    borderRadius: 18, paddingVertical: 14, paddingHorizontal: 20,
    width: "100%", marginTop: 4,
  },
  nextLessonBtnText: { color: Colors.primary, fontWeight: "800", fontSize: 14, flex: 1 },
  nextLessonArrow: { color: Colors.primary, fontWeight: "900", fontSize: 18 },
  xpBadge: {
    position: "absolute",
    top: Platform.OS === "web" ? 80 : 90,
    alignSelf: "center",
    backgroundColor: "#4C6FFF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    zIndex: 100,
    shadowColor: "#4C6FFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  xpText: { fontSize: 18, fontWeight: "900", color: "#fff" },
});
