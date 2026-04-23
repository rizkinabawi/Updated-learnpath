import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  Easing,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/contexts/ThemeContext";

const WORK_DURATION = 25 * 60;
const BREAK_DURATION = 5 * 60;
const LONG_BREAK = 15 * 60;

type Phase = "work" | "break" | "long-break";

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const PHASE_CONFIG = {
  work: { label: "Fokus Belajar", emoji: "🎯", grad: ["#4C6FFF", "#7C47FF"] as [string, string] },
  break: { label: "Istirahat Sebentar", emoji: "☕", grad: ["#10B981", "#059669"] as [string, string] },
  "long-break": { label: "Istirahat Panjang", emoji: "🌴", grad: ["#38BDF8", "#0EA5E9"] as [string, string] },
};

export default function PomodoroScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const C = useColors();

  const [phase, setPhase] = useState<Phase>("work");
  const [timeLeft, setTimeLeft] = useState(WORK_DURATION);
  const [running, setRunning] = useState(false);
  const [session, setSession] = useState(0);
  const [totalWork, setTotalWork] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringAnim = useRef(new Animated.Value(0)).current;

  const maxTime = phase === "work" ? WORK_DURATION : phase === "break" ? BREAK_DURATION : LONG_BREAK;
  const progress = 1 - timeLeft / maxTime;
  const cfg = PHASE_CONFIG[phase];

  const ringLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (running) {
      ringLoop.current = Animated.loop(
        Animated.timing(ringAnim, { toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: true })
      );
      ringLoop.current.start();
    } else {
      ringLoop.current?.stop();
      ringAnim.setValue(0);
    }
    return () => { ringLoop.current?.stop(); };
  }, [running]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(intervalRef.current!);
          setRunning(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          handlePhaseComplete();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current!);
  }, [running, phase]);

  const handlePhaseComplete = () => {
    if (phase === "work") {
      const newSession = session + 1;
      setSession(newSession);
      setTotalWork((w) => w + WORK_DURATION);
      if (newSession % 4 === 0) {
        Alert.alert("🌴 Waktunya Istirahat Panjang!", "Kamu sudah selesai 4 sesi. Istirahat 15 menit!", [
          { text: "Mulai Istirahat", onPress: () => startPhase("long-break") },
        ]);
      } else {
        Alert.alert("☕ Sesi Selesai!", "Istirahat 5 menit dulu ya!", [
          { text: "Mulai Istirahat", onPress: () => startPhase("break") },
        ]);
      }
    } else {
      Alert.alert("🎯 Istirahat Selesai!", "Siap belajar lagi?", [
        { text: "Mulai Fokus", onPress: () => startPhase("work") },
      ]);
    }
  };

  const startPhase = (p: Phase) => {
    setPhase(p);
    setTimeLeft(p === "work" ? WORK_DURATION : p === "break" ? BREAK_DURATION : LONG_BREAK);
    setRunning(false);
  };

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setRunning((r) => !r);
  };

  const reset = () => {
    setRunning(false);
    setTimeLeft(maxTime);
  };

  const circumference = 2 * Math.PI * 110;

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <LinearGradient
        colors={cfg.grad}
        style={[styles.header, { paddingTop: Platform.OS === "web" ? 56 : insets.top + 16 }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pomodoro Timer</Text>
        <View style={styles.sessionBadge}>
          <Text style={styles.sessionText}>Sesi {session + 1}</Text>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        {/* Phase pills */}
        <View style={styles.phaseRow}>
          {(["work", "break", "long-break"] as Phase[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.phasePill, phase === p && styles.phasePillActive]}
              onPress={() => !running && startPhase(p)}
              activeOpacity={0.75}
            >
              <Text style={[styles.phasePillText, phase === p && styles.phasePillTextActive]}>
                {p === "work" ? "Fokus" : p === "break" ? "Break" : "Long Break"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Ring */}
        <View style={styles.ringWrap}>
          <View style={styles.ringBg} />
          <View style={[styles.ringFill, { opacity: progress }]}>
            <LinearGradient colors={cfg.grad} style={StyleSheet.absoluteFillObject} />
          </View>
          <View style={styles.timerInner}>
            <Text style={styles.timerEmoji}>{cfg.emoji}</Text>
            <Text style={[styles.timerTime, { color: C.text }]}>{fmtTime(timeLeft)}</Text>
            <Text style={[styles.timerPhase, { color: C.textMuted }]}>{cfg.label}</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={[styles.progressTrack, { backgroundColor: C.border }]}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` as any, backgroundColor: cfg.grad[0] }]} />
        </View>
        <Text style={[styles.progressLabel, { color: C.textMuted }]}>
          {Math.round(progress * 100)}% selesai
        </Text>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity style={[styles.ctrlBtn, { backgroundColor: C.surface }]} onPress={reset}>
            <Feather name="rotate-ccw" size={20} color={C.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity onPress={toggle} activeOpacity={0.85}>
            <LinearGradient colors={cfg.grad} style={styles.playBtn}>
              <Feather name={running ? "pause" : "play"} size={28} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.ctrlBtn, { backgroundColor: C.surface }]} onPress={() => !running && startPhase(phase === "work" ? "break" : "work")}>
            <Feather name="skip-forward" size={20} color={C.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={[styles.statsRow, { backgroundColor: C.surface }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statVal, { color: C.primary }]}>{session}</Text>
            <Text style={[styles.statLabel, { color: C.textMuted }]}>Sesi Selesai</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: C.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statVal, { color: C.primary }]}>{Math.round(totalWork / 60)}</Text>
            <Text style={[styles.statLabel, { color: C.textMuted }]}>Menit Belajar</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: C.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statVal, { color: C.primary }]}>{Math.floor(session / 4)}</Text>
            <Text style={[styles.statLabel, { color: C.textMuted }]}>Siklus Penuh</Text>
          </View>
        </View>

        {/* Tips */}
        <View style={[styles.tipCard, { backgroundColor: C.surface }]}>
          <Feather name="info" size={14} color={C.textMuted} />
          <Text style={[styles.tipText, { color: C.textMuted }]}>
            {phase === "work"
              ? "Fokus penuh! Hindari distraksi HP dan medsos selama sesi belajar."
              : "Gunakan waktu ini untuk berdiri, stretching, atau minum air."}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    alignItems: "center",
    position: "relative",
  },
  backBtn: {
    position: "absolute",
    left: 20,
    top: Platform.OS === "web" ? 56 : 52,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#fff", marginBottom: 6 },
  sessionBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  sessionText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 24, alignItems: "center" },
  phaseRow: { flexDirection: "row", gap: 8, marginBottom: 32 },
  phasePill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#CBD5E0",
  },
  phasePillActive: { backgroundColor: "#4C6FFF", borderColor: "#4C6FFF" },
  phasePillText: { fontSize: 12, fontWeight: "700", color: "#99AAC3" },
  phasePillTextActive: { color: "#fff" },
  ringWrap: { width: 240, height: 240, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  ringBg: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 12,
    borderColor: "#E6ECF8",
  },
  ringFill: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    overflow: "hidden",
  },
  timerInner: { alignItems: "center", gap: 4 },
  timerEmoji: { fontSize: 36 },
  timerTime: { fontSize: 52, fontWeight: "900", letterSpacing: -2 },
  timerPhase: { fontSize: 13, fontWeight: "600", marginTop: 2 },
  progressTrack: { width: "100%", height: 6, borderRadius: 999, marginBottom: 6, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
  progressLabel: { fontSize: 12, fontWeight: "600", marginBottom: 32 },
  controls: { flexDirection: "row", alignItems: "center", gap: 20, marginBottom: 32 },
  ctrlBtn: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4C6FFF",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  statsRow: {
    flexDirection: "row",
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statItem: { flex: 1, alignItems: "center", gap: 4 },
  statVal: { fontSize: 22, fontWeight: "900" },
  statLabel: { fontSize: 11, fontWeight: "600", textAlign: "center" },
  statDivider: { width: 1, marginHorizontal: 8 },
  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    padding: 14,
    width: "100%",
  },
  tipText: { flex: 1, fontSize: 13, fontWeight: "500", lineHeight: 20 },
});
