import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  X,
  Volume2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Flame,
  Award,
} from "lucide-react-native";
import { useCallback } from "react";
import { useColors, useTheme } from "@/contexts/ThemeContext";
import { 
  getDueCards, 
  updateSpacedRep, 
  addXP, 
  getNotes,
  getCourseDictionary,
  type Flashcard, 
  type SpacedRepData,
  type Note,
  type DictEntry
} from "@/utils/storage";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { resolveAssetUri } from "@/utils/path-resolver";
import { toast } from "@/components/Toast";
import { tokenizeJapanese, lookupWord, type DictEntry } from "@/utils/dictionary";
import { WordPopup } from "@/components/WordPopup";
import { ScrollView } from "react-native-gesture-handler";

const { width } = Dimensions.get("window");

export default function SRSReviewScreen() {
  const colors = useColors();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [cards, setCards] = useState<(Flashcard & { srs?: SpacedRepData })[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(false);
  const [sessionXP, setSessionXP] = useState(0);

  const flipAnim = useRef(new Animated.Value(0)).current;
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const [userNotes, setUserNotes] = useState<Note[]>([]);
  const [courseDict, setCourseDict] = useState<DictEntry[]>([]);
  const [activeWord, setActiveWord] = useState<DictEntry | null>(null);
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    loadCards();
    getNotes().then(notes => setUserNotes(notes));
    getCourseDictionary().then(dict => setCourseDict(dict));
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        try { (audioPlayerRef.current as any).remove?.(); } catch {}
        audioPlayerRef.current = null;
      }
    };
  }, []);

  const loadCards = async () => {
    setLoading(true);
    const due = await getDueCards();
    // Shuffle cards for variety
    setCards(due.sort(() => Math.random() - 0.5));
    setLoading(false);
  };

  const playAudio = useCallback((uri?: string) => {
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
      console.warn("Failed to play audio:", e);
    }
  }, []);

  const handleFlip = () => {
    Animated.spring(flipAnim, {
      toValue: showAnswer ? 0 : 1,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
    setShowAnswer(!showAnswer);
  };

  const handleRate = async (quality: number) => {
    const card = cards[currentIndex];
    await updateSpacedRep(card.id, quality);
    
    // XP Logic: 10 XP for Good/Easy, 5 XP for Hard, 2 XP for Again
    const xpGain = quality >= 4 ? 10 : quality >= 2 ? 5 : 2;
    const { levelUp } = await addXP(xpGain);
    setSessionXP(prev => prev + xpGain);

    if (levelUp) {
       toast.success("LEVEL UP! 🎊 Kamu semakin hebat!");
    }

    if (currentIndex < cards.length - 1) {
      // Reset for next card
      setShowAnswer(false);
      flipAnim.setValue(0);
      setCurrentIndex(prev => prev + 1);
    } else {
      setFinished(true);
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

  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0, 0],
  });
  const backOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (finished || cards.length === 0) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
           <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <X size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Selesai</Text>
        </View>
        
        <View style={styles.finishContent}>
          <View style={styles.awardIcon}>
            <Award size={80} color={colors.amber} />
          </View>
          <Text style={styles.finishTitle}>
            {cards.length === 0 ? "Tidak ada kartu hari ini!" : "Hebat! Review Selesai"}
          </Text>
          <Text style={styles.finishSub}>
            {cards.length === 0 
              ? "Semua kartu Anda sudah segar di ingatan." 
              : `Kamu telah meninjau ${cards.length} kartu dan mendapatkan ${sessionXP} XP.`}
          </Text>
          
          <TouchableOpacity style={styles.finishBtn} onPress={() => router.back()}>
            <Text style={styles.finishBtnText}>Kembali ke Dashboard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const currentCard = cards[currentIndex];
  const progress = (currentIndex + 1) / cards.length;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <X size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Review Harian</Text>
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
          </View>
        </View>
        <View style={styles.counter}>
          <Text style={styles.counterText}>{currentIndex + 1}/{cards.length}</Text>
        </View>
      </View>

      <View style={styles.cardArea}>
        <TouchableOpacity activeOpacity={1} onPress={handleFlip} style={styles.cardContainer}>
          <Animated.View style={[styles.flashcard, { transform: [{ rotateY: frontInterpolate }], opacity: frontOpacity }]}>
            <Text style={styles.sideLabel}>PERTANYAAN</Text>
            <ScrollView contentContainerStyle={styles.cardScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.cardContent}>
                <View style={styles.tokenRow}>
                  {tokenizeJapanese(currentCard.question).map((token, i) => {
                    let entry = lookupWord(token, courseDict);
                    return (
                      <Text 
                        key={i} 
                        style={[
                          styles.cardText, 
                          entry && { color: entry.level === "USER" ? colors.accent : colors.primary, textDecorationLine: 'underline', textDecorationColor: entry.level === "USER" ? colors.accent + '40' : colors.primary + '40' }
                        ]}
                        onPress={entry ? () => { setActiveWord(entry); setShowPopup(true); } : undefined}
                      >
                        {token}
                      </Text>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
            <View style={styles.hintContainer}>
               <HelpCircle size={16} color={colors.textMuted} />
               <Text style={styles.hintText}>Ketuk untuk lihat jawaban</Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.flashcard, styles.flashcardBack, { transform: [{ rotateY: backInterpolate }], opacity: backOpacity }]}>
            <Text style={[styles.sideLabel, { color: colors.primary }]}>JAWABAN</Text>
            <ScrollView contentContainerStyle={styles.cardScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.cardContent}>
                <View style={styles.tokenRow}>
                  {tokenizeJapanese(currentCard.answer).map((token, i) => {
                    let entry = lookupWord(token, courseDict);
                    return (
                      <Text 
                        key={i} 
                        style={[
                          styles.cardText, 
                          entry && { color: entry.level === "USER" ? colors.accent : colors.primary, textDecorationLine: 'underline', textDecorationColor: entry.level === "USER" ? colors.accent + '40' : colors.primary + '40' }
                        ]}
                        onPress={entry ? () => { setActiveWord(entry); setShowPopup(true); } : undefined}
                      >
                        {token}
                      </Text>
                    );
                  })}
                </View>
                {(currentCard.audio || currentCard.audios?.[0]) && (
                  <TouchableOpacity style={styles.audioBtn} onPress={() => playAudio(currentCard.audio || currentCard.audios?.[0])}>
                    <Volume2 size={24} color={colors.primary} />
                    <Text style={styles.audioBtnText}>Putar Audio</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </Animated.View>
        </TouchableOpacity>
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
        {showAnswer ? (
          <View style={styles.ratingRow}>
            <TouchableOpacity style={[styles.rateBtn, { backgroundColor: colors.danger }]} onPress={() => handleRate(1)}>
              <Text style={styles.rateBtnText}>Lagi</Text>
              <Text style={styles.rateBtnSub}>1m</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.rateBtn, { backgroundColor: colors.amber }]} onPress={() => handleRate(2)}>
              <Text style={styles.rateBtnText}>Sulit</Text>
              <Text style={styles.rateBtnSub}>1h</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.rateBtn, { backgroundColor: colors.success }]} onPress={() => handleRate(4)}>
              <Text style={styles.rateBtnText}>Baik</Text>
              <Text style={styles.rateBtnSub}>3h</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.rateBtn, { backgroundColor: colors.primary }]} onPress={() => handleRate(5)}>
              <Text style={styles.rateBtnText}>Mudah</Text>
              <Text style={styles.rateBtnSub}>4h</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.flipActionBtn} onPress={handleFlip}>
             <Text style={styles.flipActionText}>Tunjukkan Jawaban</Text>
          </TouchableOpacity>
        )}
      </View>

      <WordPopup 
        visible={showPopup}
        entry={activeWord}
        onClose={() => setShowPopup(false)}
      />
    </View>
  );
}

const makeStyles = (c: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: {
    backgroundColor: c.primary,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 16,
  },
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#fff" },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  progressContainer: { height: 4, width: "100%", backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 2, marginTop: 8, overflow: "hidden" },
  progressBar: { height: "100%", backgroundColor: "#fff" },
  counter: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.15)" },
  counterText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  cardArea: { flex: 1, padding: 20, justifyContent: "center" },
  cardContainer: { height: 400, width: "100%" },
  flashcard: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: c.card,
    borderRadius: 32,
    padding: 30,
    alignItems: "center",
    backfaceVisibility: "hidden",
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 5,
  },
  flashcardBack: { backgroundColor: isDark ? "#1e293b" : "#f8fafc" },
  sideLabel: { fontSize: 10, fontWeight: "900", color: c.textMuted, position: "absolute", top: 24, letterSpacing: 2 },
  cardContent: { alignItems: "center", paddingVertical: 10 },
  tokenRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  cardScroll: { flexGrow: 1, justifyContent: "center", paddingVertical: 10 },
  cardText: { fontSize: 24, fontWeight: "700", color: c.dark, textAlign: "center", lineHeight: 36 },
  hintContainer: { position: "absolute", bottom: 24, flexDirection: "row", alignItems: "center", gap: 6 },
  hintText: { fontSize: 12, color: c.textMuted, fontWeight: "600" },
  audioBtn: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 24, backgroundColor: c.primary + "15", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  audioBtnText: { fontSize: 14, fontWeight: "800", color: c.primary },
  bottomBar: { paddingHorizontal: 16, paddingVertical: 12 },
  flipActionBtn: { backgroundColor: c.primary, height: 60, borderRadius: 20, alignItems: "center", justifyContent: "center", shadowColor: c.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  flipActionText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  ratingRow: { flexDirection: "row", gap: 10 },
  rateBtn: { flex: 1, height: 70, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  rateBtnText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  rateBtnSub: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "700", marginTop: 2 },
  finishContent: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  awardIcon: { width: 140, height: 140, borderRadius: 70, backgroundColor: c.amber + "15", alignItems: "center", justifyContent: "center", marginBottom: 30 },
  finishTitle: { fontSize: 24, fontWeight: "900", color: c.dark, textAlign: "center" },
  finishSub: { fontSize: 15, color: c.textSecondary, textAlign: "center", marginTop: 12, lineHeight: 22 },
  finishBtn: { backgroundColor: c.primary, paddingHorizontal: 30, paddingVertical: 18, borderRadius: 20, marginTop: 40 },
  finishBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },
});
