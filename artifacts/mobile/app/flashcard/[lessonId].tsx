import { useColors, useTheme } from "@/contexts/ThemeContext";
import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  Image,
  ScrollView,
  FlatList,
  InteractionManager,
  Modal,
  TouchableWithoutFeedback,
  type ListRenderItem,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, Plus, RotateCcw, Check, Volume2 } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { speak, stop } from "@/utils/tts";
import { TTSConfigModal } from "@/components/TTSConfigModal";
import { Settings2 } from "lucide-react-native";
// NOTE: Do NOT call useAudioPlayer() at module scope with undefined/null as the
// initial source — on release builds the native AVPlayer (iOS) / MediaPlayer
// (Android) constructor throws immediately, causing an open-time crash that
// is invisible in JS. We lazy-create the player on first use instead.
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
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
  getSpacedRepData,
  type Flashcard,
  type Lesson,
  type SpacedRepData,
} from "@/utils/storage";
import { tokenizeJapanese, lookupWord, type DictEntry } from "@/utils/dictionary";
import { WordPopup } from "@/components/WordPopup";
import { Feather } from "@expo/vector-icons";
import { type ColorScheme } from "@/constants/colors";
import { ProgressBar } from "@/components/ProgressBar";
import { AchievementPopup } from "@/components/AchievementPopup";
import { useTranslation } from "@/contexts/LanguageContext";
import { resolveAssetUri, resolveAssetUris } from "@/utils/path-resolver";

// ─── Defensive coercion helpers ─────────────────────────────────────
// Anki-imported (or 3rd-party JSON-imported) flashcards can occasionally have
// fields that don't match the `Flashcard` TypeScript shape — e.g. a string
// where an array is expected, or a non-primitive where text is expected. The
// React renderer crashes hard on `<Text>{obj}</Text>` ("Objects are not valid
// as a React child") or on `arr.length` when arr is `null`. These helpers
// keep the player resilient to such malformed data instead of taking the
// whole screen down with a red box.
function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string" && item.length > 0) out.push(item);
  }
  return out;
}
function toText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // Objects/arrays — render a short, safe placeholder so the screen still
  // works rather than crashing the React tree.
  try { return String(v); } catch { return ""; }
}

// ─── Error boundary ─────────────────────────────────────────────────
// Last-resort safety net so any unexpected JS exception thrown during the
// flashcard render shows a recoverable fallback instead of red-boxing /
// reloading the entire app. The user can dismiss the card and go back.
interface CardErrorBoundaryProps {
  children: React.ReactNode;
  onReset?: () => void;
  styles: ReturnType<typeof makeStyles>;
  colors: ColorScheme;
}
interface CardErrorBoundaryState {
  error: Error | null;
}
class CardErrorBoundary extends React.Component<
  CardErrorBoundaryProps,
  CardErrorBoundaryState
> {
  state: CardErrorBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): CardErrorBoundaryState {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    if (typeof console !== "undefined") {
      console.warn("[flashcard] render error", error, info?.componentStack);
    }
  }
  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };
  render() {
    if (this.state.error) {
      const { styles, colors } = this.props;
      return (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Kartu ini bermasalah</Text>
          <Text
            style={[styles.emptySub, { color: colors.danger }]}
            numberOfLines={6}
          >
            {this.state.error.message || String(this.state.error)}
          </Text>
          <TouchableOpacity style={styles.addBtn} onPress={this.reset}>
            <RotateCcw size={16} color="#fff" />
            <Text style={styles.addBtnText}>Coba lagi</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function FlashcardScreen() {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);

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
  // Loading + error state so we can show a real message when reading
  // AsyncStorage fails (corrupt JSON, OOM on giant blobs, etc.) instead of
  // crashing the JS bundle silently.
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const startTime = useRef(Date.now());
  const xpAnim = useRef(new Animated.Value(0)).current;

  const [flipAnim] = useState(new Animated.Value(0));
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const [fullscreenImg, setFullscreenImg] = useState<string | null>(null);
  const [scriptRevealed, setScriptRevealed] = useState(false);

  // Dictionary Popup State
  const [activeWord, setActiveWord] = useState<DictEntry | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [showTTSConfig, setShowTTSConfig] = useState(false);

  const card = cards[currentIndex];

  // ── Imperative audio player (BUG FIX) ───────────────────────────────────
  // We completely removed useAudioPlayer() hook. On release builds, initializing
  // the hook with no source or a bad source can cause native side-effects
  // that lead to silent crashes. Instead, we manually manage a single
  // player instance via a ref and lazy-create it only when play is requested.
  const audioPlayerRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    // Defer the heavy AsyncStorage read until after the screen-open animation
    // finishes so the tap into the lesson feels snappy.
    const handle = InteractionManager.runAfterInteractions(async () => {
      try {
        if (cancelled) return;
        // Per-lesson sharding: only deserializes ONE lesson's cards (~1 MB max).
        const rawData = await getFlashcards(lessonId);

        // Sort by spaced repetition without loading the full SPACED_REP blob
        // on every open. `getSpacedRepData()` is already memoised in storage.ts;
        // we read it once here and sort in-memory (O(n log n), no extra I/O).
        const repData = await getSpacedRepData();
        const repMap = new Map<string, SpacedRepData>();
        for (const d of repData) repMap.set(d.cardId, d);
        const now = Date.now();
        const sorted = [...rawData].sort((a, b) => {
          const da = repMap.get(a.id);
          const db = repMap.get(b.id);
          const dueA = da ? new Date(da.nextReview).getTime() : 0;
          const dueB = db ? new Date(db.nextReview).getTime() : 0;
          return (dueA <= now ? 0 : dueA) - (dueB <= now ? 0 : dueB);
        });
        if (cancelled) return;
        setCards(sorted);
        if (lessonId?.startsWith("__sc__")) {
          const { getStandaloneCollections } = await import("@/utils/storage");
          const cols = await getStandaloneCollections();
          if (cancelled) return;
          const col = cols.find((c) => c.id === lessonId);
          if (col) setLessonName(col.name);
        } else {
          const lessons = await getLessons();
          if (cancelled) return;
          const lesson = lessons.find((l) => l.id === lessonId);
          if (lesson) setLessonName(lesson.name);
          const idx = lessons.findIndex((l) => l.id === lessonId);
          if (idx !== -1 && idx + 1 < lessons.length) {
            setNextLesson(lessons[idx + 1]);
          }
        }
      } catch (e) {
        // Surface the real reason — usually JSON.parse OOM or storage IO error
        // — to the user. Without this catch the whole React tree would crash.
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setLoadError(msg);
        if (typeof console !== "undefined") {
          console.warn("[flashcard] failed to load lesson", lessonId, e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      handle?.cancel?.();
    };
  }, [lessonId, reloadKey]);

  useEffect(() => {
    if (cards[currentIndex]) {
      isBookmarked(cards[currentIndex].id, "flashcard").then(setBookmarked);
      setScriptRevealed(false); // Reset reveal state on card change
    }
  }, [currentIndex, cards]);

  const speakText = useCallback(async (text: string) => {
    if (!text) return;
    try {
      await speak(text);
    } catch (e) {
      console.error("Critical TTS Error:", e);
    }
  }, []);

  useEffect(() => {
    if (currentIndex < cards.length) {
      const card = cards[currentIndex];
      if (viewMode === "card" && card.template === "listening") {
        const textToSpeak = card.ttsScript || card.question;
        // Delay slightly for smooth transition
        setTimeout(() => {
          speakText(textToSpeak);
        }, 600);
      }
    }
  }, [currentIndex, cards, viewMode, speakText]);

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

  const handleWordTap = useCallback((word: string) => {
    const entry = lookupWord(word);
    if (entry) {
      setActiveWord(entry);
      setShowPopup(true);
    }
  }, []);

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

  const progress = (currentIndex / cards.length) * 100;

  // Lazy audio playback helper — safe to call from any button press handler.
  // Uses the hook-created player but only activates it on first call to avoid
  // the native constructor crash described above.
  const playAudioUri = useCallback((uri?: string | null) => {
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
      console.warn("[flashcard] audio play failed", e);
    }
  }, []);

  const playPrimaryAudio = useCallback(() => playAudioUri(card?.audio), [card?.audio, playAudioUri]);

  // Cleanup player on unmount
  useEffect(() => {
    return () => {
      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.pause();
          try { (audioPlayerRef.current as any).remove?.(); } catch {}
        } catch {}
        audioPlayerRef.current = null;
      }
    };
  }, []);

  // Collect every image / audio for the current card, deduplicated and
  // separated by side. The legacy single-value fields (`image`, `audio`) are
  // promoted into the array form so old data keeps working.
  // We defensively coerce to a string[] so a malformed import (e.g. a JSON
  // file that put a single string into `images`, or `null` into `imagesBack`)
  // does not blow up the spread / `.length` calls below — that was the
  // open-time crash users saw on Anki-imported standalone collections.
  const frontImagesAll = useMemo(() => {
    if (!card) return [] as string[];
    const arr: string[] = [];
    const imgs = toStringArray(card.images);
    if (imgs.length > 0) arr.push(...imgs);
    else if (typeof card.image === "string" && card.image) arr.push(card.image);
    return Array.from(new Set(resolveAssetUris(arr)));
  }, [card]);
  const backImagesAll = useMemo(() => {
    if (!card) return [] as string[];
    return Array.from(new Set(resolveAssetUris(toStringArray(card.imagesBack))));
  }, [card]);
  const frontAudiosAll = useMemo(() => {
    if (!card) return [] as string[];
    const arr: string[] = [];
    const auds = toStringArray(card.audios);
    if (auds.length > 0) arr.push(...auds);
    else if (typeof card.audio === "string" && card.audio) arr.push(card.audio);
    return Array.from(new Set(resolveAssetUris(arr)));
  }, [card]);
  const backAudiosAll = useMemo(() => {
    if (!card) return [] as string[];
    return Array.from(new Set(resolveAssetUris(toStringArray(card.audiosBack))));
  }, [card]);

  const frontInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });
  const backInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["180deg", "360deg"],
  });

  // ── Final guard clauses ──────────────────────────────────────────────
  // Moved to the end of the hook section to satisfy the Rules of Hooks.
  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptySub}>Memuat kartu...</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Gagal memuat deck</Text>
        <Text style={[styles.emptySub, { color: colors.danger }]} numberOfLines={6}>
          {loadError}
        </Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setReloadKey((k) => k + 1)}>
          <RotateCcw size={16} color="#fff" />
          <Text style={styles.addBtnText}>Coba lagi</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>{t.common.back}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (cards.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>{t.flashcard.empty_title}</Text>
        <Text style={styles.emptySub}>{t.flashcard.empty_sub}</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push(`/create-flashcard/${lessonId}`)}
        >
          <Plus size={16} color="#fff" />
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
            <RotateCcw size={16} color="#fff" />
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
          <X size={20} color={colors.text} />
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
              color={colors.text}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowTTSConfig(true)} style={styles.navBtn}>
            <Settings2 size={18} color={colors.text} />
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
            <Plus size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress */}
      <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
        <ProgressBar value={progress} height={6} />
      </View>

      {/* Tag */}
      {viewMode === "table" ? (
        <CardErrorBoundary styles={styles} colors={colors}>
          <FlashcardTableList 
            cards={cards} 
            colors={colors} 
            styles={styles} 
            onImagePress={setFullscreenImg} 
            speakText={speakText}
          />
        </CardErrorBoundary>
      ) : (
        <CardErrorBoundary
          styles={styles}
          colors={colors}
          onReset={() => {
            // Skip the offending card on retry so the user can keep going.
            if (currentIndex < cards.length - 1) {
              setFlipped(false);
              flipAnim.setValue(0);
              setCurrentIndex((i) => i + 1);
            }
          }}
        >
          <FlashcardCardView
            card={card}
            flipped={flipped}
            frontInterpolate={frontInterpolate}
            backInterpolate={backInterpolate}
            handleFlip={handleFlip}
            handleAnswer={handleAnswer}
            playAudio={playPrimaryAudio}
            playAudioUri={playAudioUri}
            speakText={speakText}
            frontImages={frontImagesAll}
            backImages={backImagesAll}
            frontAudios={frontAudiosAll}
            backAudios={backAudiosAll}
            t={t}
            isListeningTemplate={card?.template === "listening"}
            scriptRevealed={scriptRevealed}
            onRevealScript={() => setScriptRevealed(true)}
            onWordTap={handleWordTap}
          />
        </CardErrorBoundary>
      )}

      <WordPopup 
        visible={showPopup}
        entry={activeWord}
        onClose={() => setShowPopup(false)}
      />

      {/* Image Modal */}
      <Modal visible={!!fullscreenImg} transparent animationType="fade" onRequestClose={() => setFullscreenImg(null)}>
        <TouchableWithoutFeedback onPress={() => setFullscreenImg(null)}>
          <View style={styles.modalBg}>
            <Image source={{ uri: fullscreenImg || "" }} style={styles.modalImg} resizeMode="contain" />
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setFullscreenImg(null)}>
              <X color="#fff" size={24} />
            </TouchableOpacity>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <TTSConfigModal 
        visible={showTTSConfig}
        onClose={() => setShowTTSConfig(false)}
      />
    </View>
  );
}

// ─── Virtualized table view ────────────────────────────────────────
// Replaces the previous ScrollView + cards.map() pattern that materialized
// every row at once and crashed on decks with thousands of cards. FlatList
// only mounts the visible window, so memory stays flat regardless of size.
interface FlashcardTableListProps {
  cards: Flashcard[];
  colors: ColorScheme;
  styles: ReturnType<typeof makeStyles>;
  onImagePress: (uri: string) => void;
  speakText: (text: string) => void;
}

function FlashcardTableList({ cards, colors, styles, onImagePress, speakText }: FlashcardTableListProps) {
  const renderItem = React.useCallback<ListRenderItem<Flashcard>>(
    ({ item: c, index: i }) => {
      const isAlt = i % 2 === 1;
      const isLast = i === cards.length - 1;
      const imgsArr = toStringArray(c.images);
      const frontImgs = resolveAssetUris(
        imgsArr.length > 0
          ? imgsArr
          : typeof c.image === "string" && c.image
            ? [c.image]
            : [],
      );
      const backImgs = resolveAssetUris(toStringArray(c.imagesBack));
      const audsArr = toStringArray(c.audios);
      const audCount = audsArr.length || (typeof c.audio === "string" && c.audio ? 1 : 0);
      const backAudCount = toStringArray(c.audiosBack).length;
      const qText = toText(c.question);
      const aText = toText(c.answer);

      const getTableFontSize = (text: string, hasMedia: boolean) => {
        const len = text.length;
        if (len <= 2) return hasMedia ? 36 : 52; // Massive for Kanji
        if (len < 8) return hasMedia ? 20 : 28;  // Large
        if (len < 20) return hasMedia ? 16 : 20; // Medium
        return 14;
      };

      const qFontSizeTable = getTableFontSize(qText, frontImgs.length > 0);
      const aFontSizeTable = getTableFontSize(aText, backImgs.length > 0);

      return (
        <View
          style={[
            styles.tableRow,
            isAlt && styles.tableRowAlt,
            isLast && styles.tableRowLast,
          ]}
        >
          <Text style={[styles.tableCell, styles.colNum, styles.cellNum]}>
            {i + 1}
          </Text>
          <View style={[styles.colQ, (frontImgs.length > 0 || backImgs.length > 0) && { flexDirection: "column" }]}>
            {(frontImgs.length > 0 || backImgs.length > 0) && (
              <View style={styles.tableThumbRow}>
                {/* Show front images first, then back images as context */}
                {[...frontImgs, ...backImgs].slice(0, 3).map((u, idx) => (
                  <TouchableOpacity key={`${u}-${idx}`} onPress={() => onImagePress(u)} activeOpacity={0.8}>
                    <Image source={{ uri: u }} style={styles.tableThumb} resizeMode="cover" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <ScrollView 
              style={{ maxHeight: 120 }} 
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              <Text style={[styles.tableCellQ, { fontSize: qFontSizeTable, lineHeight: Math.round(qFontSizeTable * 1.25) }]}>
                {qText}
              </Text>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center", marginTop: 6 }}>
                <TouchableOpacity onPress={() => speakText(c.ttsScript || qText)} style={styles.tableTtsBtn}>
                  <Volume2 size={12} color={colors.primary} />
                  <Text style={styles.tableTtsText}>TTS</Text>
                </TouchableOpacity>
                {(audCount > 0 || backAudCount > 0) && (
                  <View style={styles.tableMediaRow}>
                    <Feather name="music" size={10} color={colors.primary} />
                    <Text style={styles.tableMediaText}>
                      {(audCount + backAudCount) > 1 ? `${audCount + backAudCount} audio` : "audio"}
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
          <View style={styles.colA}>
            <ScrollView 
              style={{ maxHeight: 120 }} 
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              <Text style={[styles.tableCellA, { fontSize: aFontSizeTable, lineHeight: Math.round(aFontSizeTable * 1.25) }]}>
                {aText}
              </Text>
              <TouchableOpacity onPress={() => speakText(aText)} style={[styles.tableTtsBtn, { marginTop: 6, alignSelf: "flex-start" }]}>
                <Volume2 size={12} color={colors.primary} />
                <Text style={styles.tableTtsText}>TTS</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      );
    },
    [cards.length, colors.primary, styles],
  );

  const keyExtractor = React.useCallback((c: Flashcard) => c.id, []);

  return (
    <FlatList
      data={cards}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      contentContainerStyle={styles.tableScroll}
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      // Virtualization tuning — keep memory flat even with 10k+ cards.
      initialNumToRender={15}
      maxToRenderPerBatch={20}
      windowSize={7}
      updateCellsBatchingPeriod={50}
      removeClippedSubviews
      ListHeaderComponent={
        <View style={[styles.tableRow, styles.tableHeaderRow]}>
          <Text style={[styles.tableHeaderCell, styles.colNum]}>#</Text>
          <Text style={[styles.tableHeaderCell, styles.colQ]}>Pertanyaan</Text>
          <Text style={[styles.tableHeaderCell, styles.colA]}>Jawaban</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.tableEmpty}>
          <Text style={styles.tableEmptyText}>Belum ada kartu.</Text>
        </View>
      }
    />
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
  playAudioUri: (uri?: string | null) => void;
  speakText: (text: string) => void;
  frontImages: string[];
  backImages: string[];
  frontAudios: string[];
  backAudios: string[];
  t: any;
  isListeningTemplate?: boolean;
  scriptRevealed?: boolean;
  onRevealScript?: () => void;
  onWordTap: (word: string) => void;
}

function FlashcardCardView({
  card,
  flipped,
  frontInterpolate,
  backInterpolate,
  handleFlip,
  handleAnswer,
  playAudio,
  playAudioUri,
  speakText,
  frontImages,
  backImages,
  frontAudios,
  backAudios,
  t,
  isListeningTemplate,
  scriptRevealed,
  onRevealScript,
  onWordTap,
}: FlashcardCardViewProps) {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  if (!card) return null;

  const renderImageStrip = (uris: string[]) => {
    if (uris.length === 0) return null;
    if (uris.length === 1) {
      return (
        <Image
          source={{ uri: uris[0] }}
          style={styles.cardImage}
          resizeMode="cover"
        />
      );
    }
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cardImageRow}
      >
        {uris.map((u, idx) => (
          <Image
            key={`${u}-${idx}`}
            source={{ uri: u }}
            style={styles.cardImageMulti}
            resizeMode="cover"
          />
        ))}
      </ScrollView>
    );
  };

  const renderAudioButtons = (uris: string[]) => {
    if (uris.length === 0) return null;
    return (
      <View style={styles.audioRow}>
        {uris.map((u, idx) => (
          <TouchableOpacity
            key={`${u}-${idx}`}
            onPress={(e) => {
              e.stopPropagation();
              if (uris.length === 1 && idx === 0) playAudio();
              else playAudioUri(u);
            }}
            style={styles.audioBtn}
            activeOpacity={0.85}
          >
            <Volume2 size={16} color={colors.primary} />
            <Text style={styles.audioBtnText}>
              {uris.length > 1 ? `Audio ${idx + 1}` : "Putar audio"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const tagText = toText(card.tag);
  const questionText = toText(card.question);
  const answerText = toText(card.answer);

  const getDynamicFontSize = (text: string, hasMedia: boolean) => {
    const len = text.length;
    if (len < 15) return hasMedia ? 28 : 38;
    if (len < 35) return hasMedia ? 24 : 30;
    if (len < 70) return hasMedia ? 20 : 24;
    return 18;
  };

  const qFontSize = getDynamicFontSize(questionText, frontImages.length > 0 || frontAudios.length > 0);
  const aFontSize = getDynamicFontSize(answerText, backImages.length > 0 || backAudios.length > 0);

  return (
    <>
      {tagText ? <Text style={styles.cardTag}>{tagText}</Text> : null}

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
            <ScrollView
              contentContainerStyle={styles.cardScroll}
              showsVerticalScrollIndicator={false}
            >
              {!flipped && renderImageStrip(frontImages)}
              <Text style={styles.cardHint}>Pertanyaan</Text>
              
              {isListeningTemplate && !scriptRevealed ? (
                <TouchableOpacity 
                  onPress={(e) => { e.stopPropagation(); onRevealScript?.(); }} 
                  style={styles.revealBtn}
                >
                  <Feather name="eye" size={20} color={colors.primary} />
                  <Text style={styles.revealBtnText}>Lihat Script</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {tokenizeJapanese(questionText).map((token, i) => {
                    const entry = lookupWord(token);
                    return (
                      <Text 
                        key={i} 
                        style={[styles.cardText, { fontSize: qFontSize, lineHeight: Math.round(qFontSize * 1.35) }, entry && { color: colors.primary, textDecorationLine: 'underline', textDecorationColor: colors.primary + '40' }]}
                        onPress={entry ? () => onWordTap(token) : undefined}
                      >
                        {token}
                      </Text>
                    );
                  })}
                </View>
              )}

              <View style={styles.ttsRow}>
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); speakText(questionText); }} style={styles.ttsBtn}>
                  <Volume2 size={16} color={colors.primary} />
                  <Text style={styles.ttsText}>ULANGI</Text>
                </TouchableOpacity>
              </View>
              {!flipped && renderAudioButtons(frontAudios)}
              <Text style={styles.tapHint}>{t.flashcard.card_hint}</Text>
            </ScrollView>
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
            <ScrollView
              contentContainerStyle={styles.cardScroll}
              showsVerticalScrollIndicator={false}
            >
              {flipped && renderImageStrip(backImages)}
              <Text style={styles.cardHint}>Jawaban</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
                {tokenizeJapanese(answerText).map((token, i) => {
                  const entry = lookupWord(token);
                  return (
                    <Text 
                      key={i} 
                      style={[styles.cardText, { fontSize: aFontSize, lineHeight: Math.round(aFontSize * 1.35) }, entry && { color: colors.primary, textDecorationLine: 'underline', textDecorationColor: colors.primary + '40' }]}
                      onPress={entry ? () => onWordTap(token) : undefined}
                    >
                      {token}
                    </Text>
                  );
                })}
              </View>
              <View style={styles.ttsRow}>
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); speakText(answerText); }} style={styles.ttsBtn}>
                  <Volume2 size={16} color={colors.primary} />
                  <Text style={styles.ttsText}>TTS</Text>
                </TouchableOpacity>
              </View>
              {flipped && renderAudioButtons(backAudios)}
            </ScrollView>
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
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  cardBack: {
    backgroundColor: isDark ? "rgba(79, 70, 229, 0.15)" : c.primaryLight,
    borderWidth: 1,
    borderColor: isDark ? "rgba(79, 70, 229, 0.4)" : "#BFDBFE",
  },
  cardScroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 4,
  },
  cardImage: {
    width: "100%",
    height: 140,
    borderRadius: 16,
    marginBottom: 4,
  },
  cardImageRow: {
    gap: 8,
    paddingHorizontal: 4,
  },
  cardImageMulti: {
    width: 180,
    height: 140,
    borderRadius: 14,
  },
  audioRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginTop: 8,
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
    color: c.text,
    textAlign: "center",
    lineHeight: 28,
  },
  tapHint: { fontSize: 12, color: c.textMuted, fontWeight: "500" },
  audioBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: isDark ? "rgba(79, 70, 229, 0.2)" : c.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginTop: 12,
  },
  audioBtnText: {
    fontSize: 12,
    color: c.primary,
  },
  ttsRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 4,
    marginBottom: 10,
  },
  ttsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: isDark ? "rgba(79, 70, 229, 0.2)" : c.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  ttsText: { fontSize: 11, fontWeight: "800", color: c.primary },
  revealBtn: {
    backgroundColor: isDark ? "rgba(79, 70, 229, 0.1)" : c.primaryLight,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: c.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 10,
  },
  revealBtnText: { color: c.primary, fontWeight: "800", fontSize: 14 },
  tableScroll: { paddingHorizontal: 16, paddingBottom: 28 },
  tableCard: {
    backgroundColor: c.surface,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.border,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 14,
    maxHeight: 200,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  tableRowAlt: { backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(76,111,255,0.04)" },
  tableRowLast: { borderBottomWidth: 0 },
  tableHeaderRow: {
    backgroundColor: isDark ? "rgba(79, 70, 229, 0.15)" : c.primaryLight,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: "800",
    color: c.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableTtsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: isDark ? "rgba(79, 70, 229, 0.2)" : c.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tableTtsText: { fontSize: 10, fontWeight: "800", color: c.primary },
  tableCell: { fontSize: 13, color: c.text, lineHeight: 19 },
  tableCellQ: {
    fontSize: 16,
    fontWeight: "600",
    color: c.text,
    lineHeight: 24,
    flexShrink: 1,
    flexWrap: "wrap",
  },
  tableCellQLong: {
    fontSize: 14,
    lineHeight: 22,
  },
  tableCellA: {
    fontSize: 14,
    color: c.textSecondary,
    lineHeight: 21,
    flexShrink: 1,
    flexWrap: "wrap",
  },
  cellNum: {
    fontWeight: "700",
    color: c.textMuted,
    fontVariant: ["tabular-nums"],
  },
  colNum: { width: 32 },
  colQ: { flex: 1.8, gap: 10, minWidth: 0 },
  colA: { flex: 2.2, gap: 10, minWidth: 0 },
  tableThumb: {
    width: 80,
    height: 60,
    borderRadius: 8,
    backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
    borderWidth: 1,
    borderColor: c.border,
  },
  tableThumbCol: {
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tableThumbRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 6,
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalImg: { width: "90%", height: "80%" },
  modalCloseBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 20,
  },
  tableMediaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: isDark ? "rgba(79, 70, 229, 0.2)" : c.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginTop: 2,
  },
  tableMediaText: {
    fontSize: 11,
    fontWeight: "700",
    color: c.primary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
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
  wrongBtn: { 
    backgroundColor: isDark ? "rgba(239, 68, 68, 0.15)" : c.dangerLight, 
    borderColor: isDark ? "rgba(239, 68, 68, 0.4)" : "#FCA5A5" 
  },
  correctBtn: { 
    backgroundColor: isDark ? "rgba(34, 197, 94, 0.15)" : c.successLight, 
    borderColor: isDark ? "rgba(34, 197, 94, 0.4)" : "#86EFAC" 
  },
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
  doneBtnText: { color: c.textSecondary, fontWeight: "800", fontSize: 15 },
  nextLessonBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: isDark ? "rgba(79, 70, 229, 0.15)" : c.primaryLight,
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
