import { useColors, useTheme } from "@/contexts/ThemeContext";
import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureRef } from "react-native-view-shot";
// Native modules loaded dynamically inside handler to prevent resolution issues in some environments
let Print: any = null;
let Sharing: any = null;
try {
  Print = require("expo-print");
  Sharing = require("expo-sharing");
} catch(e) {
  console.warn("Native PDF/Sharing modules unavailable at top-level");
}
import { PromptBuilder } from "@/components/PromptBuilder";
import {
  getStats, getProgress, getUser, getLearningPaths, getModules, getLessons,
  getSessionLogs,
  type Stats, type Progress, type User, type LearningPath, type SessionLog,
} from "@/utils/storage";
import { useRouter } from "expo-router";
import { classifyAllItems, type DifficultyStats } from "@/utils/difficulty-classifier";
import { generateReportHTML } from "@/utils/report-generator";
import { ProgressBar } from "@/components/ProgressBar";
import { CARD_GRADIENTS, CARD_GRADIENTS_MINIMAL, CARD_GRADIENTS_PREMIUM, type ColorScheme } from "@/constants/colors";
import { toast } from "@/components/Toast";
import { isCancellationError } from "@/utils/safe-share";
import { useTranslation } from "@/contexts/LanguageContext";
import { exportProgressReport } from "@/utils/flashcard-export";

type Tab = "stats" | "classify" | "prompts";

interface PathStat {
  path: LearningPath;
  correct: number;
  wrong: number;
  total: number;
}

const makeDiffConfig = (colors: ColorScheme) => ({
  mudah:  { color: colors.teal, bg: colors.tealLight, icon: "trending-up"  as const, emoji: "✅" },
  sedang: { color: colors.amber,  bg: colors.amberLight,   icon: "minus-circle"  as const, emoji: "⚡" },
  susah:  { color: colors.accent,  bg: colors.accentLight,  icon: "alert-triangle" as const, emoji: "🔥" },
});

const makeShareGrads = (colors: ColorScheme): [string, string][] => [
  [colors.primary, colors.purple],
  [colors.accent, colors.amber],
  [colors.teal, "#0EA5E9"],
  [colors.purple, "#A855F7"],
  [colors.success, colors.emerald],
  [colors.warning, colors.danger],
];

export default function ProgressTab() {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const DIFF_CONFIG = useMemo(() => makeDiffConfig(colors), [colors]);
  const SHARE_GRADS = useMemo(() => makeShareGrads(colors), [colors]);

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const isTablet = width >= 720;
  const params = useLocalSearchParams<{ tab?: string }>();
  const shareCardRef = useRef<View>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [difficulty, setDifficulty] = useState<DifficultyStats | null>(null);
  const [tab, setTab] = useState<Tab>("stats");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [pathStats, setPathStats] = useState<PathStat[]>([]);
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);
  const [activeDiff, setActiveDiff] = useState<"mudah" | "sedang" | "susah">("susah");

  // Switch tab when navigated with ?tab= param
  useEffect(() => {
    const t = params.tab;
    if (t === "stats" || t === "classify" || t === "prompts") {
      setTab(t);
    }
  }, [params.tab]);

  useFocusEffect(useCallback(() => {
    (async () => {
      const [s, p, d, u, logs] = await Promise.all([getStats(), getProgress(), classifyAllItems(), getUser(), getSessionLogs()]);
      setStats(s); setProgress(p); setDifficulty(d); setUser(u); setSessionLogs(logs);
      // Compute per-path stats
      const paths = await getLearningPaths();
      const mods = await getModules();
      const lessons = await getLessons();
      const lessonToPath: Record<string, string> = {};
      for (const l of lessons) {
        const mod = mods.find((m) => m.id === l.moduleId);
        if (mod) lessonToPath[l.id] = mod.pathId;
      }
      const pathMap: Record<string, PathStat> = {};
      for (const path of paths) {
        pathMap[path.id] = { path, correct: 0, wrong: 0, total: 0 };
      }
      for (const rec of p) {
        const pathId = lessonToPath[rec.lessonId];
        if (pathId && pathMap[pathId]) {
          pathMap[pathId].total += 1;
          if (rec.isCorrect) pathMap[pathId].correct += 1;
          else pathMap[pathId].wrong += 1;
        }
      }
      setPathStats(Object.values(pathMap).filter((ps) => ps.total > 0));
    })();
  }, []));

  // Dynamic gradients based on palette
  const activeGradients = useMemo(() => {
    if (palette === "minimal") return CARD_GRADIENTS_MINIMAL;
    if (palette === "premium") return CARD_GRADIENTS_PREMIUM;
    return CARD_GRADIENTS;
  }, [palette, isDark]);

  const accuracy = stats && stats.totalAnswers > 0
    ? Math.round((stats.correctAnswers / stats.totalAnswers) * 100) : 0;
  const wrong = (stats?.totalAnswers ?? 0) - (stats?.correctAnswers ?? 0);

  const handleExportPDF = async () => {
    if (Platform.OS === "web") {
      toast.info(t.progress.pdf_only_native);
      return;
    }
    setPdfLoading(true);
    try {
      if (!stats) return;
      // Get streak from stats or calculate it
      const days = stats.streak || 0;
      await exportProgressReport(user?.name || "User", { 
        totalAnswers: stats.totalAnswers, 
        correctAnswers: stats.correctAnswers, 
        level: stats.level || 1, 
        xp: stats.xp || 0,
        days: days 
      });
      toast.success(t.progress.pdf_success);
    } catch (e) {
      console.error("Critical PDF Error:", e);
      Alert.alert("Error PDF", "Gagal menyusun dokumen.");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleShareImage = async () => {
    if (Platform.OS === "web") {
      toast.info(t.progress.share_only_native);
      return;
    }
    if (!shareCardRef.current) return;
    setShareLoading(true);
    try {
      const uri = await captureRef(shareCardRef, { format: "png", quality: 1 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: t.progress.share_btn });
        toast.success(t.progress.share_success);
      } else {
        toast.info(t.progress.share_unavailable);
      }
    } catch (e) {
      if (!isCancellationError(e)) toast.error(t.progress.share_error);
    } finally {
      setShareLoading(false);
    }
  };

  // Weekly bar chart data (last 7 days)
  const weeklyBars: { day: string; pct: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dayP = progress.filter((p) => p.timestamp.slice(0, 10) === key);
    const dayCorrect = dayP.filter((p) => p.isCorrect).length;
    const pct = dayP.length > 0 ? Math.round((dayCorrect / dayP.length) * 100) : 0;
    weeklyBars.push({ day: d.toLocaleDateString(undefined, { weekday: "short" }), pct });
  }
  const maxPct = Math.max(...weeklyBars.map((b) => b.pct), 1);

  const recent = [...progress]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 20);

  const diffLabels: Record<string, string> = {
    mudah: t.progress.easy,
    sedang: t.progress.medium,
    susah: t.progress.hard,
  };

  const TABS: { key: Tab; icon: React.ComponentProps<typeof Feather>["name"]; label: string }[] = [
    { key: "stats",    icon: "bar-chart-2", label: t.progress.tab_stats },
    { key: "classify", icon: "layers",      label: t.progress.tab_classify },
    { key: "prompts",  icon: "zap",         label: t.progress.tab_prompts },
  ];

  return (
    <View style={styles.container}>
      {/* ===== GRADIENT HEADER ===== */}
      <LinearGradient
        colors={(palette === "minimal" && isDark) ? [colors.primaryLight, colors.background] : [colors.primary, palette === "color" ? colors.purple : colors.primaryDark]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.headerGrad, { paddingTop: Platform.OS === "web" ? 60 : insets.top + 12 }]}
      >
        <View style={styles.hDot1} />
        <View style={styles.hDot2} />

        {/* Title row */}
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.headerSub}>{t.progress.header_sub}</Text>
            <Text style={styles.headerTitle}>{t.progress.header_title}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity onPress={handleShareImage} style={styles.pdfBtn} activeOpacity={0.8}>
              <LinearGradient colors={palette === "color" ? [colors.teal, "#0EA5E9"] : [colors.primary, colors.primaryDark]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.pdfBtnGrad}>
                {shareLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><Feather name="image" size={14} color="#fff" /><Text style={styles.pdfBtnText}>{t.progress.share_btn}</Text></>
                }
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleExportPDF} style={styles.pdfBtn} activeOpacity={0.8}>
              <LinearGradient colors={palette === "color" ? [colors.primary, colors.purple] : [colors.primary, colors.primaryDark]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.pdfBtnGrad}>
                {pdfLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><Feather name="download" size={14} color="#fff" /><Text style={styles.pdfBtnText}>PDF</Text></>
                }
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* Hero: Ring + Stat chips */}
        <View style={styles.heroRow}>
          {/* Enhanced Accuracy ring */}
          <View style={styles.ringContainer}>
            <View style={styles.ringOuter}>
              <LinearGradient 
                colors={accuracy >= 70 ? (palette === "color" ? [colors.teal, "#0EA5E9"] : [colors.primary, colors.primaryDark]) : accuracy >= 40 ? (palette === "color" ? [colors.amber, colors.accent] : [colors.border, colors.border]) : [colors.accent, colors.danger]}
                style={styles.ringGradient}
              >
                <View style={styles.ringInner}>
                  <Text style={styles.ringVal}>{accuracy}%</Text>
                  <Text style={styles.ringLbl}>ACCURACY</Text>
                </View>
              </LinearGradient>
            </View>
            <View style={[styles.ringGlow, { backgroundColor: accuracy >= 70 ? colors.teal : colors.accent, opacity: 0.2 }]} />
          </View>

          {/* Premium stat grid */}
          <View style={styles.statsPanel}>
            <View style={styles.statLine}>
              <View style={styles.statMiniCard}>
                <Feather name="check-circle" size={12} color={colors.teal} />
                <View>
                  <Text style={styles.statMiniVal}>{stats?.correctAnswers ?? 0}</Text>
                  <Text style={styles.statMiniLbl}>Solved</Text>
                </View>
              </View>
              <View style={styles.statMiniCard}>
                <Feather name="zap" size={12} color={colors.amber} />
                <View>
                  <Text style={styles.statMiniVal}>{stats?.streak ?? 0}</Text>
                  <Text style={styles.statMiniLbl}>Streak</Text>
                </View>
              </View>
            </View>
            <View style={styles.statLine}>
              <View style={styles.statMiniCard}>
                <Feather name="message-circle" size={12} color="#fff" />
                <View>
                  <Text style={styles.statMiniVal}>{stats?.totalAnswers ?? 0}</Text>
                  <Text style={styles.statMiniLbl}>Total</Text>
                </View>
              </View>
              <View style={styles.statMiniCard}>
                <Feather name="x-circle" size={12} color={colors.accent} />
                <View>
                  <Text style={styles.statMiniVal}>{wrong}</Text>
                  <Text style={styles.statMiniLbl}>Errors</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Tab strip */}
        <View style={styles.tabStrip}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tabItem, tab === t.key && styles.tabItemActive]}
              activeOpacity={0.75}
            >
              <Feather name={t.icon} size={13} color={tab === t.key ? "#fff" : "rgba(255,255,255,0.4)"} />
              <Text style={[styles.tabItemText, tab === t.key && styles.tabItemTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {/* ===== CONTENT ===== */}
      {tab === "stats" && (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            isTablet && { maxWidth: 1100, alignSelf: "center", width: "100%", paddingHorizontal: 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >

          {/* Weekly bar chart */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.cardHeadLeft}>
                <LinearGradient 
                  colors={palette === "color" ? [colors.primary, colors.purple] : [colors.primary, colors.primaryDark]} 
                  style={styles.cardHeadIcon}
                >
                  <Feather name="bar-chart-2" size={13} color="#fff" />
                </LinearGradient>
                <Text style={styles.cardTitle}>{t.progress.section_accuracy7}</Text>
              </View>
              <View style={styles.badgeCompact}>
                <Text style={styles.badgeTextCompact}>Real-time</Text>
              </View>
            </View>
            <View style={styles.barChartWrap}>
              {weeklyBars.map((b, i) => {
                const h = Math.max(8, (b.pct / 100) * 80);
                const col = b.pct >= 70 ? colors.teal : b.pct >= 40 ? colors.amber : b.pct === 0 ? colors.border : colors.accent;
                return (
                  <View key={i} style={styles.barCol}>
                    <View style={styles.barTrack}>
                      <LinearGradient 
                        colors={b.pct > 0 ? [col, col + "88"] : [colors.border, colors.border]} 
                        style={[styles.barFill, { height: h }]} 
                      />
                    </View>
                    <Text style={[styles.barDayText, b.pct > 0 && { color: colors.dark, fontWeight: "900" }]}>{b.day}</Text>
                    <Text style={[styles.barPctText, { color: col }]}>{b.pct}%</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Accuracy progress */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.cardHeadLeft}>
                <LinearGradient 
                  colors={palette === "color" ? [colors.teal, "#0EA5E9"] : [colors.primary, colors.primaryDark]} 
                  style={styles.cardHeadIcon}
                >
                  <Feather name="target" size={13} color="#fff" />
                </LinearGradient>
                <Text style={styles.cardTitle}>{t.progress.section_accuracy_overall}</Text>
              </View>
              <Text style={[styles.cardHint, { fontSize: 18, fontWeight: "900", color: colors.dark }]}>{accuracy}%</Text>
            </View>
            <View style={{ marginTop: 4 }}>
              <ProgressBar
                value={accuracy}
                color={accuracy >= 70 ? colors.teal : accuracy >= 40 ? colors.amber : colors.accent}
                height={10}
                backgroundColor={colors.border}
              />
            </View>
            <Text style={styles.progressSub}>{stats?.correctAnswers ?? 0} {t.progress.correct.toLowerCase()} · {wrong} {t.progress.wrong.toLowerCase()} · {stats?.totalAnswers ?? 0} {t.progress.total_answers.toLowerCase()}</Text>
          </View>

          {/* Activity Dot Matrix (Recent Performance) */}
          {recent.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.cardHeadLeft}>
                  <LinearGradient 
                    colors={palette === "color" ? [colors.purple, "#A855F7"] : [colors.primary, colors.primaryDark]} 
                    style={styles.cardHeadIcon}
                  >
                    <Feather name="grid" size={13} color="#fff" />
                  </LinearGradient>
                  <Text style={styles.cardTitle}>Performance Matrix</Text>
                </View>
                <Text style={styles.cardHint}>Last 21 Items</Text>
              </View>
              <View style={styles.dotMatrixWrap}>
                {recent.slice(0, 21).map((p, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dotCell,
                      { 
                        backgroundColor: p.isCorrect ? colors.teal : colors.accent,
                        shadowColor: p.isCorrect ? colors.teal : colors.accent,
                        opacity: 1 - (i * 0.03)
                      }
                    ]}
                  >
                    <View style={styles.dotInner} />
                  </View>
                ))}
              </View>
              <View style={styles.matrixFooter}>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={styles.legendRow}>
                    <View style={[styles.legendDotSmall, { backgroundColor: colors.teal }]} />
                    <Text style={styles.legendTxt}>Passed</Text>
                  </View>
                  <View style={styles.legendRow}>
                    <View style={[styles.legendDotSmall, { backgroundColor: colors.accent }]} />
                    <Text style={styles.legendTxt}>Failed</Text>
                  </View>
                </View>
                <Text style={styles.matrixStatus}>Consistency: {Math.round((recent.filter(r => r.isCorrect).length / recent.length) * 100)}%</Text>
              </View>
            </View>
          )}

          {/* ─── Activity Heatmap (35 days) ─── */}
          {(() => {
            const today = new Date();
            const days = Array.from({ length: 35 }, (_, i) => {
              const d = new Date(today);
              d.setDate(today.getDate() - (34 - i));
              const key = d.toISOString().slice(0, 10);
              const hasActivity = sessionLogs.some((l) => l.date?.slice(0, 10) === key);
              const isToday = key === today.toISOString().slice(0, 10);
              return { key, hasActivity, isToday, dayNum: d.getDate(), weekday: d.getDay() };
            });
            const cellSize = Math.floor((Math.min(width, 1100) - 40 - 12 * 7) / 7);
            return (
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={styles.cardHeadLeft}>
                    <LinearGradient colors={[colors.success, colors.emerald]} style={styles.cardHeadIcon}>
                      <Feather name="calendar" size={13} color="#fff" />
                    </LinearGradient>
                    <Text style={styles.cardTitle}>Activity History</Text>
                  </View>
                  <View style={styles.streakBadge}>
                    <Feather name="zap" size={10} color={colors.amber} />
                    <Text style={styles.streakText}>{stats?.streak ?? 0} DAYS</Text>
                  </View>
                </View>
                
                <View style={styles.calendarGrid}>
                  {["M","S","S","R","K","J","S"].map((d, i) => (
                    <Text key={i} style={styles.calendarDayHeader}>{d}</Text>
                  ))}
                  {days.map((d) => (
                    <View key={d.key} style={[
                      styles.calendarCell,
                      { width: cellSize, height: cellSize },
                      d.hasActivity && { backgroundColor: d.isToday ? colors.primary : colors.teal + "33", borderColor: d.isToday ? colors.primary : colors.teal, borderWidth: 1 },
                    ]}>
                      <Text style={[
                        styles.calendarCellText,
                        d.hasActivity && { color: d.isToday ? "#fff" : colors.teal, fontWeight: "900" },
                        d.isToday && !d.hasActivity && { color: colors.primary }
                      ]}>{d.dayNum}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.calendarFooter}>
                  <View style={styles.legendRow}><View style={[styles.legendSquare, { backgroundColor: colors.border }]} /><Text style={styles.legendTxt}>None</Text></View>
                  <View style={styles.legendRow}><View style={[styles.legendSquare, { backgroundColor: colors.teal, opacity: 0.3 }]} /><Text style={styles.legendTxt}>Studied</Text></View>
                  <View style={styles.legendRow}><View style={[styles.legendSquare, { backgroundColor: colors.primary }]} /><Text style={styles.legendTxt}>Today</Text></View>
                </View>
              </View>
            );
          })()}

          {/* Session History Link */}
          <TouchableOpacity activeOpacity={0.85} onPress={() => router.push("/session-history")} style={[styles.card, { flexDirection: "row", alignItems: "center", padding: 16, gap: 14 }]}>
            <LinearGradient 
              colors={palette === "color" ? [colors.teal, "#0EA5E9"] : [colors.primary, colors.primaryDark]} 
              style={{ width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" }}
            >
              <Feather name="list" size={18} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "800", color: colors.dark }}>Riwayat Sesi Belajar</Text>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>{sessionLogs.length} sesi tercatat · Tap untuk detail</Text>
            </View>
            <Feather name="chevron-right" size={15} color={colors.border} />
          </TouchableOpacity>

          {/* ─── Per-Topic Stats ─── */}
          {pathStats.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.cardHeadLeft}>
                  <LinearGradient 
                    colors={palette === "color" ? [colors.purple, "#A855F7"] : [colors.primary, colors.primaryDark]} 
                    style={styles.cardHeadIcon}
                  >
                    <Feather name="layers" size={13} color="#fff" />
                  </LinearGradient>
                  <Text style={styles.cardTitle}>Statistik Per Topik</Text>
                </View>
              </View>
              <View style={{ gap: 10 }}>
                {pathStats.map((ps, i) => {
                  const pct = ps.total > 0 ? Math.round((ps.correct / ps.total) * 100) : 0;
                  const barColor = pct >= 70 ? colors.teal : pct >= 40 ? colors.amber : colors.accent;
                  return (
                    <View key={ps.path.id}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.dark, flex: 1 }} numberOfLines={1}>{ps.path.name}</Text>
                        <Text style={{ fontSize: 13, fontWeight: "800", color: barColor, marginLeft: 8 }}>{pct}%</Text>
                      </View>
                      <ProgressBar value={pct} color={barColor} height={7} backgroundColor={colors.border} />
                      <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 3 }}>{ps.correct} benar · {ps.wrong} salah · {ps.total} total</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Activity Log */}
          {recent.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.cardHeadLeft}>
                  <LinearGradient 
                    colors={palette === "color" ? [colors.amber, colors.accent] : [colors.border, colors.border]} 
                    style={styles.cardHeadIcon}
                  >
                    <Feather name="clock" size={13} color="#fff" />
                  </LinearGradient>
                  <Text style={styles.cardTitle}>Recent Activity</Text>
                </View>
              </View>
              <View style={{ gap: 8 }}>
                {recent.slice(0, 8).map((p, i) => (
                  <View key={i} style={styles.modernLogRow}>
                    <View style={[styles.logIndicator, { backgroundColor: p.isCorrect ? (palette === "color" ? colors.teal : colors.primary) : (palette === "color" ? colors.accent : colors.textMuted) }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.logQuestion} numberOfLines={1}>
                        {p.flashcardId ? "Flashcard Review" : "Quiz Question"}
                      </Text>
                      <Text style={styles.logMeta}>
                        {new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {p.isCorrect ? "Correct" : "Incorrect"}
                      </Text>
                    </View>
                    <Feather name={p.isCorrect ? "check-circle" : "x-circle"} size={14} color={p.isCorrect ? (palette === "color" ? colors.teal : colors.primary) : (palette === "color" ? colors.accent : colors.textMuted)} />
                  </View>
                ))}
              </View>
            </View>
          )}

          {recent.length === 0 && (
            <LinearGradient 
              colors={palette === "color" ? ["#0A1628","#1A3066"] : [colors.white, colors.white]} 
              style={[styles.emptyGrad, palette !== "color" && { borderWidth: 1, borderColor: colors.border }]}
            >
              <View style={styles.hDot1} /><View style={styles.hDot2} />
              <Feather name="trending-up" size={40} color="rgba(74,158,255,0.6)" />
              <Text style={[styles.emptyTitle, palette !== "color" && { color: colors.dark }]}>{t.progress.tab_stats}</Text>
              <Text style={[styles.emptySub, palette !== "color" && { color: colors.textMuted }]}>{t.progress.section_accuracy7}</Text>
            </LinearGradient>
          )}

          {/* PDF Button */}
          <TouchableOpacity onPress={handleExportPDF} activeOpacity={0.85} style={{ borderRadius: 16, overflow: "hidden" }}>
            <LinearGradient 
              colors={palette === "color" ? ["#0A1628","#1A3066"] : [colors.primary, colors.primaryDark]} 
              start={{x:0,y:0}} end={{x:1,y:0}} 
              style={styles.pdfBigBtn}
            >
              <View style={styles.pdfBigIconWrap}>
                {pdfLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Feather name="file-text" size={20} color="#fff" />
                }
              </View>
              <View>
                <Text style={[styles.pdfBigTitle, palette !== "color" && { color: colors.dark }]}>Export Laporan PDF</Text>
                <Text style={[styles.pdfBigSub, palette !== "color" && { color: colors.textMuted }]}>Graph, heatmap, klasifikasi soal & log lengkap</Text>
              </View>
              <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.4)" style={{ marginLeft: "auto" }} />
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      )}

      {tab === "classify" && (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            isTablet && { maxWidth: 1100, alignSelf: "center", width: "100%", paddingHorizontal: 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary pills */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.cardHeadLeft}>
                <LinearGradient 
                  colors={palette === "color" ? [colors.purple, "#A855F7"] : [colors.primary, colors.primaryDark]} 
                  style={styles.cardHeadIcon}
                >
                  <Feather name="layers" size={13} color="#fff" />
                </LinearGradient>
                <Text style={styles.cardTitle}>Klasifikasi Otomatis</Text>
              </View>
            </View>
            <Text style={styles.classifyDesc}>{t.progress.section_difficulty}</Text>
            <View style={styles.diffSummaryRow}>
              {(["mudah","sedang","susah"] as const).map((d) => {
                const cfg = DIFF_CONFIG[d];
                const count = difficulty?.[d].length ?? 0;
                return (
                  <TouchableOpacity
                    key={d}
                    onPress={() => setActiveDiff(d)}
                    style={[styles.diffSummaryChip, { backgroundColor: cfg.bg, borderColor: activeDiff === d ? cfg.color : "transparent", borderWidth: 2 }]}
                    activeOpacity={0.75}
                  >
                    <Feather name={cfg.icon} size={16} color={cfg.color} />
                    <Text style={[styles.diffSummaryVal, { color: cfg.color }]}>{count}</Text>
                    <Text style={[styles.diffSummaryLbl, { color: cfg.color }]}>{diffLabels[d]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Active category list */}
          {(() => {
            const cfg = DIFF_CONFIG[activeDiff];
            const items = difficulty?.[activeDiff] ?? [];
            return (
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={styles.cardHeadLeft}>
                    <LinearGradient
                      colors={activeDiff === "mudah" 
                        ? (palette === "color" ? [colors.teal, "#0EA5E9"] : [colors.primary, colors.primaryDark])
                        : activeDiff === "sedang" 
                        ? (palette === "color" ? [colors.amber, colors.accent] : [colors.border, colors.border])
                        : [colors.accent, colors.danger]
                      }
                      style={styles.cardHeadIcon}
                    >
                      <Feather name={cfg.icon} size={13} color="#fff" />
                    </LinearGradient>
                    <Text style={styles.cardTitle}>{diffLabels[activeDiff]}</Text>
                  </View>
                  <Text style={[styles.cardHint, { color: cfg.color, fontWeight: "800" }]}>{items.length}</Text>
                </View>

                {items.length === 0 ? (
                  <View style={styles.diffEmpty}>
                    <Feather name={cfg.icon} size={32} color={cfg.color} />
                    <Text style={[styles.diffEmptyText, { color: cfg.color }]}>{diffLabels[activeDiff]}</Text>
                    <Text style={styles.diffEmptySub}>{t.progress.section_difficulty}</Text>
                  </View>
                ) : (
                  items.map((item, i) => (
                    <View key={item.id} style={[styles.classifyRow, i < items.length - 1 && styles.classifyRowBorder]}>
                      <View style={[styles.classifyTypeBadge, { backgroundColor: cfg.bg }]}>
                        <Feather name={item.type === "flashcard" ? "credit-card" : "help-circle"} size={12} color={cfg.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.classifyQ} numberOfLines={2}>{item.question}</Text>
                        <View style={styles.classifyMeta}>
                          <Text style={styles.classifyMetaText}>{item.attempts}× attempt</Text>
                          <Text style={styles.classifyMetaText}>·</Text>
                          <Text style={[styles.classifyAcc, { color: cfg.color }]}>{item.accuracy}% benar</Text>
                        </View>
                      </View>
                      <View style={[styles.accuracyPill, { backgroundColor: cfg.bg }]}>
                        <Text style={[styles.accuracyPillText, { color: cfg.color }]}>{item.accuracy}%</Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            );
          })()}
        </ScrollView>
      )}

      {tab === "prompts" && <PromptBuilder />}

      {/* ===== HIDDEN SHARE CARD (captured by react-native-view-shot) ===== */}
      <View
        ref={shareCardRef}
        collapsable={false}
        style={styles.shareCardWrap}
      >
        <LinearGradient 
          colors={palette === "color" ? ["#0F1F3D", "#1E3A5F"] : (isDark ? ["#000000", "#111111"] : ["#F8F9FA", "#E9ECEF"])} 
          style={styles.shareCard}
        >
          {/* Header */}
          <LinearGradient 
            colors={palette === "color" ? ["#4C6FFF", "#7C47FF"] : [colors.primary, colors.primaryDark]} 
            style={styles.shareBanner}
          >
            <Text style={styles.shareAppName}>📚 MobileLearning</Text>
            <Text style={styles.shareTagline}>Laporan Progres Belajar</Text>
          </LinearGradient>

          {/* User */}
          <View style={styles.shareUserRow}>
            <LinearGradient 
              colors={palette === "color" ? ["#4C6FFF", "#7C47FF"] : [colors.primary, colors.primaryDark]} 
              style={styles.shareAvatar}
            >
              <Text style={styles.shareAvatarText}>
                {(user?.name ?? "U").charAt(0).toUpperCase()}
              </Text>
            </LinearGradient>
            <View>
              <Text style={styles.shareUserName}>{user?.name ?? t.profile.header_title}</Text>
              <Text style={styles.shareUserLevel}>
                {user?.level === "beginner" ? t.progress.level_beginner : user?.level === "intermediate" ? t.progress.level_intermediate : t.progress.level_advanced}
                {user?.goal ? ` · ${user.goal}` : ""}
              </Text>
            </View>
          </View>

          {/* Big accuracy */}
          <View style={styles.shareAccRow}>
            <View style={styles.shareAccBox}>
              <Text style={styles.shareAccVal}>{accuracy}%</Text>
              <Text style={styles.shareAccLbl}>{t.progress.accuracy.toUpperCase()}</Text>
            </View>
            <View style={styles.shareStatGrid}>
              <View style={[styles.shareStatBox, { backgroundColor: colors.teal + "22" }]}>
                <Feather name="check-circle" size={16} color={colors.teal} />
                <Text style={[styles.shareStatVal, { color: colors.teal }]}>{stats?.correctAnswers ?? 0}</Text>
                <Text style={styles.shareStatLbl}>{t.progress.correct}</Text>
              </View>
              <View style={[styles.shareStatBox, { backgroundColor: "#FF6B6B22" }]}>
                <Feather name="x-circle" size={16} color="#FF6B6B" />
                <Text style={[styles.shareStatVal, { color: "#FF6B6B" }]}>{wrong}</Text>
                <Text style={styles.shareStatLbl}>{t.progress.wrong}</Text>
              </View>
              <View style={[styles.shareStatBox, { backgroundColor: "#4C6FFF22" }]}>
                <Feather name="book-open" size={16} color="#4C6FFF" />
                <Text style={[styles.shareStatVal, { color: "#4C6FFF" }]}>{stats?.totalAnswers ?? 0}</Text>
                <Text style={styles.shareStatLbl}>{t.progress.total_answers}</Text>
              </View>
              <View style={[styles.shareStatBox, { backgroundColor: "#FF950022" }]}>
                <Feather name="zap" size={16} color="#FF9500" />
                <Text style={[styles.shareStatVal, { color: "#FF9500" }]}>{stats?.streak ?? 0}</Text>
                <Text style={styles.shareStatLbl}>{t.progress.streak}</Text>
              </View>
            </View>
          </View>

          {/* Per-course */}
          {pathStats.length > 0 && (
            <View style={styles.shareCourseSect}>
              <Text style={styles.shareSectTitle}>Per Kursus</Text>
              {pathStats.slice(0, 4).map((ps, i) => {
                const pct = ps.total > 0 ? Math.round((ps.correct / ps.total) * 100) : 0;
                const g = SHARE_GRADS[i % SHARE_GRADS.length];
                return (
                  <View key={ps.path.id} style={styles.shareCourseRow}>
                    <LinearGradient colors={g} style={styles.shareCourseIcon}>
                      <Text style={{ fontSize: 12 }}>{ps.path.name.charAt(0).toUpperCase()}</Text>
                    </LinearGradient>
                    <Text style={styles.shareCourseName} numberOfLines={1}>{ps.path.name}</Text>
                    <Text style={[styles.shareCourseAcc, { color: pct >= 70 ? colors.teal : pct >= 40 ? "#FF9500" : "#FF6B6B" }]}>
                      {pct}%
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Footer */}
          <View style={styles.shareFooter}>
            <Text style={styles.shareFooterDate}>
              {new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
            </Text>
            <Text style={styles.shareFooterApp}>MobileLearning App</Text>
          </View>
        </LinearGradient>
      </View>
    </View>
  );
}

const makeStyles = (c: ColorScheme, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  headerGrad: { paddingHorizontal: 20, paddingBottom: 12, overflow: "hidden" },
  hDot1: { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.07)", top: -50, right: -50 },
  hDot2: { position: "absolute", width: 110, height: 110, borderRadius: 55, backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.05)", bottom: -20, left: 20 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  headerTitle: { fontSize: 24, fontWeight: "900", color: "#fff", letterSpacing: -0.5 },
  pdfBtn: { borderRadius: 12, overflow: "hidden" },
  pdfBtnGrad: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9 },
  pdfBtnText: { fontSize: 12, fontWeight: "800", color: "#fff" },
  barCol: { flex: 1, alignItems: "center", gap: 6 },
  barPctText: { fontSize: 8, fontWeight: "800", marginTop: 2 },
  barTrack: { width: "45%", height: 80, justifyContent: "flex-end", backgroundColor: c.background, borderRadius: 10, overflow: "hidden" },
  barFill: { width: "100%", borderRadius: 10 },
  barDayText: { fontSize: 10, color: c.textMuted, fontWeight: "700" },
  badgeCompact: { backgroundColor: "rgba(0,0,0,0.05)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeTextCompact: { fontSize: 10, fontWeight: "800", color: c.textSecondary, textTransform: "uppercase" },
  progressSub: { fontSize: 11, color: c.textMuted, fontWeight: "600" },
  
  dotMatrixWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", paddingVertical: 10, backgroundColor: "rgba(0,0,0,0.02)", borderRadius: 12, padding: 10 },
  dotCell: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 4 },
  dotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.8)" },
  matrixFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  matrixStatus: { fontSize: 11, fontWeight: "900", color: c.text, textTransform: "uppercase" },
  legendDotSmall: { width: 8, height: 8, borderRadius: 4 },
  
  calendarGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  calendarDayHeader: { textAlign: "center", fontSize: 10, fontWeight: "900", color: c.textMuted, marginBottom: 8, width: 34 },
  calendarCell: { borderRadius: 10, backgroundColor: c.border, alignItems: "center", justifyContent: "center", position: "relative" },
  calendarCellText: { fontSize: 10, fontWeight: "700", color: c.textMuted },
  cellDot: { position: "absolute", bottom: 4, width: 3, height: 3, borderRadius: 1.5, backgroundColor: c.teal },
  calendarFooter: { flexDirection: "row", gap: 15, marginTop: 15, justifyContent: "center" },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSquare: { width: 10, height: 10, borderRadius: 3 },
  legendTxt: { fontSize: 11, color: c.textMuted, fontWeight: "600" },
  streakBadge: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 4, 
    backgroundColor: c.primaryLight, 
    paddingHorizontal: 10, 
    paddingVertical: 4, 
    borderRadius: 20, 
    borderWidth: 1, 
    borderColor: c.primary + "33" 
  },
  streakText: { fontSize: 10, fontWeight: "900", color: c.primary },

  modernLogRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  logIndicator: { width: 4, height: 24, borderRadius: 2 },
  logQuestion: { fontSize: 14, fontWeight: "700", color: c.text },
  logMeta: { fontSize: 11, color: c.textMuted, fontWeight: "500", marginTop: 2 },

  heroRow: { flexDirection: "row", alignItems: "center", gap: 20, marginBottom: 20, paddingVertical: 10 },
  ringContainer: { width: 110, height: 110, alignItems: "center", justifyContent: "center" },
  ringOuter: { width: 106, height: 106, borderRadius: 53, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center", padding: 4 },
  ringGradient: { width: "100%", height: "100%", borderRadius: 53, alignItems: "center", justifyContent: "center" },
  ringInner: { width: 84, height: 84, borderRadius: 42, backgroundColor: "rgba(0,0,0,0.15)", alignItems: "center", justifyContent: "center" },
  ringGlow: { position: "absolute", width: 120, height: 120, borderRadius: 60, zIndex: -1 },
  ringVal: { fontSize: 22, fontWeight: "900", color: "#fff" },
  ringLbl: { fontSize: 8, color: "rgba(255,255,255,0.55)", fontWeight: "800", letterSpacing: 1 },
  
  statsPanel: { flex: 1, gap: 10 },
  statLine: { flexDirection: "row", gap: 10 },
  statMiniCard: { 
    flex: 1, 
    backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)", 
    borderRadius: 14, 
    padding: 12, 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 8, 
    borderWidth: 1, 
    borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" 
  },
  statMiniVal: { fontSize: 16, fontWeight: "900", color: c.white, lineHeight: 20 },
  statMiniLbl: { fontSize: 9, color: "rgba(255,255,255,0.55)", fontWeight: "700", textTransform: "uppercase" },
  tabStrip: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  tabItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 12 },
  tabItemActive: { borderBottomWidth: 2.5, borderBottomColor: "#fff" },
  tabItemText: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.4)" },
  tabItemTextActive: { color: "#fff" },
  scrollContent: { padding: 20, paddingBottom: 40, gap: 12 },
  card: { backgroundColor: c.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border, gap: 12 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardHeadLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardHeadIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 13, fontWeight: "800", color: c.text },
  cardHint: { fontSize: 11, color: c.textMuted, fontWeight: "600" },
  barChartWrap: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 110, paddingTop: 16 },
  barValText: { fontSize: 9, fontWeight: "800" as const, height: 12 },
  heatmapWrap: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6 },
  heatCell: { borderRadius: 5 },
  heatLegend: { flexDirection: "row", alignItems: "center", gap: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 11, color: c.textMuted, fontWeight: "600" },
  logRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9 },
  logRowBorder: { borderBottomWidth: 1, borderBottomColor: c.border },
  logDot: { width: 7, height: 7, borderRadius: 4 },
  logDate: { fontSize: 11, color: c.textMuted, fontWeight: "700", width: 50 },
  logResult: { fontSize: 12, fontWeight: "800", width: 60 },
  logAnswer: { flex: 1, fontSize: 11, color: c.textSecondary, fontWeight: "500" },
  emptyGrad: { borderRadius: 20, padding: 32, alignItems: "center", gap: 10, overflow: "hidden" },
  emptyTitle: { fontSize: 18, fontWeight: "900", color: "#fff" },
  emptySub: { fontSize: 13, color: "rgba(255,255,255,0.6)", fontWeight: "500", textAlign: "center", lineHeight: 20 },
  pdfBigBtn: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, padding: 18, overflow: "hidden" },
  pdfBigIconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  pdfBigTitle: { fontSize: 15, fontWeight: "900", color: "#fff" },
  pdfBigSub: { fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: "500", marginTop: 2 },
  classifyDesc: { fontSize: 12, color: c.textSecondary, fontWeight: "500", lineHeight: 18 },
  diffSummaryRow: { flexDirection: "row", gap: 10 },
  diffSummaryChip: { flex: 1, alignItems: "center", borderRadius: 14, paddingVertical: 12, gap: 4 },
  diffSummaryVal: { fontSize: 22, fontWeight: "900" },
  diffSummaryLbl: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  diffEmpty: { alignItems: "center", paddingVertical: 24, gap: 8 },
  diffEmptyText: { fontSize: 15, fontWeight: "800" },
  diffEmptySub: { fontSize: 12, color: c.textMuted, fontWeight: "500", textAlign: "center" },
  classifyRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11 },
  classifyRowBorder: { borderBottomWidth: 1, borderBottomColor: c.border },
  classifyTypeBadge: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  classifyQ: { fontSize: 13, fontWeight: "700", color: c.text, lineHeight: 19 },
  classifyMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  classifyMetaText: { fontSize: 11, color: c.textMuted, fontWeight: "600" },
  classifyAcc: { fontSize: 11, fontWeight: "800" },
  accuracyPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  accuracyPillText: { fontSize: 12, fontWeight: "900" },

  // Share card (hidden off-screen, captured by react-native-view-shot)
  shareCardWrap: {
    position: "absolute",
    left: -9999,
    top: 0,
    width: 360,
  },
  shareCard: { borderRadius: 24, overflow: "hidden" },
  shareBanner: { paddingHorizontal: 20, paddingVertical: 16, alignItems: "center" },
  shareAppName: { fontSize: 18, fontWeight: "900", color: "#fff", letterSpacing: -0.3 },
  shareTagline: { fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: "600", marginTop: 2 },
  shareUserRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  shareAvatar: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  shareAvatarText: { fontSize: 22, fontWeight: "900", color: c.white },
  shareUserName: { fontSize: 17, fontWeight: "900", color: c.white },
  shareUserLevel: { fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: "600", marginTop: 2 },
  shareAccRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingBottom: 16 },
  shareAccBox: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center", justifyContent: "center",
  },
  shareAccVal: { fontSize: 28, fontWeight: "900", color: c.white },
  shareAccLbl: { fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: "700", textTransform: "uppercase" },
  shareStatGrid: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  shareStatBox: { width: "46%", borderRadius: 12, padding: 10, alignItems: "center", gap: 2 },
  shareStatVal: { fontSize: 18, fontWeight: "900" },
  shareStatLbl: { fontSize: 9, color: "rgba(255,255,255,0.55)", fontWeight: "700", textTransform: "uppercase" },
  shareCourseSect: { paddingHorizontal: 20, paddingBottom: 16 },
  shareSectTitle: { fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: "800", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 },
  shareCourseRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  shareCourseIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  shareCourseName: { flex: 1, fontSize: 13, fontWeight: "700", color: "#fff" },
  shareCourseAcc: { fontSize: 13, fontWeight: "900" },
  shareFooter: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)",
  },
  shareFooterDate: { fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: "600" },
  shareFooterApp: { fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: "700" },
});
