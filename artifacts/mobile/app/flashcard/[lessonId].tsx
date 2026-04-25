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
  FlatList,
  InteractionManager,
  type ListRenderItem,
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
            <RotateCcw size={16} color={colors.white} />
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

  const card = cards[currentIndex];
  // Single shared player whose source is swapped on demand. This lets the
  // same player handle multiple audios per card (front + back, plus extras
  // imported from Anki decks that have several [sound:...] tags).
  // NOTE: `undefined` (the documented default) plays nicer with expo-audio's
  // native AVPlayer/MediaPlayer constructor than a literal `null` source on
  // iOS/Android — passing null can throw inside `useReleasingSharedObject`
  // when the screen mounts on certain devices, which manifests as an open-
  // time crash on Anki-imported flashcard collections.
  const audioPlayer = useAudioPlayer(undefined);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    // Defer the heavy AsyncStorage read + JSON.parse + sortBySpacedRep until
    // after the screen-open animation finishes. Otherwise on a 1k-2k card
    // lesson the JS thread is blocked for ~1-2s and the tap into the lesson
    // feels frozen. This trades a tiny extra spinner frame for a snappy nav.
    const handle = InteractionManager.runAfterInteractions(async () => {
      try {
        if (cancelled) return;
        // The new per-lesson sharded storage means this only deserializes
        // ONE lesson's cards (≈1 MB max) instead of the entire collection.
        const rawData = await getFlashcards(lessonId);
        const sorted = await sortBySpacedRep(rawData);
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
          <RotateCcw size={16} color={colors.white} />
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
  const playAudioUri = (uri?: string | null) => {
    const resolved = resolveAssetUri(uri);
    if (!resolved || typeof resolved !== "string") return;
    try {
      // Swap source then play. expo-audio's `replace` accepts a URI string or
      // an AudioSource object — we use the OBJECT form `{ uri }` because the
      // native iOS/Android side normalizes it more reliably than a raw string
      // (the string-form sometimes fails silently for `file://` URIs that
      // contain extracted Anki media). Each native call is wrapped so a fault
      // on one method (e.g. seekTo on a not-yet-loaded source) does not bubble
      // up and tear down the React tree.
      try { (audioPlayer as any).replace?.({ uri: resolved }); } catch {}
      try { audioPlayer.seekTo(0); } catch {}
      try { audioPlayer.play(); } catch {}
    } catch {
      // ignore audio errors
    }
  };
  const playPrimaryAudio = () => playAudioUri(card?.audio);

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
        <CardErrorBoundary styles={styles} colors={colors}>
          <FlashcardTableList cards={cards} colors={colors} styles={styles} />
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
            frontImages={frontImagesAll}
            backImages={backImagesAll}
            frontAudios={frontAudiosAll}
            backAudios={backAudiosAll}
            t={t}
          />
        </CardErrorBoundary>
      )}
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
}

function FlashcardTableList({ cards, colors, styles }: FlashcardTableListProps) {
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
          <View style={styles.colQ}>
            {frontImgs.length > 0 && (
              <View style={styles.tableThumbRow}>
                {frontImgs.slice(0, 3).map((u, idx) => (
                  <Image
                    key={`${u}-${idx}`}
                    source={{ uri: u }}
                    style={styles.tableThumb}
                    resizeMode="contain"
                  />
                ))}
              </View>
            )}
            <Text
              style={[
                styles.tableCellQ,
                qText.length > 80 && styles.tableCellQLong,
              ]}
            >
              {qText}
            </Text>
            {audCount > 0 && (
              <View style={styles.tableMediaRow}>
                <Volume2 size={14} color={colors.primary} />
                <Text style={styles.tableMediaText}>
                  {audCount > 1 ? `${audCount} audio` : "audio"}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.colA}>
            {backImgs.length > 0 && (
              <View style={styles.tableThumbRow}>
                {backImgs.slice(0, 2).map((u, idx) => (
                  <Image
                    key={`${u}-${idx}`}
                    source={{ uri: u }}
                    style={styles.tableThumb}
                    resizeMode="contain"
                  />
                ))}
              </View>
            )}
            <Text style={styles.tableCellA}>{aText}</Text>
            {backAudCount > 0 && (
              <View style={styles.tableMediaRow}>
                <Volume2 size={14} color={colors.primary} />
                <Text style={styles.tableMediaText}>
                  {backAudCount > 1 ? `${backAudCount} audio` : "audio"}
                </Text>
              </View>
            )}
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
  frontImages: string[];
  backImages: string[];
  frontAudios: string[];
  backAudios: string[];
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
  playAudioUri,
  frontImages,
  backImages,
  frontAudios,
  backAudios,
  t,
}: FlashcardCardViewProps) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

  // Coerce the three text fields once so a malformed import (object/null in
  // place of a string) cannot crash the React render with "Objects are not
  // valid as a React child".
  const tagText = toText(card.tag);
  const questionText = toText(card.question);
  const answerText = toText(card.answer);

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
              <Text style={styles.cardText}>{questionText}</Text>
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
              <Text style={styles.cardText}>{answerText}</Text>
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
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 14,
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
  colNum: { width: 24 },
  colQ: { flex: 2.5, gap: 8, minWidth: 0 },
  colA: { flex: 1, minWidth: 0 },
  tableThumb: {
    width: "100%",
    aspectRatio: 16 / 10,
    borderRadius: 10,
    backgroundColor: "#0001",
    marginBottom: 4,
    flex: 1,
  },
  tableThumbRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 4,
  },
  tableMediaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: c.primaryLight,
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
