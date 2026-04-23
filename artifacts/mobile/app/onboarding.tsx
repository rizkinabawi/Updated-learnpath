import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
  ScrollView,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { saveUser, getUser, generateId, type User } from "@/utils/storage";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "@/contexts/LanguageContext";
import * as MediaLibrary from "expo-media-library";

const { width } = Dimensions.get("window");

type Level = "beginner" | "intermediate" | "advanced";
const LEVELS: { val: Level; label: string; emoji: string }[] = [
  { val: "beginner", label: "Pemula", emoji: "🌱" },
  { val: "intermediate", label: "Menengah", emoji: "🚀" },
  { val: "advanced", label: "Lanjut", emoji: "⭐" },
];

// ── Tutorial slides (steps 0–3) ─────────────────────────────────────────────
const TUTORIAL_STEPS = [
  {
    key: "welcome",
    emoji: "👋",
    bg: "#EBF5FF",
    accent: Colors.primary,
    title: "Selamat Datang\ndi LearningPath!",
    sub: "Aplikasi belajar personal yang fleksibel. Ikuti tur singkat ini untuk memulai.",
    features: [],
  },
  {
    key: "paths",
    emoji: "🗂️",
    bg: "#FFF8EB",
    accent: "#F59E0B",
    title: "Kelola Materi\nBelajarmu",
    sub: "Buat Learning Path → tambah Module → bagi menjadi Lesson. Struktur rapih, belajar makin fokus.",
    features: [
      { icon: "folder" as const, text: "Buat Learning Path untuk setiap topik" },
      { icon: "layers" as const, text: "Bagi ke Module dan Lesson yang spesifik" },
      { icon: "book-open" as const, text: "Tambah catatan & materi belajar" },
    ],
  },
  {
    key: "study",
    emoji: "🃏",
    bg: "#F0FFF4",
    accent: "#10B981",
    title: "Flashcard & Quiz\nInteraktif",
    sub: "Perkuat hafalan dengan flashcard flip, uji pengetahuan dengan quiz pilihan ganda, dan review kesalahan.",
    features: [
      { icon: "credit-card" as const, text: "Flashcard dengan animasi flip" },
      { icon: "help-circle" as const, text: "Quiz pilihan ganda & skor real-time" },
      { icon: "target" as const, text: "Review Mistakes untuk belajar dari salah" },
    ],
  },
  {
    key: "ai",
    emoji: "🤖",
    bg: "#F5F3FF",
    accent: "#7C3AED",
    title: "AI Prompt\nGenerator",
    sub: "Generate soal flashcard & quiz otomatis! Salin prompt → tempel ke ChatGPT → import hasilnya langsung ke app.",
    features: [
      { icon: "cpu" as const, text: "Generate prompt untuk ChatGPT / Claude" },
      { icon: "download" as const, text: "Import JSON hasil AI langsung ke lesson" },
      { icon: "archive" as const, text: "Export & share dalam format JSON / ZIP" },
    ],
  },
];

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  // Total steps: 4 tutorial + 2 setup (name, goal)
  const TOTAL_STEPS = 6;
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<Level>("beginner");
  const [loading, setLoading] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    (async () => {
      const user = await getUser();
      if (user) router.replace("/(tabs)");
    })();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") {
      MediaLibrary.requestPermissionsAsync();
    }
  }, []);

  const animateTransition = (nextStep: number) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    setStep(nextStep);
  };

  const handleNext = async () => {
    if (step < 4) {
      animateTransition(step + 1);
      return;
    }
    if (step === 4) {
      if (!name.trim()) return;
      animateTransition(5);
      return;
    }
    // step === 5 — final submit
    if (!name.trim()) return;
    setLoading(true);
    const user: User = {
      id: generateId(),
      name: name.trim(),
      goal: goal.trim() || "Belajar hal baru",
      topic: topic.trim() || "Umum",
      level,
      createdAt: new Date().toISOString(),
    };
    await saveUser(user);
    router.replace("/(tabs)");
  };

  const handleSkip = () => {
    router.replace("/(tabs)");
  };

  const tutorialTitles = [
    t.onboarding.step_welcome_title,
    t.onboarding.step_paths_title,
    t.onboarding.step_study_title,
    t.onboarding.step_ai_title,
  ];
  const tutorialSubs = [
    t.onboarding.step_welcome_sub,
    t.onboarding.step_paths_sub,
    t.onboarding.step_study_sub,
    t.onboarding.step_ai_sub,
  ];

  const isTutorial = step < 4;
  const tutorialData = isTutorial ? TUTORIAL_STEPS[step] : null;
  const ctaLabel =
    step === 5 ? t.onboarding.btn_finish :
    step === 4 ? t.onboarding.btn_next :
    step === 3 ? t.onboarding.btn_finish : t.onboarding.btn_next;

  return (
    <View style={[styles.root, { paddingTop: Platform.OS === "web" ? 60 : insets.top }]}>
      {/* Skip button — only on tutorial steps */}
      {isTutorial && (
        <TouchableOpacity onPress={handleSkip} style={styles.skipBtn} activeOpacity={0.7}>
          <Text style={styles.skipText}>{t.onboarding.skip}</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, width: "100%", alignItems: "center" }}>

          {/* ── TUTORIAL SLIDES (step 0–3) ─────────────────────────── */}
          {isTutorial && tutorialData && (
            <>
              <View style={[styles.illustrationWrap, { backgroundColor: tutorialData.bg }]}>
                <Text style={styles.illustrationEmoji}>{tutorialData.emoji}</Text>
              </View>

              <Text style={styles.title}>{tutorialTitles[step]}</Text>
              <Text style={styles.sub}>{tutorialSubs[step]}</Text>

              {tutorialData.features.length > 0 && (
                <View style={styles.featureList}>
                  {tutorialData.features.map((f, i) => (
                    <View key={i} style={styles.featureRow}>
                      <View style={[styles.featureIconWrap, { backgroundColor: tutorialData.bg }]}>
                        <Feather name={f.icon} size={16} color={tutorialData.accent} />
                      </View>
                      <Text style={styles.featureText}>{f.text}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {/* ── SETUP: Name (step 4) ───────────────────────────────── */}
          {step === 4 && (
            <>
              <View style={[styles.illustrationWrap, { backgroundColor: "#FFF8EB" }]}>
                <Text style={styles.illustrationEmoji}>📝</Text>
              </View>
              <Text style={styles.title}>{t.onboarding.step_profile_title}</Text>
              <Text style={styles.sub}>{t.onboarding.step_profile_sub}</Text>
              <View style={styles.inputsWrap}>
                <TextInput
                  placeholder={t.onboarding.name_ph}
                  value={name}
                  onChangeText={setName}
                  style={styles.input}
                  placeholderTextColor={Colors.textMuted}
                  autoFocus
                  returnKeyType="next"
                />
              </View>
            </>
          )}

          {/* ── SETUP: Goal & Level (step 5) ──────────────────────── */}
          {step === 5 && (
            <>
              <View style={[styles.illustrationWrap, { backgroundColor: "#E0FAF8" }]}>
                <Text style={styles.illustrationEmoji}>🎯</Text>
              </View>
              <Text style={styles.title}>{t.onboarding.step_ai_title}</Text>
              <Text style={styles.sub}>{t.onboarding.step_ai_sub}</Text>
              <View style={styles.inputsWrap}>
                <TextInput
                  placeholder={t.onboarding.goal_ph}
                  value={goal}
                  onChangeText={setGoal}
                  style={styles.input}
                  placeholderTextColor={Colors.textMuted}
                />
                <TextInput
                  placeholder={t.onboarding.topic_ph}
                  value={topic}
                  onChangeText={setTopic}
                  style={styles.input}
                  placeholderTextColor={Colors.textMuted}
                />
                <Text style={styles.levelLabel}>{t.onboarding.level_label}</Text>
                <View style={styles.levelRow}>
                  {LEVELS.map((l) => (
                    <TouchableOpacity
                      key={l.val}
                      onPress={() => setLevel(l.val)}
                      style={[styles.levelChip, level === l.val && styles.levelChipActive]}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.levelEmoji}>{l.emoji}</Text>
                      <Text style={[styles.levelText, level === l.val && styles.levelTextActive]}>
                        {l.val === "beginner" ? t.onboarding.level_beginner : l.val === "intermediate" ? t.onboarding.level_intermediate : t.onboarding.level_advanced}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}

        </Animated.View>

        {/* ── CTA Button ─────────────────────────────────────────── */}
        <TouchableOpacity
          onPress={handleNext}
          style={[styles.ctaBtn, loading && styles.ctaBtnDisabled]}
          activeOpacity={0.85}
          disabled={loading}
        >
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </TouchableOpacity>

        {/* ── Dots ───────────────────────────────────────────────── */}
        <View style={styles.dots}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  skipBtn: {
    alignSelf: "flex-end",
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  skipText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.textMuted,
  },
  scrollContent: {
    paddingHorizontal: 28,
    alignItems: "center",
    paddingTop: 8,
    flexGrow: 1,
    justifyContent: "center",
  },
  illustrationWrap: {
    width: width * 0.55,
    height: width * 0.55,
    borderRadius: (width * 0.55) / 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  illustrationEmoji: { fontSize: 72 },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: Colors.dark,
    textAlign: "center",
    lineHeight: 36,
    marginBottom: 12,
  },
  sub: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    fontWeight: "500",
    paddingHorizontal: 4,
    marginBottom: 24,
  },
  featureList: {
    width: "100%",
    gap: 10,
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  featureIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark,
    lineHeight: 19,
  },
  inputsWrap: {
    width: "100%",
    gap: 12,
    marginBottom: 24,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 15,
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  levelLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 4,
  },
  levelRow: { flexDirection: "row", gap: 10 },
  levelChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    alignItems: "center",
    gap: 4,
  },
  levelChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  levelEmoji: { fontSize: 20 },
  levelText: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary },
  levelTextActive: { color: Colors.primaryDark },
  ctaBtn: {
    width: "100%",
    height: 56,
    backgroundColor: Colors.primary,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    marginTop: 8,
  },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaText: { fontSize: 16, fontWeight: "900", color: Colors.white },
  dots: { flexDirection: "row", gap: 7 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.border,
  },
  dotActive: {
    width: 22,
    backgroundColor: Colors.primary,
  },
});
