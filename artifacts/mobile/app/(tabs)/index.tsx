import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
  RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  getUser, getLearningPaths, getModules, getLessons, getStats, getWrongAnswers,
  type User, type LearningPath, type Module, type Lesson, type Stats,
} from "@/utils/storage";
import Colors, { shadow, shadowSm, CARD_GRADIENTS } from "@/constants/colors";
import { ProgressBar } from "@/components/ProgressBar";
import { AdBanner } from "@/components/AdBanner";
import { useTranslation } from "@/contexts/LanguageContext";

const { width } = Dimensions.get("window");

const QUOTES = [
  { text: "Belajar 20 menit sehari lebih efektif dari 2 jam seminggu sekali.", author: "Learning Science" },
  { text: "Kesuksesan adalah hasil dari persiapan, kerja keras, dan belajar dari kegagalan.", author: "Colin Powell" },
  { text: "Pendidikan adalah senjata paling ampuh yang bisa kamu gunakan untuk mengubah dunia.", author: "Nelson Mandela" },
  { text: "Investasi terbaik adalah investasi pada dirimu sendiri.", author: "Benjamin Franklin" },
  { text: "Setiap hari adalah kesempatan baru untuk menjadi lebih baik dari kemarin.", author: "Unknown" },
  { text: "Fokus pada prosesnya, bukan hanya hasilnya — kebiasaan baik membentuk kesuksesan.", author: "James Clear" },
  { text: "Kamu tidak harus luar biasa untuk memulai, tapi kamu harus memulai untuk menjadi luar biasa.", author: "Zig Ziglar" },
  { text: "Flashcard aktif meningkatkan retensi memori hingga 3x lipat dibanding membaca pasif.", author: "Learning Science" },
  { text: "Spaced repetition: belajar sedikit setiap hari jauh lebih kuat dari belajar banyak sekaligus.", author: "Hermann Ebbinghaus" },
  { text: "Otak yang berpikir aktif tumbuh lebih kuat — tanya, eksplorasi, coba.", author: "Neuroscience" },
  { text: "Kesalahan bukan tanda kegagalan — itu adalah bukti bahwa kamu mencoba sesuatu yang baru.", author: "Unknown" },
  { text: "Disiplin adalah jembatan antara tujuan dan pencapaian.", author: "Jim Rohn" },
];

const COURSE_ICONS: React.ComponentProps<typeof Feather>["name"][] = [
  "book", "code", "globe", "cpu", "layers", "award",
];


export default function Dashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [paths, setPaths] = useState<LearningPath[]>([]);
  const [allModules, setAllModules] = useState<Module[]>([]);
  const [allLessons, setAllLessons] = useState<Lesson[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [wrongCount, setWrongCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const [u, p, mods, lessons, s, w] = await Promise.all([
      getUser(), getLearningPaths(), getModules(), getLessons(), getStats(), getWrongAnswers(),
    ]);
    if (!u) { router.replace("/onboarding"); return; }
    setUser(u); setPaths(p); setAllModules(mods); setAllLessons(lessons); setStats(s); setWrongCount(w.length);
  };

  useFocusEffect(useCallback(() => { load(); }, []));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const accuracy = stats && stats.totalAnswers > 0
    ? Math.round((stats.correctAnswers / stats.totalAnswers) * 100) : 0;

  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 12 ? t.home.greeting_morning : hour < 17 ? t.home.greeting_afternoon : t.home.greeting_evening;
  const firstName = user?.name?.split(" ")[0] ?? "Learner";
  const dateStr = t.home.date_format(t.home.days[now.getDay()], now.getDate(), t.home.months[now.getMonth()]);
  const todayQuote = QUOTES[(now.getDate() + now.getMonth() * 3) % QUOTES.length];

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* ═══ HEADER ═══ */}
        <LinearGradient
          colors={["#4C6FFF", "#7C47FF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: Platform.OS === "web" ? 56 : insets.top + 20 }]}
        >
          <View style={styles.blob1} />
          <View style={styles.blob2} />

          {/* Top row */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dateText}>{dateStr}</Text>
              <Text style={styles.greetText}>{greet},</Text>
              <Text style={styles.nameText}>{firstName} 👋</Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => router.push("/search" as any)}
              >
                <Feather name="search" size={18} color="#fff" />
              </TouchableOpacity>
              {wrongCount > 0 && (
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => router.push("/mistakes-review" as any)}
                >
                  <Feather name="bell" size={18} color="#fff" />
                  <View style={styles.bellDot} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => router.push("/(tabs)/profile")}
                style={styles.avatar}
              >
                <Text style={styles.avatarText}>{firstName.charAt(0).toUpperCase()}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Stats strip */}
          <View style={styles.statsRow}>
            {[
              { icon: "activity" as const, val: `${stats?.streak ?? 0}`, label: t.home.streak },
              { icon: "check-circle" as const, val: `${accuracy}%`, label: t.home.accuracy },
              { icon: "message-square" as const, val: `${stats?.totalAnswers ?? 0}`, label: t.home.answers },
              { icon: "book" as const, val: `${paths.length}`, label: t.home.courses },
            ].map((s, i) => (
              <View key={i} style={[styles.statItem, i < 3 && styles.statItemBorder]}>
                <Feather name={s.icon} size={16} color="rgba(255,255,255,0.75)" />
                <Text style={styles.statVal}>{s.val}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Quote strip */}
          <View style={styles.tipStrip}>
            <Feather name="zap" size={12} color="rgba(255,255,255,0.7)" />
            <View style={{ flex: 1 }}>
              <Text style={styles.tipText} numberOfLines={2}>"{todayQuote.text}"</Text>
              <Text style={[styles.tipText, { fontSize: 10, opacity: 0.6, marginTop: 2 }]}>— {todayQuote.author}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ═══ LANJUTKAN BELAJAR ═══ */}
        {paths.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{t.home.section_continue}</Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/learn")} style={styles.seeAllBtn}>
                <Text style={styles.seeAllText}>{t.home.see_all}</Text>
                <Feather name="chevron-right" size={13} color={Colors.primary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.push("/(tabs)/learn")}
              style={[styles.continueCard, shadow]}
            >
              <LinearGradient
                colors={CARD_GRADIENTS[0]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.continueGrad}
              >
                <View style={styles.blob1} />
                <View style={styles.blob2} />
                <View style={styles.continueTop}>
                  <View style={styles.continuePill}>
                    <Feather name="play" size={10} color="#fff" />
                    <Text style={styles.continuePillText}>Lanjutkan</Text>
                  </View>
                  <View style={styles.continueArrow}>
                    <Feather name="arrow-right" size={15} color="#fff" />
                  </View>
                </View>
                <Text style={styles.continueName} numberOfLines={2}>{paths[0].name}</Text>
                <Text style={styles.continueSub} numberOfLines={1}>
                  {paths[0].description || user?.topic || "Kursus aktif"}
                </Text>
                <View style={styles.continueFooter}>
                  <View style={styles.continueBar}>
                    <View style={[styles.continueBarFill, { width: `${Math.min(accuracy, 100)}%` }]} />
                  </View>
                  <Text style={styles.continueBarLabel}>{accuracy}% selesai</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* ═══ REVIEW SALAH ═══ */}
        {wrongCount > 0 && (
          <View style={styles.sectionFlat}>
            <TouchableOpacity
              onPress={() => router.push("/mistakes-review" as any)}
              activeOpacity={0.85}
              style={[styles.alertCard, shadow]}
            >
              <View style={styles.alertIcon}>
                <Feather name="alert-circle" size={18} color={Colors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle}>{wrongCount} soal perlu direview</Text>
                <Text style={styles.alertSub}>Perkuat pemahaman sebelum lanjut</Text>
              </View>
              <View style={styles.alertPill}>
                <Text style={styles.alertPillText}>Review</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* ═══ KOLEKSI KURSUS ═══ */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Koleksi Kursus</Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/learn")} style={styles.seeAllBtn}>
              <Text style={styles.seeAllText}>+ Tambah</Text>
            </TouchableOpacity>
          </View>

          {paths.length > 0 ? (
            <View style={styles.courseList}>
              {paths.slice(0, 4).map((path, i) => {
                const pathMods = allModules.filter((m) => m.pathId === path.id);
                const modIds = new Set(pathMods.map((m) => m.id));
                const pathLessons = allLessons.filter((l) => modIds.has(l.moduleId));
                const grad = CARD_GRADIENTS[i % CARD_GRADIENTS.length];
                const icon = COURSE_ICONS[i % COURSE_ICONS.length];
                return (
                  <TouchableOpacity
                    key={path.id}
                    activeOpacity={0.88}
                    onPress={() => router.push("/(tabs)/learn")}
                    style={[styles.courseCard, shadowSm]}
                  >
                    {/* Left gradient icon panel */}
                    <LinearGradient colors={grad} style={styles.courseCardGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                      <Feather name={icon} size={24} color="#fff" />
                    </LinearGradient>

                    {/* Content */}
                    <View style={styles.courseCardBody}>
                      <Text style={styles.courseName} numberOfLines={1}>{path.name}</Text>
                      {!!path.description && (
                        <Text style={styles.courseSub} numberOfLines={1}>{path.description}</Text>
                      )}
                      {/* Stats row */}
                      <View style={styles.courseStatRow}>
                        <View style={styles.courseStatChip}>
                          <Feather name="layers" size={10} color={grad[0]} />
                          <Text style={[styles.courseStatText, { color: grad[0] }]}>{pathMods.length} modul</Text>
                        </View>
                        <View style={styles.courseStatChip}>
                          <Feather name="book-open" size={10} color={grad[0]} />
                          <Text style={[styles.courseStatText, { color: grad[0] }]}>{pathLessons.length} pelajaran</Text>
                        </View>
                      </View>
                    </View>

                    {/* Right arrow */}
                    <View style={styles.courseCardArrow}>
                      <LinearGradient colors={grad} style={styles.courseArrowCircle} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                        <Feather name="chevron-right" size={14} color="#fff" />
                      </LinearGradient>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* Show more link if more than 4 paths */}
              {paths.length > 4 && (
                <TouchableOpacity
                  onPress={() => router.push("/(tabs)/learn")}
                  style={styles.courseShowMore}
                  activeOpacity={0.8}
                >
                  <Text style={styles.courseShowMoreText}>Lihat {paths.length - 4} kursus lainnya</Text>
                  <Feather name="chevron-right" size={13} color={Colors.primary} />
                </TouchableOpacity>
              )}

              {/* Add new course button */}
              <TouchableOpacity
                onPress={() => router.push("/(tabs)/learn")}
                style={[styles.courseCardAdd, shadowSm]}
                activeOpacity={0.8}
              >
                <View style={styles.courseAddIcon}>
                  <Feather name="plus" size={18} color={Colors.primary} />
                </View>
                <Text style={styles.courseAddText}>Tambah Kursus Baru</Text>
                <Feather name="chevron-right" size={14} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/learn")}
              activeOpacity={0.85}
              style={[styles.emptyCard, shadow]}
            >
              <LinearGradient colors={["#4C6FFF", "#7C47FF"]} style={styles.emptyGrad}>
                <View style={styles.blob1} /><View style={styles.blob2} />
                <Feather name="plus-circle" size={32} color="rgba(255,255,255,0.9)" />
                <Text style={styles.emptyTitle}>Buat Kursus Pertama</Text>
                <Text style={styles.emptySub}>Tap untuk memulai jalur belajarmu</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>

        {/* ═══ MENU CEPAT ═══ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.home.section_quick}</Text>
          <View style={styles.quickGrid}>
            {[
              {
                icon: "credit-card" as const,
                label: t.home.quick_flash,
                sub: t.home.quick_flash_sub,
                color: Colors.primary,
                bg: Colors.primaryLight,
                route: "/(tabs)/practice",
              },
              {
                icon: "help-circle" as const,
                label: t.home.quick_quiz,
                sub: t.home.quick_quiz_sub,
                color: Colors.amber,
                bg: Colors.amberLight,
                route: "/(tabs)/practice",
              },
              {
                icon: "cpu" as const,
                label: t.home.quick_ai,
                sub: t.home.quick_ai_sub,
                color: Colors.purple,
                bg: Colors.purpleLight,
                route: "/(tabs)/progress?tab=prompts",
              },
              {
                icon: "bar-chart-2" as const,
                label: t.home.quick_progress,
                sub: t.home.quick_progress_sub,
                color: Colors.teal,
                bg: Colors.tealLight,
                route: "/(tabs)/progress",
              },
              {
                icon: "star" as const,
                label: "Tantangan Harian",
                sub: "Soal baru tiap hari",
                color: "#F59E0B",
                bg: "#FEF3C7",
                route: "/daily-challenge",
              },
              {
                icon: "clock" as const,
                label: "Timer Pomodoro",
                sub: "Fokus 25 menit",
                color: "#EF4444",
                bg: "#FEE2E2",
                route: "/pomodoro",
              },
              {
                icon: "bookmark" as const,
                label: "Bookmark Soal",
                sub: "Review soal tersimpan",
                color: "#8B5CF6",
                bg: "#EDE9FE",
                route: "/bookmarks",
              },
              {
                icon: "download" as const,
                label: "Import Anki",
                sub: "Baca .apkg / .txt",
                color: "#0EA5E9",
                bg: "#E0F2FE",
                route: "/anki-import",
              },
            ].map((q, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => router.push(q.route as any)}
                style={[styles.quickItem, shadowSm]}
                activeOpacity={0.8}
              >
                <View style={[styles.quickIcon, { backgroundColor: q.bg }]}>
                  <Feather name={q.icon} size={20} color={q.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.quickLabel}>{q.label}</Text>
                  <Text style={styles.quickSub}>{q.sub}</Text>
                </View>
                <Feather name="chevron-right" size={14} color={Colors.border} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ═══ TARGET BELAJAR ═══ */}
        {user?.goal && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Target Belajar</Text>
            <View style={[styles.goalCard, shadowSm]}>
              <View style={[styles.goalIcon, { backgroundColor: Colors.primaryLight }]}>
                <Feather name="target" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.goalText} numberOfLines={2}>{user.goal}</Text>
                <Text style={styles.goalMeta}>{user.topic} · {user.level}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ═══ LATIHAN KILAT ═══ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Latihan Kilat</Text>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => router.push("/(tabs)/practice")}
            style={[styles.challengeCard, shadow]}
          >
            <LinearGradient
              colors={["#FF6B6B", "#FF9500"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.challengeGrad}
            >
              <View style={styles.blob1} />
              <View style={styles.challengeLeft}>
                <View style={styles.challengeIconWrap}>
                  <Feather name="zap" size={22} color="#fff" />
                </View>
                <View>
                  <Text style={styles.challengeTitle}>5 Soal Kilat</Text>
                  <Text style={styles.challengeSub}>~10 menit · Semua topik</Text>
                </View>
              </View>
              <View style={styles.challengeBtn}>
                <Text style={styles.challengeBtnText}>Mulai</Text>
                <Feather name="arrow-right" size={13} color="#FF6B6B" />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* AdMob Banner — fixed di bagian bawah layar */}
      <AdBanner size="adaptiveBanner" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingBottom: 80 },

  /* Blobs (shared across gradient cards) */
  blob1: {
    position: "absolute", width: 200, height: 200, borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.07)", top: -60, right: -50,
  },
  blob2: {
    position: "absolute", width: 120, height: 120, borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.05)", bottom: -30, left: 10,
  },

  /* Header */
  header: { paddingHorizontal: 20, paddingBottom: 20, overflow: "hidden" },
  headerRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 20 },
  dateText: { fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: "600", marginBottom: 4 },
  greetText: { fontSize: 14, color: "rgba(255,255,255,0.7)", fontWeight: "600" },
  nameText: { fontSize: 26, fontWeight: "900", color: "#fff", letterSpacing: -0.5, marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  bellDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: "#FF6B6B",
    position: "absolute", top: 7, right: 7,
    borderWidth: 1.5, borderColor: "#4C6FFF",
  },
  avatar: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.35)",
  },
  avatarText: { fontSize: 16, fontWeight: "900", color: "#fff" },

  /* Stats row */
  statsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 14,
  },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 12, gap: 3 },
  statItemBorder: { borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.12)" },
  statVal: { fontSize: 16, fontWeight: "900", color: "#fff", marginTop: 3 },
  statLabel: { fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: "700", textTransform: "uppercase" },

  /* Tip strip */
  tipStrip: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  tipText: { flex: 1, fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: "500", lineHeight: 18 },

  /* Section */
  section: { paddingHorizontal: 20, marginTop: 24 },
  sectionFlat: { paddingHorizontal: 20, marginTop: 14 },
  sectionHead: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: Colors.dark, letterSpacing: -0.2 },
  seeAllBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllText: { fontSize: 13, fontWeight: "700", color: Colors.primary },

  /* Continue learning card */
  continueCard: { borderRadius: 20, overflow: "hidden" },
  continueGrad: { padding: 20, minHeight: 150, overflow: "hidden" },
  continueTop: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: 12,
  },
  continuePill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  continuePillText: { fontSize: 11, fontWeight: "800", color: "#fff" },
  continueArrow: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  continueName: { fontSize: 18, fontWeight: "900", color: "#fff", letterSpacing: -0.3, marginBottom: 4 },
  continueSub: { fontSize: 13, color: "rgba(255,255,255,0.65)", fontWeight: "500", marginBottom: 14 },
  continueFooter: { flexDirection: "row", alignItems: "center", gap: 10 },
  continueBar: { flex: 1, height: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.25)" },
  continueBarFill: { height: "100%", borderRadius: 999, backgroundColor: "#fff" },
  continueBarLabel: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.8)" },

  /* Alert card */
  alertCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.dangerLight,
    borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: "rgba(239,68,68,0.15)",
  },
  alertIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
  },
  alertTitle: { fontSize: 14, fontWeight: "800", color: Colors.danger },
  alertSub: { fontSize: 12, color: Colors.textSecondary, fontWeight: "500", marginTop: 2 },
  alertPill: {
    backgroundColor: Colors.danger,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
  },
  alertPillText: { fontSize: 12, fontWeight: "800", color: "#fff" },

  /* Course cards */
  courseList: { gap: 10 },
  courseCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: 18, overflow: "hidden",
    minHeight: 76,
  },
  courseCardGrad: {
    width: 72, alignSelf: "stretch",
    alignItems: "center", justifyContent: "center",
  },
  courseCardBody: {
    flex: 1, paddingVertical: 13, paddingHorizontal: 12, gap: 4,
  },
  courseName: { fontSize: 15, fontWeight: "800", color: Colors.dark, lineHeight: 20 },
  courseSub: { fontSize: 12, color: Colors.textMuted, fontWeight: "500" },
  courseStatRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  courseStatChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.background, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  courseStatText: { fontSize: 10, fontWeight: "700" },
  courseCardArrow: { paddingRight: 14 },
  courseArrowCircle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  courseShowMore: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 4, paddingVertical: 10,
  },
  courseShowMoreText: { fontSize: 13, fontWeight: "700", color: Colors.primary },
  courseCardAdd: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 18, backgroundColor: Colors.white,
    padding: 16, borderWidth: 1.5, borderColor: Colors.border,
    borderStyle: "dashed",
  },
  courseAddIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    alignItems: "center", justifyContent: "center",
  },
  courseAddText: { fontSize: 14, fontWeight: "700", color: Colors.primary, flex: 1 },

  /* Empty state */
  emptyCard: { borderRadius: 20, overflow: "hidden" },
  emptyGrad: { padding: 28, alignItems: "center", gap: 10, minHeight: 150, overflow: "hidden" },
  emptyTitle: { fontSize: 17, fontWeight: "900", color: "#fff" },
  emptySub: { fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: "500" },

  /* Quick actions */
  quickGrid: { gap: 10, marginTop: 12 },
  quickItem: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: Colors.white,
    borderRadius: 16, padding: 14,
  },
  quickIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  quickLabel: { fontSize: 14, fontWeight: "800", color: Colors.dark },
  quickSub: { fontSize: 12, color: Colors.textMuted, fontWeight: "500", marginTop: 2 },

  /* Goal */
  goalCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    padding: 14, flexDirection: "row", alignItems: "center", gap: 14,
  },
  goalIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  goalText: { fontSize: 14, fontWeight: "700", color: Colors.dark, lineHeight: 20 },
  goalMeta: { fontSize: 12, color: Colors.textMuted, fontWeight: "600", marginTop: 4, textTransform: "capitalize" },

  /* Challenge */
  challengeCard: { borderRadius: 16, overflow: "hidden" },
  challengeGrad: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", padding: 18, overflow: "hidden",
  },
  challengeLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  challengeIconWrap: {
    width: 46, height: 46, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  challengeTitle: { fontSize: 16, fontWeight: "900", color: "#fff" },
  challengeSub: { fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: "500", marginTop: 2 },
  challengeBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#fff",
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  challengeBtnText: { fontSize: 13, fontWeight: "800", color: "#FF6B6B" },
});
