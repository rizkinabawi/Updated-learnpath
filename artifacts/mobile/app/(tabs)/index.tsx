import React, { useCallback, useMemo, useState } from "react";
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
  getUser, getModules, getLessons, getStats, getWrongAnswers,
  getCompletedLessons,
  getSortedLearningPaths,
  toggleCourseFavorite,
  type User, type LearningPath, type Module, type Lesson, type Stats,
} from "@/utils/storage";
import { CARD_GRADIENTS, CARD_GRADIENTS_MINIMAL, CARD_GRADIENTS_PREMIUM, type ColorScheme } from "@/constants/colors";
import { useColors, useTheme } from "@/contexts/ThemeContext";
import { ProgressBar } from "@/components/ProgressBar";
import { AdBanner } from "@/components/AdBanner";
import { useTranslation } from "@/contexts/LanguageContext";
import { getLicenseDetails } from "@/utils/security/app-license";

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
  const colors = useColors();
  const { isDark, palette } = useTheme();
   const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);

  // Dynamic gradients based on palette
  const activeGradients = useMemo(() => {
    if (palette === "minimal") return CARD_GRADIENTS_MINIMAL;
    if (palette === "premium") return CARD_GRADIENTS_PREMIUM;
    return CARD_GRADIENTS;
  }, [palette, isDark]); // isDark triggering CARD_GRADIENTS mutation via ThemeContext

  const shadowLg = useMemo(
    () => ({
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.4 : 0.08,
      shadowRadius: 16,
      elevation: 5,
    }),
    [colors, isDark],
  );
  const shadowSm = useMemo(
    () => ({
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.35 : 0.05,
      shadowRadius: 8,
      elevation: 2,
    }),
    [colors, isDark],
  );

  const [user, setUser] = useState<User | null>(null);
  const [paths, setPaths] = useState<LearningPath[]>([]);
  const [allModules, setAllModules] = useState<Module[]>([]);
  const [allLessons, setAllLessons] = useState<Lesson[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [wrongCount, setWrongCount] = useState(0);
  const [completions, setCompletions] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [license, setLicense] = useState<any>(null);

  const load = async () => {
    const [u, p, mods, lessons, s, w, c, lic] = await Promise.all([
      getUser(), getSortedLearningPaths(), getModules(), getLessons(), getStats(), getWrongAnswers(),
      getCompletedLessons(), getLicenseDetails(),
    ]);
    if (!u) { router.replace("/onboarding"); return; }
    setUser(u); setPaths(p); setAllModules(mods); setAllLessons(lessons); setStats(s); setWrongCount(w.length);
    setCompletions(c); setLicense(lic);
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

  const handleToggleFavorite = async (pathId: string) => {
    const newVal = await toggleCourseFavorite(pathId);
    setPaths(prev => prev.map(p => p.id === pathId ? { ...p, isFavorite: newVal } : p).sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return (b.openCount || 0) - (a.openCount || 0);
    }));
  };

  // Fix hardcoded color dependencies by using palette-safe tokens
  const headerGradient: [string, string] = (palette === "minimal" && isDark)
    ? [colors.primaryLight, colors.background]
    : [colors.primary, palette === "color" ? colors.purple : colors.primaryDark];

  const challengeGradient: [string, string] = (palette === "minimal" && isDark)
    ? [colors.primaryLight, colors.surface]
    : [colors.accent, palette === "color" ? colors.amber : colors.accentLight];

  // Hero Card text/icon inversion for Premium (Light Hero on Dark Bg)
  const isPremiumDarkHero = palette === "premium" && isDark;
  const heroContentColor = isPremiumDarkHero ? "#1A1A1A" : "#fff";
  const heroDimColor = isPremiumDarkHero ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.75)";
  const heroBarBg = isPremiumDarkHero ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.28)";
  const heroBarFill = isPremiumDarkHero ? "#1A1A1A" : "#fff";

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* ═══ HEADER ═══ */}
        <LinearGradient
          colors={headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: Platform.OS === "web" ? 56 : insets.top + 20 }]}
        >
          <View style={styles.blob1} />
          <View style={styles.blob2} />

          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dateText}>{dateStr}</Text>
              <Text style={styles.greetText}>{greet},</Text>
              <Text style={styles.nameText}>{firstName} 👋</Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/external-screens" as any)}>
                <Feather name="globe" size={18} color={colors.white} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/search" as any)}>
                <Feather name="search" size={18} color={colors.white} />
              </TouchableOpacity>
              {wrongCount > 0 && (
                <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/mistakes-review" as any)}>
                  <Feather name="bell" size={18} color={colors.white} />
                  <View style={styles.bellDot} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => router.push("/(tabs)/profile")} style={styles.avatar}>
                <Text style={styles.avatarText}>{firstName.charAt(0).toUpperCase()}</Text>
              </TouchableOpacity>
            </View>
          </View>

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

          <View style={styles.tipStrip}>
            <Feather name="zap" size={12} color="rgba(255,255,255,0.7)" />
            <View style={{ flex: 1 }}>
              <Text style={styles.tipText} numberOfLines={2}>"{todayQuote.text}"</Text>
              <Text style={[styles.tipText, { fontSize: 10, opacity: 0.6, marginTop: 2 }]}>— {todayQuote.author}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ═══ TRIAL EXPIRY BANNER ═══ */}
        {license?.nearExpiry && (
          <View style={styles.sectionFlat}>
            <TouchableOpacity
              onPress={() => router.push("/activate")}
              style={[styles.alertCard, { backgroundColor: colors.dangerLight, borderColor: colors.danger + "33", borderWidth: 1 }]}
            >
              <View style={[styles.alertIcon, { backgroundColor: colors.danger + "22" }]}>
                <Feather name="clock" size={18} color={colors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.alertTitle, { color: colors.danger }]}>Trial Segera Berakhir!</Text>
                <Text style={styles.alertSub}>Masa berlaku tinggal {license.daysLeft} hari lagi. Aktivasi sekarang untuk akses selamanya.</Text>
              </View>
              <View style={[styles.alertPill, { backgroundColor: colors.danger }]}>
                <Text style={styles.alertPillText}>Aktivasi</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* ═══ LANJUTKAN BELAJAR ═══ */}
        {paths.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{t.home.section_continue}</Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/learn")} style={styles.seeAllBtn}>
                <Text style={styles.seeAllText}>{t.home.see_all}</Text>
                <Feather name="chevron-right" size={13} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.push(`/course/${paths[0].id}` as any)}
              style={[styles.continueCard, shadowLg]}
            >
              <LinearGradient
                colors={activeGradients[0]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.continueGrad}
              >
                <View style={styles.blob1} />
                <View style={styles.blob2} />
                <View style={styles.continueTop}>
                  <View style={[styles.continuePill, isPremiumDarkHero && { backgroundColor: "rgba(0,0,0,0.08)" }]}>
                    <Feather name="play" size={10} color={heroContentColor} />
                    <Text style={[styles.continuePillText, { color: heroContentColor }]}>Lanjutkan</Text>
                  </View>
                  <View style={[styles.continueArrow, isPremiumDarkHero && { backgroundColor: "rgba(0,0,0,0.08)" }]}>
                    <Feather name="arrow-right" size={15} color={heroContentColor} />
                  </View>
                </View>
                <Text style={[styles.continueName, { color: heroContentColor }]} numberOfLines={2}>{paths[0].name}</Text>
                <Text style={[styles.continueSub, { color: heroDimColor }]} numberOfLines={1}>
                  {paths[0].description || user?.topic || "Kursus aktif"}
                </Text>
                <View style={styles.continueFooter}>
                  <View style={[styles.continueBar, { backgroundColor: heroBarBg }]}>
                    <View 
                      style={[
                        styles.continueBarFill, 
                        { 
                          backgroundColor: heroBarFill,
                          width: `${Math.round((allLessons.filter(l => completions.includes(l.id) && allModules.find(m => m.id === l.moduleId)?.pathId === paths[0].id).length / (allLessons.filter(l => allModules.find(m => m.id === l.moduleId)?.pathId === paths[0].id).length || 1)) * 100)}%` 
                        }
                      ]} 
                    />
                  </View>
                  <Text style={[styles.continueBarLabel, { color: heroDimColor }]}>
                    {Math.round((allLessons.filter(l => completions.includes(l.id) && allModules.find(m => m.id === l.moduleId)?.pathId === paths[0].id).length / (allLessons.filter(l => allModules.find(m => m.id === l.moduleId)?.pathId === paths[0].id).length || 1)) * 100)}% selesai
                  </Text>
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
              style={[styles.alertCard, shadowLg]}
            >
              <View style={styles.alertIcon}>
                <Feather name="alert-circle" size={18} color={colors.danger} />
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
                const grad = activeGradients[i % activeGradients.length];
                const icon = (path.icon as React.ComponentProps<typeof Feather>["name"]) || COURSE_ICONS[i % COURSE_ICONS.length];
                return (
                  <TouchableOpacity
                    key={path.id}
                    activeOpacity={0.88}
                    onPress={() => router.push(`/course/${path.id}` as any)}
                    style={[styles.courseCard, shadowSm]}
                  >
                    <LinearGradient colors={grad} style={styles.courseCardGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                      <Feather name={icon} size={24} color={colors.white} />
                    </LinearGradient>

                    <View style={styles.courseCardBody}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <Text style={styles.courseName} numberOfLines={1}>{path.name}</Text>
                        <TouchableOpacity onPress={() => handleToggleFavorite(path.id)} style={{ padding: 4 }}>
                          <Feather name="star" size={14} color={path.isFavorite ? colors.amber : colors.textMuted} fill={path.isFavorite ? colors.amber : "transparent"} />
                        </TouchableOpacity>
                      </View>
                      {!!path.description && (
                        <Text style={styles.courseSub} numberOfLines={1}>{path.description}</Text>
                      )}
                      <View style={styles.courseStatRow}>
                        <View style={styles.courseStatChip}>
                          <Feather name="layers" size={10} color={grad[0]} />
                          <Text style={[styles.courseStatText, { color: grad[0] }]}>{pathMods.length} modul</Text>
                        </View>
                        <View style={styles.courseStatChip}>
                          <Feather name="check-circle" size={10} color={grad[0]} />
                          <Text style={[styles.courseStatText, { color: grad[0] }]}>
                            {Math.round((pathLessons.filter(l => completions.includes(l.id)).length / (pathLessons.length || 1)) * 100)}%
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.courseCardArrow}>
                      <LinearGradient colors={grad} style={styles.courseArrowCircle} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                        <Feather name="chevron-right" size={14} color="#fff" />
                      </LinearGradient>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {paths.length > 4 && (
                <TouchableOpacity onPress={() => router.push("/(tabs)/learn")} style={styles.courseShowMore} activeOpacity={0.8}>
                  <Text style={styles.courseShowMoreText}>Lihat {paths.length - 4} kursus lainnya</Text>
                  <Feather name="chevron-right" size={13} color={colors.primary} />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => router.push("/(tabs)/learn")}
                style={[styles.courseCardAdd, shadowSm]}
                activeOpacity={0.8}
              >
                <View style={styles.courseAddIcon}>
                  <Feather name="plus" size={18} color={colors.primary} />
                </View>
                <Text style={styles.courseAddText}>Tambah Kursus Baru</Text>
                <Feather name="chevron-right" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => router.push("/(tabs)/learn")} activeOpacity={0.85} style={[styles.emptyCard, shadowLg]}>
              <LinearGradient colors={headerGradient} style={styles.emptyGrad}>
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
              { icon: "credit-card" as const, label: t.home.quick_flash, sub: t.home.quick_flash_sub, color: colors.primary, bg: colors.primaryLight, route: "/(tabs)/practice" },
              { icon: "help-circle" as const, label: t.home.quick_quiz, sub: t.home.quick_quiz_sub, color: colors.amber, bg: colors.amberLight, route: "/(tabs)/practice" },
              { icon: "bar-chart-2" as const, label: t.home.quick_progress, sub: t.home.quick_progress_sub, color: colors.teal, bg: colors.tealLight, route: "/(tabs)/progress" },
              { icon: "star" as const, label: "Tantangan Harian", sub: "Soal baru tiap hari", color: colors.warning, bg: colors.warningLight, route: "/daily-challenge" },
              { icon: "clock" as const, label: "Timer Pomodoro", sub: "Fokus 25 menit", color: colors.danger, bg: colors.dangerLight, route: "/pomodoro" },
              { icon: "bookmark" as const, label: "Bookmark Soal", sub: "Review soal tersimpan", color: colors.purple, bg: colors.purpleLight, route: "/bookmarks" },
              { icon: "download" as const, label: "Import Pintar", sub: "Impor .lpack / .apkg", color: colors.teal, bg: colors.tealLight, route: "/import-manager" },
            ].map((q, i) => (
              <TouchableOpacity key={i} onPress={() => router.push(q.route as any)} style={[styles.quickItem, shadowSm]} activeOpacity={0.8}>
                <View style={[styles.quickIcon, { backgroundColor: q.bg }]}>
                  <Feather name={q.icon} size={20} color={q.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.quickLabel}>{q.label}</Text>
                  <Text style={styles.quickSub}>{q.sub}</Text>
                </View>
                <Feather name="chevron-right" size={14} color={colors.border} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ═══ TARGET BELAJAR & TIMELINE ═══ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Target & Timeline Aktif</Text>
          {paths.some(p => p.targetDate) ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, marginHorizontal: -20, paddingHorizontal: 20 }}>
              {paths.filter(p => p.targetDate).map((path, i) => {
                const pathLessons = allLessons.filter(l => allModules.find(m => m.id === l.moduleId)?.pathId === path.id);
                const done = pathLessons.filter(l => completions.includes(l.id)).length;
                const total = pathLessons.length || 1;
                const pct = Math.round((done / total) * 100);
                
                const target = new Date(path.targetDate!);
                const diff = target.getTime() - new Date().getTime();
                const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
                const isBehind = (total - done) / (daysLeft > 0 ? daysLeft : 1) > 2;

                return (
                  <TouchableOpacity 
                    key={path.id} 
                    onPress={() => router.push(`/course/${path.id}` as any)}
                    style={[styles.targetTimelineCard, shadowSm, { marginRight: 12 }]}
                  >
                    <View style={styles.targetTimelineTop}>
                      <Text style={styles.targetTimelineName} numberOfLines={1}>{path.name}</Text>
                      <View style={[styles.targetBadge, { backgroundColor: daysLeft < 0 ? colors.dangerLight : isBehind ? colors.warningLight : colors.successLight }]}>
                        <Text style={[styles.targetBadgeText, { color: daysLeft < 0 ? colors.danger : isBehind ? colors.warning : colors.success }]}>
                          {daysLeft < 0 ? "Overdue" : isBehind ? "Behind" : "On Track"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.targetTimelineDate}>
                      <Feather name="calendar" size={10} /> {new Date(path.targetDate!).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} 
                      ({daysLeft} hari lagi)
                    </Text>
                    <View style={styles.targetTimelineProgress}>
                      <View style={styles.targetTimelineBar}>
                        <View style={[styles.targetTimelineFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                      </View>
                      <Text style={styles.targetTimelinePct}>{pct}%</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : user?.goal ? (
            <View style={[styles.goalCard, shadowSm, { marginTop: 12 }]}>
              <View style={[styles.goalIcon, { backgroundColor: colors.primaryLight }]}>
                <Feather name="target" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.goalText} numberOfLines={2}>{user.goal}</Text>
                <Text style={styles.goalMeta}>{user.topic} · {user.level}</Text>
              </View>
              <TouchableOpacity onPress={() => router.push("/(tabs)/learn")} style={styles.setTimelineBtn}>
                <Text style={styles.setTimelineBtnText}>Set Timeline</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              onPress={() => router.push("/(tabs)/learn")}
              style={[styles.emptyTimelineCard, { marginTop: 12 }]}
            >
              <Feather name="clock" size={24} color={colors.textMuted} />
              <Text style={styles.emptyTimelineText}>Belum ada target timeline. Atur sekarang di detail kursus.</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ═══ LATIHAN KILAT ═══ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Latihan Kilat</Text>
          <TouchableOpacity activeOpacity={0.88} onPress={() => router.push("/(tabs)/practice")} style={[styles.challengeCard, shadowLg]}>
            <LinearGradient colors={challengeGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.challengeGrad}>
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
                <Feather name="arrow-right" size={13} color={colors.accent} />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>

      <AdBanner size="adaptiveBanner" />
    </View>
  );
}

const makeStyles = (c: ColorScheme, isDark: boolean, palette: string) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    scrollContent: { paddingBottom: 80 },

    blob1: {
      position: "absolute", width: 200, height: 200, borderRadius: 100,
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.07)", top: -60, right: -50,
    },
    blob2: {
      position: "absolute", width: 120, height: 120, borderRadius: 60,
      backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.05)", bottom: -30, left: 10,
    },

    header: { paddingHorizontal: 20, paddingBottom: 20, overflow: "hidden" },
    headerRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 20 },
    dateText: { fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: "600", marginBottom: 4 },
    greetText: { fontSize: 14, color: "rgba(255,255,255,0.75)", fontWeight: "600" },
    nameText: { fontSize: 26, fontWeight: "900", color: "#fff", letterSpacing: -0.5, marginTop: 2 },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
    iconBtn: {
      width: 38, height: 38, borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.14)",
      alignItems: "center", justifyContent: "center",
    },
    bellDot: {
      width: 8, height: 8, borderRadius: 4,
      backgroundColor: c.accent,
      position: "absolute", top: 7, right: 7,
      borderWidth: 1.5, borderColor: c.primary,
    },
    avatar: {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.18)",
      alignItems: "center", justifyContent: "center",
      borderWidth: 1.5, borderColor: "rgba(255,255,255,0.3)",
    },
    avatarText: { fontSize: 16, fontWeight: "900", color: "#fff" },

    statsRow: {
      flexDirection: "row",
      backgroundColor: "rgba(255,255,255,0.1)",
      borderRadius: 14,
      overflow: "hidden",
      marginBottom: 14,
    },
    statItem: { flex: 1, alignItems: "center", paddingVertical: 12, gap: 3 },
    statItemBorder: { borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.1)" },
    statVal: { fontSize: 16, fontWeight: "900", color: "#fff", marginTop: 3 },
    statLabel: { fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: "700", textTransform: "uppercase" },

    tipStrip: {
      flexDirection: "row", alignItems: "flex-start", gap: 8,
      backgroundColor: "rgba(255,255,255,0.08)",
      borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    },
    tipText: { flex: 1, fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: "500", lineHeight: 18 },

    section: { paddingHorizontal: 20, marginTop: 24 },
    sectionFlat: { paddingHorizontal: 20, marginTop: 14 },
    sectionHead: {
      flexDirection: "row", justifyContent: "space-between",
      alignItems: "center", marginBottom: 12,
    },
    sectionTitle: { fontSize: 15, fontWeight: "800", color: c.text, letterSpacing: -0.2 },
    seeAllBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
    seeAllText: { fontSize: 13, fontWeight: "700", color: c.primary },

    continueCard: { borderRadius: 20, overflow: "hidden" },
    continueGrad: { padding: 20, minHeight: 150, overflow: "hidden" },
    continueTop: {
      flexDirection: "row", justifyContent: "space-between",
      alignItems: "center", marginBottom: 12,
    },
    continuePill: {
      flexDirection: "row", alignItems: "center", gap: 4,
      backgroundColor: "rgba(255,255,255,0.22)",
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    },
    continuePillText: { fontSize: 11, fontWeight: "800", color: "#fff" },
    continueArrow: {
      width: 32, height: 32, borderRadius: 10,
      backgroundColor: "rgba(255,255,255,0.22)",
      alignItems: "center", justifyContent: "center",
    },
    continueName: { fontSize: 18, fontWeight: "900", color: "#fff", letterSpacing: -0.3, marginBottom: 4 },
    continueSub: { fontSize: 13, color: "rgba(255,255,255,0.75)", fontWeight: "500", marginBottom: 14 },
    continueFooter: { flexDirection: "row", alignItems: "center", gap: 10 },
    continueBar: { flex: 1, height: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.28)" },
    continueBarFill: { height: "100%", borderRadius: 999, backgroundColor: "#fff" },
    continueBarLabel: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.85)" },

    alertCard: {
      flexDirection: "row", alignItems: "center", gap: 12,
      backgroundColor: c.dangerLight,
      borderRadius: 16, padding: 14,
      borderWidth: 1, borderColor: c.danger + "26",
    },
    alertIcon: {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: c.surface, alignItems: "center", justifyContent: "center",
    },
    alertTitle: { fontSize: 14, fontWeight: "800", color: c.danger },
    alertSub: { fontSize: 12, color: c.textSecondary, fontWeight: "500", marginTop: 2 },
    alertPill: {
      backgroundColor: c.danger,
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    },
    alertPillText: { fontSize: 12, fontWeight: "800", color: "#fff" },

    courseList: { gap: 10 },
    courseCard: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: c.surface,
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
    courseName: { fontSize: 15, fontWeight: "800", color: c.text, lineHeight: 20 },
    courseSub: { fontSize: 12, color: c.textMuted, fontWeight: "500" },
    courseStatRow: { flexDirection: "row", gap: 8, marginTop: 2 },
    courseStatChip: {
      flexDirection: "row", alignItems: "center", gap: 4,
      backgroundColor: c.background, borderRadius: 20,
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
    courseShowMoreText: { fontSize: 13, fontWeight: "700", color: c.primary },
    courseCardAdd: {
      flexDirection: "row", alignItems: "center", gap: 12,
      borderRadius: 18, backgroundColor: c.surface,
      padding: 16, borderWidth: 1.5, borderColor: c.border,
      borderStyle: "dashed",
    },
    courseAddIcon: {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: c.primaryLight,
      alignItems: "center", justifyContent: "center",
    },
    courseAddText: { fontSize: 14, fontWeight: "700", color: c.primary, flex: 1 },

    emptyCard: { borderRadius: 20, overflow: "hidden" },
    emptyGrad: { padding: 28, alignItems: "center", gap: 10, minHeight: 150, overflow: "hidden" },
    emptyTitle: { fontSize: 17, fontWeight: "900", color: "#fff" },
    emptySub: { fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: "500" },

    quickGrid: { gap: 10, marginTop: 12 },
    quickItem: {
      flexDirection: "row", alignItems: "center", gap: 14,
      backgroundColor: c.surface,
      borderRadius: 16, padding: 14,
    },
    quickIcon: {
      width: 44, height: 44, borderRadius: 12,
      alignItems: "center", justifyContent: "center",
    },
    quickLabel: { fontSize: 14, fontWeight: "800", color: c.text },
    quickSub: { fontSize: 12, color: c.textMuted, fontWeight: "500", marginTop: 2 },

    goalCard: {
      backgroundColor: c.surface, borderRadius: 16,
      padding: 14, flexDirection: "row", alignItems: "center", gap: 14,
    },
    goalIcon: {
      width: 44, height: 44, borderRadius: 12,
      alignItems: "center", justifyContent: "center",
    },
    goalText: { fontSize: 14, fontWeight: "700", color: c.text, lineHeight: 20 },
    goalMeta: { fontSize: 12, color: c.textMuted, fontWeight: "600", marginTop: 4, textTransform: "capitalize" },
    setTimelineBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: c.primary, borderRadius: 8 },
    setTimelineBtnText: { fontSize: 11, fontWeight: "800", color: "#fff" },

    targetTimelineCard: { 
      backgroundColor: c.surface, borderRadius: 16, padding: 14, width: 220,
    },
    targetTimelineTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
    targetTimelineName: { fontSize: 14, fontWeight: "800", color: c.text, flex: 1, marginRight: 8 },
    targetBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    targetBadgeText: { fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
    targetTimelineDate: { fontSize: 11, color: c.textMuted, fontWeight: "600", marginBottom: 12 },
    targetTimelineProgress: { flexDirection: "row", alignItems: "center", gap: 8 },
    targetTimelineBar: { flex: 1, height: 4, backgroundColor: c.border, borderRadius: 2 },
    targetTimelineFill: { height: "100%", borderRadius: 2 },
    targetTimelinePct: { fontSize: 11, fontWeight: "800", color: c.textSecondary },

    emptyTimelineCard: { 
      padding: 20, alignItems: "center", justifyContent: "center", gap: 10,
      borderWidth: 1.5, borderColor: c.border, borderStyle: "dashed", borderRadius: 16,
    },
    emptyTimelineText: { fontSize: 12, color: c.textMuted, textAlign: "center", fontWeight: "600", lineHeight: 18 },

    challengeCard: { borderRadius: 16, overflow: "hidden" },
    challengeGrad: {
      flexDirection: "row", alignItems: "center",
      justifyContent: "space-between", padding: 18, overflow: "hidden",
    },
    challengeLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
    challengeIconWrap: {
      width: 46, height: 46, borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.22)",
      alignItems: "center", justifyContent: "center",
    },
    challengeTitle: { fontSize: 16, fontWeight: "900", color: "#fff" },
    challengeSub: { fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: "500", marginTop: 2 },
    challengeBtn: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: (palette === "minimal" && isDark) ? c.primary : c.white,
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    },
    challengeBtnText: { fontSize: 13, fontWeight: "800", color: (palette === "minimal" && isDark) ? c.white : (palette === "premium" && isDark) ? "#1A1A1A" : c.accent },
  });
