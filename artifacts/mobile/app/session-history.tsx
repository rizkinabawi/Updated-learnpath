import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { getSessionLogs, type SessionLog } from "@/utils/storage";
import { useColors } from "@/contexts/ThemeContext";

function fmtDuration(sec: number) {
  if (sec < 60) return `${sec}d`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}d` : `${m}m`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function groupByDate(logs: SessionLog[]): { date: string; items: SessionLog[] }[] {
  const map = new Map<string, SessionLog[]>();
  for (const log of logs) {
    const key = new Date(log.date).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(log);
  }
  return Array.from(map.entries()).map(([date, items]) => ({ date, items }));
}

export default function SessionHistory() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const C = useColors();
  const [logs, setLogs] = useState<SessionLog[]>([]);

  useFocusEffect(useCallback(() => {
    getSessionLogs().then(setLogs);
  }, []));

  const groups = groupByDate(logs);
  const totalSessions = logs.length;
  const totalMin = Math.round(logs.reduce((a, b) => a + b.durationSec, 0) / 60);
  const avgAcc = logs.length > 0
    ? Math.round(logs.reduce((a, b) => a + (b.correct / Math.max(b.total, 1)) * 100, 0) / logs.length)
    : 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <LinearGradient
        colors={["#4C6FFF", "#7C47FF"]}
        style={[styles.header, { paddingTop: Platform.OS === "web" ? 56 : insets.top + 16 }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Riwayat Sesi</Text>
        <View style={styles.summaryRow}>
          {[
            { val: totalSessions, label: "Sesi" },
            { val: `${totalMin}m`, label: "Durasi" },
            { val: `${avgAcc}%`, label: "Rata Akurasi" },
          ].map((s, i) => (
            <View key={i} style={[styles.summaryItem, i < 2 && styles.summaryBorder]}>
              <Text style={styles.summaryVal}>{s.val}</Text>
              <Text style={styles.summaryLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: Math.max(insets.bottom, 24) + 16 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {logs.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📋</Text>
            <Text style={[styles.emptyTitle, { color: C.text }]}>Belum Ada Riwayat</Text>
            <Text style={[styles.emptySub, { color: C.textMuted }]}>
              Mulai sesi belajar flashcard atau kuis untuk merekam riwayatmu.
            </Text>
          </View>
        ) : (
          groups.map(({ date, items }) => (
            <View key={date} style={styles.group}>
              <Text style={[styles.dateHeader, { color: C.textMuted }]}>
                {new Date(date).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
              </Text>
              {items.map((log) => {
                const acc = log.total > 0 ? Math.round((log.correct / log.total) * 100) : 0;
                const isFC = log.type === "flashcard";
                return (
                  <View key={log.id} style={[styles.logCard, { backgroundColor: C.surface }]}>
                    <View style={[styles.logIcon, { backgroundColor: isFC ? "#EEF0FF" : "#FFF8EB" }]}>
                      <Feather name={isFC ? "credit-card" : "help-circle"} size={16} color={isFC ? "#4C6FFF" : "#FF9500"} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.logLesson, { color: C.text }]} numberOfLines={1}>
                        {log.lessonName}
                      </Text>
                      <Text style={[styles.logMeta, { color: C.textMuted }]}>
                        {isFC ? "Flashcard" : "Kuis"} · {fmtTime(log.date)} · {fmtDuration(log.durationSec)}
                      </Text>
                    </View>
                    <View style={styles.logRight}>
                      <Text style={[styles.logAcc, { color: acc >= 70 ? "#10B981" : acc >= 40 ? "#FF9500" : "#EF4444" }]}>
                        {acc}%
                      </Text>
                      <Text style={[styles.logScore, { color: C.textMuted }]}>
                        {log.correct}/{log.total}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
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
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#fff", marginBottom: 16 },
  summaryRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 16,
    overflow: "hidden",
    width: "100%",
  },
  summaryItem: { flex: 1, alignItems: "center", paddingVertical: 12, gap: 2 },
  summaryBorder: { borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.2)" },
  summaryVal: { fontSize: 20, fontWeight: "900", color: "#fff" },
  summaryLabel: { fontSize: 10, color: "rgba(255,255,255,0.65)", fontWeight: "600", textTransform: "uppercase" },
  scroll: { padding: 16, gap: 4 },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: "800" },
  emptySub: { fontSize: 13, textAlign: "center", lineHeight: 20, paddingHorizontal: 32 },
  group: { marginBottom: 20 },
  dateHeader: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  logCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  logIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  logLesson: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  logMeta: { fontSize: 12, fontWeight: "500" },
  logRight: { alignItems: "flex-end" },
  logAcc: { fontSize: 16, fontWeight: "900" },
  logScore: { fontSize: 11, fontWeight: "600" },
});
