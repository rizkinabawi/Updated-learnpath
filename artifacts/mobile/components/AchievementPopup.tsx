import React, { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
} from "react-native";
import Colors from "@/constants/colors";

export type AchievementType =
  | "lesson_complete"
  | "quiz_perfect"
  | "quiz_done"
  | "flashcard_done"
  | "streak"
  | "first_lesson";

interface Props {
  visible: boolean;
  type: AchievementType;
  value?: number;
  onClose: () => void;
}

const CONFIGS: Record<AchievementType, { emoji: string; title: string; sub: (v?: number) => string; color: string; bg: string }> = {
  lesson_complete: {
    emoji: "🎉",
    title: "Pelajaran Selesai!",
    sub: () => "Luar biasa! Kamu berhasil menyelesaikan satu pelajaran hari ini.",
    color: Colors.primary,
    bg: Colors.primaryLight,
  },
  quiz_perfect: {
    emoji: "🏆",
    title: "Nilai Sempurna!",
    sub: (v) => `Selamat! Kamu menjawab semua soal dengan benar. Score: ${v ?? 100}%`,
    color: "#F59E0B",
    bg: "#FFF8EB",
  },
  quiz_done: {
    emoji: "✅",
    title: "Quiz Selesai!",
    sub: (v) => `Kerja bagus! Kamu meraih skor ${v ?? 0}%. Terus berlatih!`,
    color: Colors.teal,
    bg: Colors.tealLight,
  },
  flashcard_done: {
    emoji: "⚡",
    title: "Flashcard Tuntas!",
    sub: (v) => `Kamu sudah mengulas ${v ?? 0} kartu hari ini. Ingatan makin kuat!`,
    color: "#8B5CF6",
    bg: "#F3EFFF",
  },
  streak: {
    emoji: "🔥",
    title: "Streak Baru!",
    sub: (v) => `Luar biasa! Kamu sudah belajar ${v ?? 1} hari berturut-turut!`,
    color: "#EF4444",
    bg: "#FFF0F0",
  },
  first_lesson: {
    emoji: "🌟",
    title: "Awal yang Bagus!",
    sub: () => "Selamat atas pelajaran pertamamu! Perjalanan belajarmu dimulai hari ini.",
    color: Colors.primary,
    bg: Colors.primaryLight,
  },
};

const STARS = ["⭐", "✨", "🌟", "💫", "⭐", "✨"];

export function AchievementPopup({ visible, type, value, onClose }: Props) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const starAnims = useRef(STARS.map(() => ({
    opacity: new Animated.Value(0),
    translateY: new Animated.Value(0),
    translateX: new Animated.Value(0),
  }))).current;
  const bounceAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
      starAnims.forEach((a) => { a.opacity.setValue(0); a.translateY.setValue(0); a.translateX.setValue(0); });

      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 6, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        starAnims.forEach((a, i) => {
          const dir = (i % 2 === 0 ? 1 : -1);
          const xDist = (Math.random() * 80 + 30) * dir;
          Animated.parallel([
            Animated.timing(a.opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(a.translateY, { toValue: -(Math.random() * 60 + 40), duration: 600, useNativeDriver: true }),
            Animated.timing(a.translateX, { toValue: xDist, duration: 600, useNativeDriver: true }),
          ]).start(() => {
            Animated.timing(a.opacity, { toValue: 0, duration: 400, useNativeDriver: true }).start();
          });
        });

        Animated.sequence([
          Animated.timing(bounceAnim, { toValue: 1.15, duration: 120, useNativeDriver: true }),
          Animated.timing(bounceAnim, { toValue: 0.92, duration: 100, useNativeDriver: true }),
          Animated.timing(bounceAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
        ]).start();
      });
    }
  }, [visible]);

  const cfg = CONFIGS[type];
  const { width } = Dimensions.get("window");

  return (
    <Modal transparent visible={visible} onRequestClose={onClose} animationType="none">
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        </Animated.View>

        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }], opacity: opacityAnim, width: Math.min(width - 48, 340) }]}>
          {/* Stars burst */}
          <View style={styles.starsContainer} pointerEvents="none">
            {STARS.map((star, i) => (
              <Animated.Text
                key={i}
                style={[styles.star, {
                  opacity: starAnims[i].opacity,
                  transform: [
                    { translateY: starAnims[i].translateY },
                    { translateX: starAnims[i].translateX },
                  ],
                }]}
              >
                {star}
              </Animated.Text>
            ))}
          </View>

          {/* Top accent */}
          <View style={[styles.topAccent, { backgroundColor: cfg.color }]} />

          {/* Emoji */}
          <Animated.View style={[styles.emojiWrap, { backgroundColor: cfg.bg, transform: [{ scale: bounceAnim }] }]}>
            <Text style={styles.emoji}>{cfg.emoji}</Text>
          </Animated.View>

          <Text style={[styles.title, { color: cfg.color }]}>{cfg.title}</Text>
          <Text style={styles.sub}>{cfg.sub(value)}</Text>

          {/* Motivational strip */}
          <View style={[styles.strip, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.stripText, { color: cfg.color }]}>
              💪 Teruskan semangat belajarmu!
            </Text>
          </View>

          <TouchableOpacity style={[styles.btn, { backgroundColor: cfg.color }]} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.btnText}>Lanjut Belajar 🚀</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, justifyContent: "center", alignItems: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  card: {
    backgroundColor: Colors.white, borderRadius: 28,
    paddingBottom: 24, alignItems: "center",
    overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25, shadowRadius: 24, elevation: 20,
  },
  starsContainer: {
    position: "absolute", top: 60, left: 0, right: 0,
    alignItems: "center", zIndex: 10,
  },
  star: { position: "absolute", fontSize: 20 },
  topAccent: { width: "100%", height: 6 },
  emojiWrap: {
    width: 90, height: 90, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
    marginTop: 28, marginBottom: 16,
  },
  emoji: { fontSize: 44 },
  title: {
    fontSize: 22, fontWeight: "900", marginBottom: 8, textAlign: "center", paddingHorizontal: 24,
  },
  sub: {
    fontSize: 14, fontWeight: "500", color: Colors.textSecondary,
    textAlign: "center", lineHeight: 21, paddingHorizontal: 28, marginBottom: 16,
  },
  strip: {
    width: "100%", paddingVertical: 12, alignItems: "center", marginBottom: 20,
  },
  stripText: { fontSize: 13, fontWeight: "800" },
  btn: {
    marginHorizontal: 24, borderRadius: 16, paddingVertical: 15,
    alignItems: "center", width: "85%",
  },
  btnText: { fontSize: 15, fontWeight: "900", color: "#fff" },
});
