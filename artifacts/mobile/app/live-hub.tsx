import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Platform,
  Linking,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors, useTheme } from "@/contexts/ThemeContext";
import { toast } from "@/components/Toast";
import { scheduleStudyReminder } from "@/utils/notifications";
import { shadow, shadowSm, type ColorScheme } from "@/constants/colors";
import { db } from "@/utils/firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";

const { width } = Dimensions.get("window");

interface LiveSession {
  id: string;
  title: string;
  teacher: string;
  avatar: string;
  time: string;
  date: string;
  level: string;
  type: "zoom" | "google_meet" | "live_stream" | "in_app";
  status: "live" | "upcoming" | "ended";
  description: string;
  link: string;
}

// Move MOCK_SESSIONS to a fallback or remove it. I'll keep it as a type reference and initial state.
const INITIAL_SESSIONS: LiveSession[] = [];

export default function LiveHubPage() {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>("All");

  // ── FETCH REALTIME SESSIONS ──
  useEffect(() => {
    const sessionsRef = collection(db, "live_sessions");
    const q = query(sessionsRef, orderBy("date", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LiveSession[];
      setSessions(data);
      setLoading(false);
    }, (error) => {
      console.warn("Firestore error in LiveHub:", error);
      setLoading(false);
      // If error (e.g. no internet or no collection), use empty or handle appropriately
    });

    return () => unsubscribe();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    // onSnapshot already keeps it fresh, but we can re-trigger if needed
    // In this case, just a visual delay for UX
    setTimeout(() => setRefreshing(false), 1000);
  };

  const filteredSessions = useMemo(() => {
    if (filter === "All") return sessions;
    return sessions.filter(s => s.level === filter);
  }, [filter, sessions]);

  const handleJoin = (link: string, title?: string, id?: string) => {
    if (link.startsWith("/live-room")) {
      router.push({
        pathname: "/live-room",
        params: { id, title }
      } as any);
      return;
    }
    Linking.openURL(link).catch(() => {
      toast.error("Gagal membuka tautan kelas.");
    });
  };

  const handleRemind = (session: LiveSession) => {
    toast.success(`Pengingat diset untuk ${session.title}`);
    // In a real app, we'd schedule a specific notification for this session time
    // scheduleLiveReminder(session);
  };

  const liveNow = sessions.find(s => s.status === "live");

  return (
    <View style={styles.container}>
      {/* ── TOP HEADER ── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Live Class Hub</Text>
          <Text style={styles.headerSub}>Belajar Interaktif dengan Sensei</Text>
        </View>
        <TouchableOpacity style={styles.headerIcon}>
          <Feather name="calendar" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* ── LIVE NOW CARD ── */}
        {liveNow && (
          <View style={styles.liveNowContainer}>
            <LinearGradient
              colors={[colors.primary, colors.purple]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.liveNowCard}
            >
              <View style={styles.liveBadgeRow}>
                <View style={styles.liveIndicator}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE SEKARANG</Text>
                </View>
                <View style={styles.viewerCount}>
                  <Feather name="users" size={12} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.viewerText}>128</Text>
                </View>
              </View>

              <Text style={styles.liveTitle}>{liveNow.title}</Text>
              
              <View style={styles.teacherRow}>
                <Image source={{ uri: liveNow.avatar }} style={styles.teacherAvatar} />
                <View>
                  <Text style={styles.teacherName}>{liveNow.teacher}</Text>
                  <Text style={styles.levelBadgeText}>{liveNow.level} Class</Text>
                </View>
              </View>

              <TouchableOpacity 
                style={styles.joinBtn} 
                onPress={() => handleJoin(liveNow.link, liveNow.title, liveNow.id)}
                activeOpacity={0.9}
              >
                <Text style={styles.joinBtnText}>
                  {liveNow.type === "in_app" ? "Masuk ke Live Room" : "Gabung Zoom Sekarang"}
                </Text>
                <Feather name={liveNow.type === "in_app" ? "play" : "arrow-right"} size={18} color={colors.primary} />
              </TouchableOpacity>
            </LinearGradient>
          </View>
        )}

        {/* ── FILTERS ── */}
        <View style={styles.filterSection}>
          <Text style={styles.sectionLabel}>Level Kursus</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {["All", "N5", "N4", "N3", "N2", "N1"].map((lvl) => (
              <TouchableOpacity
                key={lvl}
                style={[styles.filterChip, filter === lvl && { backgroundColor: colors.primary }]}
                onPress={() => setFilter(lvl)}
              >
                <Text style={[styles.filterChipText, filter === lvl && { color: "#fff" }]}>{lvl}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── UPCOMING LIST ── */}
        <View style={styles.upcomingSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Kelas Mendatang</Text>
            <TouchableOpacity>
              <Text style={styles.seeAll}>Lihat Semua</Text>
            </TouchableOpacity>
          </View>

          {filteredSessions.filter(s => s.status === "upcoming").map((item) => (
            <View key={item.id} style={[styles.sessionCard, shadowSm]}>
              <View style={styles.sessionDateBox}>
                <Text style={styles.dateDay}>{item.date.split(" ")[0]}</Text>
                <Text style={styles.dateMonth}>{item.date.split(" ")[1] || ""}</Text>
              </View>

              <View style={styles.sessionInfo}>
                <View style={styles.sessionHeaderRow}>
                  <View style={[styles.typeBadge, { backgroundColor: item.type === "zoom" ? "#2D8CFF20" : "#00AC4720" }]}>
                    <Text style={[styles.typeText, { color: item.type === "zoom" ? "#2D8CFF" : "#00AC47" }]}>
                      {item.type === "zoom" ? "Zoom" : "G-Meet"}
                    </Text>
                  </View>
                  <Text style={styles.sessionTime}>{item.time}</Text>
                </View>
                
                <Text style={styles.sessionTitleText}>{item.title}</Text>
                
                <View style={styles.sessionFooter}>
                  <View style={styles.teacherMini}>
                    <Image source={{ uri: item.avatar }} style={styles.avatarMini} />
                    <Text style={styles.teacherNameMini}>{item.teacher}</Text>
                  </View>
                  <TouchableOpacity style={styles.remindBtn} onPress={() => handleRemind(item)}>
                    <Feather name="bell" size={16} color={colors.primary} />
                    <Text style={styles.remindText}>Ingatkan</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* ── INFO BOX ── */}
        <View style={styles.infoBox}>
          <LinearGradient
            colors={[colors.teal + "15", colors.primary + "15"]}
            style={styles.infoBoxGrad}
          >
            <Feather name="info" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Butuh Bantuan?</Text>
              <Text style={styles.infoSub}>Pastikan aplikasi Zoom atau Google Meet sudah terinstal untuk pengalaman terbaik.</Text>
            </View>
          </LinearGradient>
        </View>

      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ColorScheme, isDark: boolean, palette: string) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: c.background,
    borderBottomWidth: 1,
    borderBottomColor: c.borderLight,
  },
  backBtn: { padding: 8, marginLeft: -8 },
  headerTitleWrap: { flex: 1, marginLeft: 10 },
  headerTitle: { fontSize: 20, fontWeight: "900", color: c.text },
  headerSub: { fontSize: 12, color: c.textMuted, fontWeight: "600" },
  headerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  
  scrollContent: { paddingBottom: 40 },
  
  liveNowContainer: { padding: 20 },
  liveNowCard: {
    borderRadius: 28,
    padding: 24,
    ...shadow,
  },
  liveBadgeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    gap: 6,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FF4B4B" },
  liveText: { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  viewerCount: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewerText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  
  liveTitle: { fontSize: 24, fontWeight: "900", color: "#fff", marginBottom: 20, lineHeight: 32 },
  
  teacherRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24 },
  teacherAvatar: { width: 48, height: 48, borderRadius: 16, borderWidth: 2, borderColor: "rgba(255,255,255,0.4)" },
  teacherName: { fontSize: 16, fontWeight: "800", color: "#fff" },
  levelBadgeText: { fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: "600" },
  
  joinBtn: {
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 18,
    gap: 10,
  },
  joinBtnText: { color: c.primary, fontWeight: "900", fontSize: 15 },

  filterSection: { marginTop: 10 },
  sectionLabel: { fontSize: 12, fontWeight: "800", color: c.textMuted, textTransform: "uppercase", letterSpacing: 1, marginLeft: 20, marginBottom: 12 },
  filterRow: { paddingHorizontal: 20, gap: 10 },
  filterChip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  filterChipText: { fontSize: 14, fontWeight: "700", color: c.textMuted },

  upcomingSection: { padding: 20, marginTop: 10 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: c.text },
  seeAll: { fontSize: 13, fontWeight: "700", color: c.primary },

  sessionCard: {
    flexDirection: "row",
    backgroundColor: c.surface,
    borderRadius: 22,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: c.border,
  },
  sessionDateBox: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: c.background,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.border,
  },
  dateDay: { fontSize: 18, fontWeight: "900", color: c.primary },
  dateMonth: { fontSize: 10, fontWeight: "800", color: c.textMuted, textTransform: "uppercase" },
  
  sessionInfo: { flex: 1, marginLeft: 16 },
  sessionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  typeText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  sessionTime: { fontSize: 12, color: c.textMuted, fontWeight: "700" },
  
  sessionTitleText: { fontSize: 15, fontWeight: "800", color: c.text, marginBottom: 12, lineHeight: 20 },
  
  sessionFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  teacherMini: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatarMini: { width: 24, height: 24, borderRadius: 8 },
  teacherNameMini: { fontSize: 13, fontWeight: "700", color: c.textSecondary },
  
  remindBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: c.primary + "10" },
  remindText: { fontSize: 12, fontWeight: "700", color: c.primary },

  infoBox: { padding: 20 },
  infoBoxGrad: { borderRadius: 20, padding: 16, flexDirection: "row", gap: 12, alignItems: "center" },
  infoTitle: { fontSize: 15, fontWeight: "800", color: c.text },
  infoSub: { fontSize: 12, color: c.textSecondary, lineHeight: 18, marginTop: 2 },
});
