import { useColors, useTheme } from "@/contexts/ThemeContext";
import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  Image,
  Animated,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, ChevronRight, Check, Plus, RotateCcw, Volume2, Timer as TimerIcon, Sparkles, Settings2 } from "lucide-react-native";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { Feather } from "@expo/vector-icons";
import { speak, stop } from "@/utils/tts";
import { TTSConfigModal } from "@/components/TTSConfigModal";
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
  addXP,
  getNotes,
  type Quiz,
  type Lesson,
  type Note,
} from "@/utils/storage";
import { tokenizeJapanese, lookupWord, type DictEntry } from "@/utils/dictionary";
import { WordPopup } from "@/components/WordPopup";
import { type ColorScheme } from "@/constants/colors";
import { ProgressBar } from "@/components/ProgressBar";
import { AchievementPopup } from "@/components/AchievementPopup";
import { useTranslation } from "@/contexts/LanguageContext";
import { resolveAssetUri } from "@/utils/path-resolver";
import { getApiKeys } from "@/utils/ai-keys";
import { callAI } from "@/utils/ai-providers";
import { toast } from "@/components/Toast";

export default function QuizScreen() {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);

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
  const [showQText, setShowQText] = useState(false);
  const [examTime, setExamTime] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [showExamModal, setShowExamModal] = useState(false);
  const [examInput, setExamInput] = useState("10");
  const [activeWord, setActiveWord] = useState<DictEntry | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [showTTSConfig, setShowTTSConfig] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [showAIModal, setShowAIModal] = useState(false);
  const [userNotes, setUserNotes] = useState<Note[]>([]);
  const startTime = useRef(Date.now());
  const xpAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const data = await getQuizzes(lessonId);
      setQuizzes(data);

      if (lessonId && !lessonId.startsWith("__sc__")) {
        const { incrementCourseOpen } = await import("@/utils/storage");
        incrementCourseOpen(lessonId);
      }

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

      // Fetch notes globally for auto-linking
      getNotes().then(notes => {
        setUserNotes(notes);
      });
    })();
  }, [lessonId]);

  const currentQuiz = quizzes[currentIndex];
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const progress = (currentIndex / Math.max(quizzes.length, 1)) * 100;

  const playQuestionAudio = useCallback(() => {
    const uri = currentQuiz?.audio;
    if (!uri) return;
    const resolved = resolveAssetUri(uri);
    if (!resolved) return;

    try {
      if (!audioPlayerRef.current) {
        audioPlayerRef.current = createAudioPlayer(resolved);
      } else {
        audioPlayerRef.current.replace(resolved);
      }
      audioPlayerRef.current.play();
    } catch (e) {
      console.warn("[quiz] audio play failed", e);
    }
  }, [currentQuiz?.audio]);

  // Cleanup player on unmount
  useEffect(() => {
    return () => {
      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.pause();
          try { (audioPlayerRef.current as any).remove?.(); } catch { }
        } catch { }
        audioPlayerRef.current = null;
      }
    };
  }, []);

  const playTTS = useCallback(async (text: string) => {
    if (!text) return;
    try {
      await speak(text);
    } catch (e) {
      console.error("Critical TTS Error:", e);
    }
  }, []);

  useEffect(() => {
    if (currentIndex < quizzes.length && quizzes[currentIndex]) {
      const q = quizzes[currentIndex];
      isBookmarked(q.id, "quiz").then(setBookmarked);
      setShowQText(q.template !== "listening");

      if (q.template === "listening") {
        const timer = setTimeout(() => {
          if (!q.audio) {
            playTTS(q.ttsScript || q.question);
          } else {
            playQuestionAudio();
          }
        }, 600);
        return () => clearTimeout(timer);
      }
    }
    return () => {
      stop();
    };
  }, [currentIndex, quizzes, playTTS, playQuestionAudio]);

  useEffect(() => {
    if (examTime > 0 && !done) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            finishQuiz();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [examTime, done]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleBookmark = async () => {
    if (!quizzes[currentIndex]) return;
    const q = quizzes[currentIndex];
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    const added = await toggleBookmark({ type: "quiz", itemId: q.id, question: q.question, answer: q.answer, lessonId: lessonId ?? "", lessonName });
    setBookmarked(added);
  };

  const handleWordTap = (word: string) => {
    const entry = lookupWord(word);
    if (entry) {
      setActiveWord(entry);
      setShowPopup(true);
    }
  };

  const triggerXP = () => {
    xpAnim.setValue(0);
    Animated.timing(xpAnim, { toValue: 1, duration: 1200, useNativeDriver: true }).start();
  };

  const handleAIAssist = async (type: "hint" | "explain") => {
    if (aiLoading || !currentQuiz) return;
    setAiLoading(true);
    try {
      const keys = await getApiKeys();
      const key = keys.find(k => k.provider === "gemini") || keys[0];
      if (!key) {
        Alert.alert("API Key Dibutuhkan", "Harap pasang API Key di pengaturan untuk menggunakan asisten AI.");
        return;
      }

      const prompt = type === "hint" 
        ? `Berikan petunjuk (hint) kecil untuk soal kuis berikut tanpa membocorkan jawaban langsungnya.\nSoal: ${currentQuiz.question}\nPilihan: ${currentQuiz.options.join(", ")}`
        : `Jelaskan secara singkat kenapa jawaban "${currentQuiz.answer}" adalah jawaban yang benar untuk soal ini.\nSoal: ${currentQuiz.question}`;

      const { content } = await callAI(key.provider as any, prompt, key.apiKey, key.model);
      setAiResponse(content);
      setShowAIModal(true);
    } catch (e: any) {
      toast.error("Gagal memanggil AI.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleOptionSelect = async (idx: number) => {
    if (isAnswered) return;
    setSelectedOption(idx);
    setIsAnswered(true);

    const correct = currentQuiz.options[idx] === currentQuiz.answer;
    Haptics.impactAsync(correct ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
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
      totalAnswers: (stats.totalAnswers || 0) + 1,
      correctAnswers: (stats.correctAnswers || 0) + (correct ? 1 : 0),
    });

    await addXP(correct ? 10 : 2);
  };

  const handleNext = async () => {
    if (currentIndex < quizzes.length - 1) {
      setCurrentIndex((i) => i + 1);
      setSelectedOption(null);
      setIsAnswered(false);
      setShowQText(currentQuiz.template !== "listening");
    } else {
      finishQuiz();
    }
  };

  const finishQuiz = async () => {
    if (done) return;
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
    setTimeout(() => {
      setShowAchievement(true);
      triggerXP();
    }, 400);
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsAnswered(false);
    setScore(0);
    setDone(false);
    if (examTime > 0) setTimeLeft(examTime);
  };

  const startExam = () => {
    const mins = parseInt(examInput) || 10;
    const secs = mins * 60;
    setExamTime(secs);
    setTimeLeft(secs);
    setShowExamModal(false);
    handleRestart();
  };

  if (quizzes.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>{t.quiz.empty_title}</Text>
        <Text style={styles.emptySub}>{t.quiz.empty_sub}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push(`/create-quiz/${lessonId}`)}>
          <Plus size={16} color={colors.white} />
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
      <View style={[styles.resultWrap, { paddingTop: Platform.OS === "web" ? 80 : insets.top + 24 }]}>
        <Animated.View style={[styles.xpBadge, { opacity: xpOpacity, transform: [{ translateY: xpTranslateY }, { scale: xpScale }] }]}>
          <Text style={styles.xpText}>+{xpEarned} XP ⚡</Text>
        </Animated.View>
        <Text style={styles.resultEmoji}>{pct >= 80 ? "🎉" : pct >= 50 ? "👍" : "💪"}</Text>
        <Text style={styles.resultTitle}>{t.quiz.result_title}</Text>
        <Text style={styles.resultScore}>{pct}%</Text>
        <Text style={styles.resultSub}>{t.quiz.result_score(score, quizzes.length)}</Text>
        <View style={{ width: "100%", marginVertical: 8 }}>
          <ProgressBar value={pct} color={pct >= 80 ? colors.success : pct >= 50 ? colors.warning : colors.danger} height={10} />
        </View>
        <View style={styles.resultBtns}>
          <TouchableOpacity style={[styles.startBtn, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
            <Text style={styles.startBtnText}>Selesai</Text>
          </TouchableOpacity>
        </View>
        {nextLesson && (
          <TouchableOpacity style={styles.nextLessonBtn} onPress={() => router.replace(`/quiz/${nextLesson.id}`)}>
            <Text style={styles.nextLessonBtnText}>{t.common.next}: {nextLesson.name}</Text>
            <Text style={styles.nextLessonArrow}>→</Text>
          </TouchableOpacity>
        )}
        <AchievementPopup visible={showAchievement} type={achievementValue >= 100 ? "quiz_perfect" : "quiz_done"} value={achievementValue} onClose={() => setShowAchievement(false)} />
        <WordPopup visible={showPopup} entry={activeWord} onClose={() => setShowPopup(false)} />
        <AdBanner size="adaptiveBanner" style={{ marginTop: 16, width: "100%" }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 74 : insets.top + 12, paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 20 }]}>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navBtn}>
          <X size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.navCount}>{currentIndex + 1} / {quizzes.length}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity onPress={() => setShowExamModal(true)} style={styles.navBtn}>
            <TimerIcon size={18} color={examTime > 0 ? colors.primary : colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowTTSConfig(true)} style={styles.navBtn}>
            <Settings2 size={18} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleBookmark} style={styles.navBtn}>
            <Feather name="bookmark" size={18} color={bookmarked ? "#F59E0B" : colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleAIAssist(isAnswered ? "explain" : "hint")} style={[styles.navBtn, { backgroundColor: colors.primary + "15" }]}>
            {aiLoading ? <ActivityIndicator size="small" color={colors.primary} /> : <Sparkles size={18} color={colors.primary} />}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push(`/create-quiz/${lessonId}`)} style={styles.navBtn}>
            <Plus size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {examTime > 0 && (
        <View style={styles.examBar}>
          <Text style={[styles.timerText, timeLeft < 60 && { color: colors.danger }]}>⏱ {formatTime(timeLeft)}</Text>
          <Text style={styles.examLabel}>Mode Tryout</Text>
        </View>
      )}

      <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
        <ProgressBar value={progress} height={6} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={styles.questionCard}>
          <Text style={styles.questionLabel}>{t.quiz.question_label(currentIndex + 1)}</Text>
          {currentQuiz.image && (
            <Image source={{ uri: resolveAssetUri(currentQuiz.image) }} style={styles.questionImage} resizeMode="cover" />
          )}
          {currentQuiz.template === "listening" && !showQText && !isAnswered ? (
            <View style={styles.listeningPlaceholder}>
              <Volume2 size={40} color={colors.primary} />
              <Text style={styles.listeningHint}>Dengarkan soal audio</Text>
              <TouchableOpacity style={styles.peekBtn} onPress={() => setShowQText(true)}>
                <Text style={styles.peekBtnText}>Lihat Teks Soal</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.questionContainer}>
              <View style={styles.tokenRow}>
                {tokenizeJapanese(currentQuiz.question).map((token, i) => {
                  let entry = lookupWord(token);
                  // Also search in user notes
                  if (!entry) {
                    const note = userNotes.find(n => n.title.toLowerCase() === token.trim().toLowerCase());
                    if (note) {
                      entry = { word: note.title, reading: "Catatan Pribadi", meaning: note.content, level: "NOTE" };
                    }
                  }
                  return (
                    <Text
                      key={i}
                      style={[
                        styles.questionText, 
                        entry && { color: entry.level === "NOTE" ? colors.amber : colors.primary, textDecorationLine: 'underline', textDecorationColor: entry.level === "NOTE" ? colors.amber + '40' : colors.primary + '40' }
                      ]}
                      onPress={entry ? () => setActiveWord(entry) || setShowPopup(true) : undefined}
                    >
                      {token}
                    </Text>
                  );
                })}
              </View>
              {currentQuiz.questionTranslation && (
                <Text style={styles.questionTranslationText}>{currentQuiz.questionTranslation}</Text>
              )}
            </View>
          )}

          {currentQuiz.template === "listening" && (
            <TouchableOpacity
              onPress={() => playTTS(currentQuiz.ttsScript || currentQuiz.question)}
              style={styles.questionAudioBtn}
              activeOpacity={0.75}
            >
              <Volume2 size={16} color="#fff" />
              <Text style={styles.questionAudioText}>Putar Suara (TTS)</Text>
            </TouchableOpacity>
          )}

          {currentQuiz.audio && (
            <TouchableOpacity
              onPress={playQuestionAudio}
              style={[styles.questionAudioBtn, { backgroundColor: colors.teal, marginTop: currentQuiz.template === "listening" ? 8 : 12 }]}
              activeOpacity={0.75}
            >
              <Volume2 size={16} color="#fff" />
              <Text style={styles.questionAudioText}>Putar Audio File</Text>
            </TouchableOpacity>
          )}
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
                    showCorrect && { color: colors.success },
                    showWrong && { color: colors.danger },
                    isSelected && !isAnswered && { color: colors.text },
                  ]}
                >
                  {opt}
                </Text>
                {showCorrect && <Check size={18} color={colors.success} />}
                {showWrong && <X size={18} color={colors.danger} />}
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
            <ChevronRight size={20} color={colors.white} />
          </TouchableOpacity>
        )}
      </View>
      {/* Global Exam Modal */}
      <Modal visible={showExamModal} transparent animationType="slide" onRequestClose={() => setShowExamModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.examModal}>
            <View style={styles.modalHeader}>
              <TimerIcon size={24} color={colors.primary} />
              <Text style={styles.modalTitle}>Mode Tryout Ujian</Text>
            </View>
            <Text style={styles.modalDesc}>Atur timer untuk mensimulasikan ujian asli. Kuis akan otomatis selesai saat waktu habis.</Text>

            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>Durasi (Menit)</Text>
              <TextInput
                style={styles.timerInput}
                value={examInput}
                onChangeText={setExamInput}
                keyboardType="numeric"
                placeholder="Contoh: 30"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setExamTime(0); setShowExamModal(false); }}>
                <Text style={styles.cancelBtnText}>Nonaktifkan</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.startBtn} onPress={startExam}>
                <Text style={styles.startBtnText}>Mulai Ujian</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <WordPopup
        visible={showPopup}
        entry={activeWord}
        onClose={() => setShowPopup(false)}
      />

      <TTSConfigModal
        visible={showTTSConfig}
        onClose={() => setShowTTSConfig(false)}
      />

      <Modal visible={showAIModal} transparent animationType="fade" onRequestClose={() => setShowAIModal(false)}>
        <View style={styles.modalOverlay}>
           <View style={styles.aiModal}>
              <View style={styles.modalHeader}>
                 <Sparkles size={22} color={colors.primary} />
                 <Text style={styles.modalTitle}>Asisten AI</Text>
              </View>
              <ScrollView style={{ maxHeight: 300, marginVertical: 12 }}>
                 <Text style={styles.aiContent}>{aiResponse}</Text>
              </ScrollView>
              <TouchableOpacity style={[styles.startBtn, { marginTop: 10 }]} onPress={() => setShowAIModal(false)}>
                 <Text style={styles.startBtnText}>Paham</Text>
              </TouchableOpacity>
           </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (c: ColorScheme, isDark: boolean, palette: string) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
    backgroundColor: c.background,
  },
  emptyTitle: { fontSize: 22, fontWeight: "900", color: c.text },
  emptySub: { fontSize: 14, color: c.textMuted, textAlign: "center", fontWeight: "500" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: c.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 8,
  },
  addBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
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
  examBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: isDark ? "rgba(239, 68, 68, 0.1)" : "#FEF2F2",
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? "rgba(239, 68, 68, 0.2)" : "#FEE2E2",
  },
  timerText: { fontSize: 18, fontWeight: "900", color: c.text },
  examLabel: { fontSize: 12, fontWeight: "800", color: c.danger, textTransform: "uppercase" },
  questionCard: {
    backgroundColor: c.surface,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: c.border,
    gap: 10,
    overflow: "hidden",
  },
  questionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: c.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  questionImage: {
    width: "100%",
    height: 160,
    borderRadius: 16,
  },
  questionContainer: {
    width: "100%",
  },
  tokenRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  questionText: {
    fontSize: 19,
    fontWeight: "800",
    color: c.text,
    lineHeight: 28,
  },
  questionTranslationText: {
    fontSize: 14,
    color: c.textSecondary,
    marginTop: 8,
    fontStyle: "italic",
    lineHeight: 20,
  },
  questionAudioBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  questionAudioText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  listeningPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 30,
    gap: 12,
  },
  listeningHint: {
    fontSize: 14,
    color: c.textMuted,
    fontWeight: "600",
  },
  peekBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: c.background,
    borderWidth: 1.5,
    borderColor: c.border,
  },
  peekBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: c.textSecondary,
  },
  optionsWrap: { gap: 10 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.surface,
    borderRadius: 16,
    padding: 14,
    gap: 14,
    borderWidth: 2,
    borderColor: c.border,
  },
  optionSelected: { borderColor: c.primary, backgroundColor: c.background },
  optionCorrect: { borderColor: c.success, backgroundColor: isDark ? "rgba(34, 197, 94, 0.1)" : c.successLight },
  optionWrong: { borderColor: c.danger, backgroundColor: isDark ? "rgba(239, 68, 68, 0.1)" : c.dangerLight },
  optionBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: c.background,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: c.border,
  },
  badgeSelected: { backgroundColor: c.primary, borderColor: c.primary },
  badgeCorrect: { backgroundColor: c.success, borderColor: c.success },
  badgeWrong: { backgroundColor: c.danger, borderColor: c.danger },
  optionBadgeText: { fontSize: 13, fontWeight: "800", color: c.textSecondary },
  optionBadgeTextActive: { color: "#fff" },
  optionText: { flex: 1, fontSize: 15, fontWeight: "600", color: c.text },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: c.background,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: c.primary,
    paddingVertical: 18,
    borderRadius: 20,
  },
  nextBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  resultWrap: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: c.background,
  },
  resultEmoji: { fontSize: 64 },
  resultTitle: { fontSize: 26, fontWeight: "900", color: c.text },
  resultScore: { fontSize: 64, fontWeight: "900", color: c.text },
  resultSub: { fontSize: 16, color: c.textMuted, fontWeight: "600" },
  resultBtns: { flexDirection: "row", gap: 12, marginTop: 16, width: "100%" },
  restartBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: c.primary,
    paddingVertical: 16,
    borderRadius: 18,
  },
  restartBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
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
  doneBtnText: { color: c.text, fontWeight: "800", fontSize: 15 },
  nextLessonBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: c.primaryLight,
    borderWidth: 1.5, borderColor: c.primary,
    borderRadius: 18, paddingVertical: 14, paddingHorizontal: 20,
    width: "100%", marginTop: 4,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  examModal: {
    backgroundColor: c.surface,
    borderRadius: 28,
    padding: 24,
    gap: 16,
    borderWidth: 1,
    borderColor: c.border,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: "900", color: c.text },
  aiModal: { backgroundColor: c.surface, width: "85%", borderRadius: 24, padding: 20, borderWidth: 1, borderColor: c.border },
  aiContent: { fontSize: 15, color: c.textSecondary, lineHeight: 22, fontWeight: "500" },
  modalDesc: { fontSize: 14, color: c.textMuted, marginTop: 4, lineHeight: 20, fontWeight: "500" },
  inputWrap: { gap: 8 },
  inputLabel: { fontSize: 13, fontWeight: "700", color: c.textSecondary },
  timerInput: {
    backgroundColor: c.background,
    borderWidth: 1.5,
    borderColor: c.border,
    borderRadius: 14,
    padding: 14,
    fontSize: 18,
    fontWeight: "700",
    color: c.text,
  },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: c.border,
  },
  cancelBtnText: { fontWeight: "800", color: c.textMuted },
  startBtn: {
    flex: 2,
    paddingVertical: 16,
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: c.primary,
  },
  startBtnText: { fontWeight: "800", color: "#fff" },
});
