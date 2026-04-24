import { useColors } from "@/contexts/ThemeContext";
import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  Image,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, Plus, RotateCcw, Check, Volume2 } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useAudioPlayer } from "expo-audio";
import {
  getFlashcards,
  saveProgress,
  updateStats,
  getStats,
  getLessons,
  generateId,
  saveSessionLog,
  toggleBookmark,
  isBookmarked,
  updateSpacedRep,
  sortBySpacedRep,
  type Flashcard,
  type Lesson,
} from "@/utils/storage";
import { Feather } from "@expo/vector-icons";
import { type ColorScheme } from "@/constants/colors";
import { ProgressBar } from "@/components/ProgressBar";
import { AchievementPopup } from "@/components/AchievementPopup";
import { useTranslation } from "@/contexts/LanguageContext";

export default function FlashcardScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [completed, setCompleted] = useState<Record<string, "correct" | "wrong">>({});
  const [done, setDone] = useState(false);
  const [nextLesson, setNextLesson] = useState<Lesson | null>(null);
  const [showAchievement, setShowAchievement] = useState(false);
  const [achievementValue, setAchievementValue] = useState(0);
  const [lessonName, setLessonName] = useState("");
  const [bookmarked, setBookmarked] = useState(false);
  const startTime = useRef(Date.now());
  const xpAnim = useRef(new Animated.Value(0)).current;

  const [flipAnim] = useState(new Animated.Value(0));
  const [viewMode, setViewMode] = useState<"card" | "table">("card");

  const card = cards[currentIndex];
  const audioPlayer = useAudioPlayer(card?.audio ?? null);

  useEffect(() => {
    (async () => {
      const rawData = await getFlashcards(lessonId);
      const sorted = await sortBySpacedRep(rawData);
      setCards(sorted);
      if (lessonId?.startsWith("__sc__")) {
        // Standalone collection — look up name from standalone_collections
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
    if (cards[currentIndex]) {
      isBookmarked(cards[currentIndex].id, "flashcard").then(setBookmarked);
    }
  }, [currentIndex, cards]);

  const handleBookmark = async () => {
    const card = cards[currentIndex];
    if (!card) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const added = await toggleBookmark({ type: "flashcard", itemId: card.id, question: card.question, answer: card.answer, lessonId: lessonId ?? "", lessonName });
    setBookmarked(added);
  };

  const triggerXP = () => {
    xpAnim.setValue(0);
    Animated.timing(xpAnim, { toValue: 1, duration: 1200, useNativeDriver: true }).start();
  };

  const handleFlip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const toValue = flipped ? 0 : 1;
    Animated.spring(flipAnim, {
      toValue,
      friction: 8,
      tension: 100,
      useNativeDriver: false,
    }).start();
    setFlipped(!flipped);
  };

  const handleAnswer = async (correct: boolean) => {
    const card = cards[currentIndex];
    Haptics.impactAsync(
      correct ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium
    );
    const newCompleted = { ...completed, [card.id]: correct ? "correct" : "wrong" } as Record<string, "correct" | "wrong">;
    setCompleted(newCompleted);

    await saveProgress({
      id: generateId(),
      userId: "local",
      lessonId: lessonId ?? "",
      flashcardId: card.id,
      isCorrect: correct,
      timestamp: new Date().toISOString(),
    });

    const stats = await getStats();
    await updateStats({
      totalAnswers: stats.totalAnswers + 1,
      correctAnswers: stats.correctAnswers + (correct ? 1 : 0),
    });

    await updateSpacedRep(card.id, correct ? 5 : 1);

    if (currentIndex < cards.length - 1) {
      setFlipped(false);
      flipAnim.setValue(0);
      setCurrentIndex((i) => i + 1);
    } else {
      const correctCount = Object.values(newCompleted).filter((v) => v === "correct").length;
      setAchievementValue(correctCount);
      const durationSec = Math.round((Date.now() - startTime.current) / 1000);
      await saveSessionLog({
        id: `${Date.now()}`,
        type: "flashcard",
        lessonId: lessonId ?? "",
        lessonName,
        total: cards.length,
        correct: correctCount,
        durationSec,
        date: new Date().toISOString(),
      });
      setDone(true);
      setTimeout(() => { setShowAchievement(true); triggerXP(); }, 400);
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setFlipped(false);
    flipAnim.setValue(0);
    setCompleted({});
    setDone(false);
  };

  if (cards.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>{t.flashcard.empty_title}</Text>
        <Text style={styles.emptySub}>{t.flashcard.empty_sub}</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push(`/create-flashcard/${lessonId}`)}
        >
          <Plus size={16} color={colors.white} />
          <Text style={styles.addBtnText}>{t.flashcard.add_btn}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>{t.common.back}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (done) {
    const correctCount = Object.values(completed).filter((v) => v === "correct").length;
    const pct = Math.round((correctCount / cards.length) * 100);
    const xpEarned = correctCount * 10;
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
        <Text style={styles.resultTitle}>{t.flashcard.result_title}</Text>
        <Text style={styles.resultScore}>{pct}%</Text>
        <Text style={styles.resultSub}>{t.flashcard.result_correct(correctCount, cards.length)}</Text>
        <View style={{ width: "100%", marginVertical: 8 }}>
          <ProgressBar
            value={pct}
            color={pct >= 80 ? colors.success : pct >= 50 ? colors.warning : colors.danger}
            height={10}
          />
        </View>
        <View style={styles.resultBtns}>
          <TouchableOpacity style={styles.restartBtn} onPress={handleRestart}>
            <RotateCcw size={16} color={colors.white} />
            <Text style={styles.restartBtnText}>{t.common.restart}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
            <Text style={styles.doneBtnText}>{t.common.done}</Text>
          </TouchableOpacity>
        </View>
        {nextLesson && (
          <TouchableOpacity
            style={styles.nextLessonBtn}
            onPress={() => router.replace(`/flashcard/${nextLesson.id}`)}
          >
            <Text style={styles.nextLessonBtnText}>{t.common.next}: {nextLesson.name}</Text>
            <Text style={styles.nextLessonArrow}>→</Text>
          </TouchableOpacity>
        )}
        <AchievementPopup
          visible={showAchievement}
          type="flashcard_done"
          value={achievementValue}
          onClose={() => setShowAchievement(false)}
        />
      </View>
    );
  }

  const progress = (currentIndex / cards.length) * 100;
  const playAudio = () => {
    if (!card?.audio) return;
    try {
      audioPlayer.seekTo(0);
      audioPlayer.play();
    } catch {
      // ignore audio errors
    }
  };

  const frontInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });
  const backInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["180deg", "360deg"],
  });

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
          <X size={20} color={colors.black} />
        </TouchableOpacity>
        <Text style={styles.navCount}>
          {viewMode === "card"
            ? `${currentIndex + 1} / ${cards.length}`
            : `${cards.length} kartu`}
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={() =>
              setViewMode((m) => (m === "card" ? "table" : "card"))
            }
            style={styles.navBtn}
            accessibilityLabel="Ganti tampilan"
          >
            <Feather
              name={viewMode === "card" ? "list" : "credit-card"}
              size={18}
              color={colors.black}
            />
          </TouchableOpacity>
          {viewMode === "card" && (
            <TouchableOpacity onPress={handleBookmark} style={styles.navBtn}>
              <Feather
                name="bookmark"
                size={18}
                color={bookmarked ? "#F59E0B" : colors.textMuted}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => router.push(`/create-flashcard/${lessonId}`)}
            style={styles.navBtn}
          >
            <Plus size={20} color={colors.black} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress */}
      <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
        <ProgressBar value={progress} height={6} />
      </View>

      {/* Tag */}
      {viewMode === "table" ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.tableScroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.tableCard}>
            <View style={[styles.tableRow, styles.tableHeaderRow]}>
              <Text style={[styles.tableHeaderCell, styles.colNum]}>#</Text>
              <Text style={[styles.tableHeaderCell, styles.colQ]}>
                Pertanyaan
              </Text>
              <Text style={[styles.tableHeaderCell, styles.colA]}>
                Jawaban
              </Text>
            </View>
            {cards.map((c, i) => (
              <View
                key={c.id}
                style={[
                  styles.tableRow,
                  i % 2 === 1 && styles.tableRowAlt,
                  i === cards.length - 1 && styles.tableRowLast,
                ]}
              >
                <Text style={[styles.tableCell, styles.colNum, styles.cellNum]}>
                  {i + 1}
                </Text>
                <View style={styles.colQ}>
                  {c.image ? (
                    <Image
                      source={{ uri: c.image }}
                      style={styles.tableThumb}
                      resizeMode="cover"
                    />
                  ) : null}
                  <Text style={styles.tableCell}>{c.question}</Text>
                  {c.audio ? (
                    <View style={styles.tableMediaRow}>
                      <Volume2 size={12} color={colors.primary} />
                      <Text style={styles.tableMediaText}>audio</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.tableCell, styles.colA]}>{c.answer}</Text>
              </View>
            ))}
            {cards.length === 0 && (
              <View style={styles.tableEmpty}>
                <Text style={styles.tableEmptyText}>Belum ada kartu.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      ) : (
        <FlashcardCardView
          card={card}
          flipped={flipped}
          frontInterpolate={frontInterpolate}
          backInterpolate={backInterpolate}
          handleFlip={handleFlip}
          handleAnswer={handleAnswer}
          playAudio={playAudio}
          t={t}
        />
      )}
    </View>
  );
}

interface FlashcardCardViewProps {
  card: Flashcard;
  flipped: boolean;
  frontInterpolate: Animated.AnimatedInterpolation<string>;
  backInterpolate: Animated.AnimatedInterpolation<string>;
  handleFlip: () => void;
  handleAnswer: (correct: boolean) => void;
  playAudio: () => void;
  t: any;
}

function FlashcardCardView({
  card,
  flipped,
  frontInterpolate,
  backInterpolate,
  handleFlip,
  handleAnswer,
  playAudio,
  t,
}: FlashcardCardViewProps) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!card) return null;
  return (
    <>
      {card.tag ? <Text style={styles.cardTag}>{card.tag}</Text> : null}

      {/* Card */}
      <View style={styles.cardWrap}>
        <TouchableOpacity
          onPress={handleFlip}
          activeOpacity={0.9}
          style={styles.cardOuter}
        >
          {/* Front */}
          <Animated.View
            style={[
              styles.cardFace,
              styles.cardFront,
              { transform: [{ rotateY: frontInterpolate }] },
              { opacity: flipped ? 0 : 1 },
            ]}
          >
            {card.image && !flipped && (
              <Image
                source={{ uri: card.image }}
                style={styles.cardImage}
                resizeMode="cover"
              />
            )}
            <Text style={styles.cardHint}>Pertanyaan</Text>
            <Text style={styles.cardText}>{card.question}</Text>
            {card.audio && !flipped && (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  playAudio();
                }}
                style={styles.audioBtn}
                activeOpacity={0.85}
              >
                <Volume2 size={16} color={colors.primary} />
                <Text style={styles.audioBtnText}>Putar audio</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.tapHint}>{t.flashcard.card_hint}</Text>
          </Animated.View>

          {/* Back */}
          <Animated.View
            style={[
              styles.cardFace,
              styles.cardBack,
              { transform: [{ rotateY: backInterpolate }] },
              { opacity: flipped ? 1 : 0, position: "absolute", top: 0 },
            ]}
          >
            <Text style={styles.cardHint}>Jawaban</Text>
            <Text style={styles.cardText}>{card.answer}</Text>
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* Actions */}
      {flipped ? (
        <View style={styles.answerBtns}>
          <TouchableOpacity
            onPress={() => handleAnswer(false)}
            style={[styles.answerBtn, styles.wrongBtn]}
          >
            <X size={24} color={colors.danger} />
            <Text style={[styles.answerBtnText, { color: colors.danger }]}>{t.flashcard.btn_wrong}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleAnswer(true)}
            style={[styles.answerBtn, styles.correctBtn]}
          >
            <Check size={24} color={colors.success} />
            <Text style={[styles.answerBtnText, { color: colors.success }]}>{t.flashcard.btn_correct}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.flipHintWrap}>
          <Text style={styles.flipHintText}>{t.flashcard.card_hint}</Text>
        </View>
      )}
    </>
  );
}

const makeStyles = (c: ColorScheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
    backgroundColor: c.background,
  },
  emptyTitle: { fontSize: 22, fontWeight: "900", color: c.black },
  emptySub: { fontSize: 14, color: c.textMuted, textAlign: "center", fontWeight: "500" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: c.black,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 8,
  },
  addBtnText: { color: c.white, fontWeight: "800", fontSize: 14 },
  backLink: { marginTop: 8 },
  backLinkText: { color: c.primary, fontWeight: "700", fontSize: 14 },
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
    backgroundColor: c.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  navCount: { fontSize: 14, fontWeight: "800", color: c.textSecondary },
  cardTag: {
    fontSize: 11,
    fontWeight: "800",
    color: c.primary,
    textTransform: "uppercase",
    letterSpacing: 1,
    backgroundColor: c.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 10,
    alignSelf: "center",
  },
  cardWrap: {
    flex: 1,
    paddingHorizontal: 20,
  },
  cardOuter: {
    width: "100%",
    flex: 1,
  },
  cardFace: {
    width: "100%",
    height: "100%",
    borderRadius: 28,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backfaceVisibility: "hidden",
    overflow: "hidden",
  },
  cardFront: {
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.borderLight,
  },
  cardBack: {
    backgroundColor: c.primaryLight,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  cardImage: {
    width: "100%",
    height: 140,
    borderRadius: 16,
    marginBottom: 4,
  },
  cardHint: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: c.textMuted,
  },
  cardText: {
    fontSize: 20,
    fontWeight: "800",
    color: c.black,
    textAlign: "center",
    lineHeight: 28,
  },
  tapHint: { fontSize: 12, color: c.textMuted, fontWeight: "500" },
  audioBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginTop: 12,
  },
  audioBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: c.primary,
  },
  tableScroll: { paddingHorizontal: 16, paddingBottom: 28 },
  tableCard: {
    backgroundColor: c.white,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.border ?? "#E6ECF8",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border ?? "#E6ECF8",
  },
  tableRowAlt: { backgroundColor: "rgba(76,111,255,0.04)" },
  tableRowLast: { borderBottomWidth: 0 },
  tableHeaderRow: {
    backgroundColor: c.primaryLight,
    borderBottomWidth: 1,
    borderBottomColor: c.border ?? "#E6ECF8",
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: "800",
    color: c.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableCell: { fontSize: 13, color: c.text, lineHeight: 19 },
  cellNum: {
    fontWeight: "700",
    color: c.textMuted,
    fontVariant: ["tabular-nums"],
  },
  colNum: { width: 28 },
  colQ: { flex: 1.2, gap: 6 },
  colA: { flex: 1 },
  tableThumb: {
    width: "100%",
    height: 80,
    borderRadius: 8,
    backgroundColor: "#0001",
  },
  tableMediaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tableMediaText: {
    fontSize: 10,
    fontWeight: "700",
    color: c.primary,
    textTransform: "uppercase",
  },
  tableEmpty: { padding: 24, alignItems: "center" },
  tableEmptyText: { color: c.textMuted, fontSize: 13 },
  answerBtns: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 14,
    paddingTop: 16,
  },
  answerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 20,
    borderWidth: 2,
  },
  wrongBtn: { backgroundColor: c.dangerLight, borderColor: "#FCA5A5" },
  correctBtn: { backgroundColor: c.successLight, borderColor: "#86EFAC" },
  answerBtnText: { fontSize: 16, fontWeight: "800" },
  flipHintWrap: { paddingTop: 16, alignItems: "center" },
  flipHintText: { fontSize: 13, color: c.textMuted, fontWeight: "500" },
  resultWrap: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: c.background,
  },
  resultEmoji: { fontSize: 64 },
  resultTitle: { fontSize: 26, fontWeight: "900", color: c.black },
  resultScore: { fontSize: 64, fontWeight: "900", color: c.black },
  resultSub: { fontSize: 16, color: c.textMuted, fontWeight: "600" },
  resultBtns: { flexDirection: "row", gap: 12, marginTop: 16, width: "100%" },
  restartBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: c.black,
    paddingVertical: 16,
    borderRadius: 18,
  },
  restartBtnText: { color: c.white, fontWeight: "800", fontSize: 15 },
  doneBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surface,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: c.border,
  },
  doneBtnText: { color: c.black, fontWeight: "800", fontSize: 15 },
  nextLessonBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: c.primaryLight,
    borderWidth: 1.5,
    borderColor: c.primary,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 20,
    width: "100%",
    marginTop: 4,
  },
  nextLessonBtnText: { color: c.primary, fontWeight: "800", fontSize: 14, flex: 1 },
  nextLessonArrow: { color: c.primary, fontWeight: "900", fontSize: 18 },
  xpBadge: {
    position: "absolute",
    top: Platform.OS === "web" ? 80 : 90,
    alignSelf: "center",
    backgroundColor: c.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    zIndex: 100,
    shadowColor: c.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  xpText: { fontSize: 18, fontWeight: "900", color: "#fff" },
});
