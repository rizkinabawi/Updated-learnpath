import { useColors, useTheme } from "@/contexts/ThemeContext";
import React, { useCallback, useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getLearningPaths, getModules, getLessons,
  getFlashcards, getQuizzes, getNotes, getStudyMaterials,
  saveModule, saveLesson, deleteModule, deleteLesson,
  generateId, getCompletedLessons, setLessonCompleted,
  type LearningPath, type Module, type Lesson,
} from "@/utils/storage";
import * as LucideIcons from "lucide-react-native";
import { type ColorScheme } from "@/constants/colors";
import { useTranslation } from "@/contexts/LanguageContext";
import { exportCourseCertificate } from "@/utils/flashcard-export";
import { getUser } from "@/utils/storage";
import { printHtml } from "@/utils/print-compat";
import { isFeatureAllowed } from "@/utils/security/app-license";

const makeGradPalette = (colors: ColorScheme): [string, string][] => [
  [colors.primary, colors.purple],
  [colors.accent, colors.amber],
  [colors.teal, "#0EA5E9"],
  [colors.purple, "#A855F7"],
  [colors.emerald, colors.success],
];
const COURSE_ICONS = [
  "Book", "Code", "Globe", "Cpu", "Layers", "Award", "Compass", "Music", "Camera", "Clock", "Video", "Zap", "Star", "Heart", "Anchor", "Cloud", "Sun", "Moon", "Terminal"
];
const MOD_ICONS = [
  "Bookmark", "Brain", "Palette", "Globe", "Beaker", "Rocket", "Lightbulb", "PenTool", "Target", "Flame", "Rainbow", "Star", "Briefcase", "Wrench", "Smartphone", "Monitor"
];

type ModCounts = { fc: number; qz: number; nt: number; mt: number };

export default function CourseDetailPage() {
  const { isDark, palette } = useTheme();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  const GRAD_PALETTE = useMemo(() => makeGradPalette(colors), [colors]);

  // Helper to render lucide icon if exist
  const DynamicIcon = ({ name, size, color }: { name: string; size: number; color: string }) => {
    const Icon = (LucideIcons as any)[name] || LucideIcons.HelpCircle;
    return <Icon size={size} color={color} />;
  };

  const { pathId } = useLocalSearchParams<{ pathId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 720;

  const [path, setPath] = useState<LearningPath | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Record<string, Lesson[]>>({});
  const [counts, setCounts] = useState<Record<string, ModCounts>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [completions, setCompletions] = useState<string[]>([]);

  const { t } = useTranslation();
  const [showNewModule, setShowNewModule] = useState(false);
  const [showNewLesson, setShowNewLesson] = useState(false);
  const [showEditCourse, setShowEditCourse] = useState(false);
  const [editModId, setEditModId] = useState<string | null>(null);
  const [editLessonId, setEditLessonId] = useState<string | null>(null);

  const [pathName, setPathName] = useState("");
  const [pathDesc, setPathDesc] = useState("");
  const [pathIcon, setPathIcon] = useState("Book");
  const [modName, setModName] = useState("");
  const [modIcon, setModIcon] = useState("Bookmark");
  const [lessonName, setLessonName] = useState("");
  const [lessonDesc, setLessonDesc] = useState("");
  const [lessonIcon, setLessonIcon] = useState("PenTool");
  const [targetMod, setTargetMod] = useState<string | null>(null);
  const [showEditTarget, setShowEditTarget] = useState(false);
  const [targetDateInput, setTargetDateInput] = useState("");
  const [targetDailyMin, setTargetDailyMin] = useState("30");

  const loadData = async () => {
    if (!pathId) return;
    const paths = await getLearningPaths();
    const found = paths.find((p) => p.id === pathId);
    setPath(found ?? null);

    const mods = (await getModules(pathId)).sort((a, b) => a.order - b.order);
    setModules(mods);

    const lMap: Record<string, Lesson[]> = {};
    const cMap: Record<string, ModCounts> = {};
    for (const mod of mods) {
      const ls = (await getLessons(mod.id)).sort((a, b) => a.order - b.order);
      lMap[mod.id] = ls;
      let fc = 0, qz = 0, nt = 0, mt = 0;
      for (const l of ls) {
        fc += (await getFlashcards(l.id)).length;
        qz += (await getQuizzes(l.id)).length;
        nt += (await getNotes(l.id)).length;
        mt += (await getStudyMaterials(l.id)).length;
      }
      cMap[mod.id] = { fc, qz, nt, mt };
    }
    setLessons(lMap);
    setCounts(cMap);
    setCompletions(await getCompletedLessons());
  };

  const updateCourse = async () => {
    if (!pathName.trim() || !path) return;
    const { saveLearningPath } = await import("@/utils/storage");
    await saveLearningPath({ ...path, name: pathName.trim(), description: pathDesc.trim(), icon: pathIcon });
    setShowEditCourse(false);
    loadData();
  };

  const handleEditCourse = () => {
    if (!path) return;
    setPathName(path.name);
    setPathDesc(path.description);
    setPathIcon(path.icon || "Book");
    setShowEditCourse(true);
  };

  const handleEditModule = (mod: Module) => {
    setEditModId(mod.id);
    setModName(mod.name);
    setModIcon(mod.icon || "Bookmark");
    setShowNewModule(true);
  };

  const handleEditTarget = () => {
    if (!path) return;
    setTargetDateInput(path.targetDate ? new Date(path.targetDate).toISOString().split('T')[0] : "");
    setTargetDailyMin(path.targetDailyMinutes?.toString() || "30");
    setShowEditTarget(true);
  };

  const saveTarget = async () => {
    if (!path) return;
    const { saveLearningPath } = await import("@/utils/storage");
    const tDate = targetDateInput ? new Date(targetDateInput).toISOString() : undefined;
    await saveLearningPath({ 
      ...path, 
      targetDate: tDate, 
      targetDailyMinutes: parseInt(targetDailyMin) || 0 
    });
    setShowEditTarget(false);
    loadData();
  };

  const handleEditLesson = (lesson: Lesson, modId: string) => {
    setEditLessonId(lesson.id);
    setTargetMod(modId);
    setLessonName(lesson.name);
    setLessonDesc(lesson.description);
    setLessonIcon(lesson.icon || "PenTool");
    setShowNewLesson(true);
  };

  useFocusEffect(useCallback(() => { loadData(); }, [pathId]));

  const createModule = async () => {
    if (!modName.trim() || !pathId) return;
    const m: Module = {
      id: editModId ?? generateId(), 
      pathId,
      name: modName.trim(), 
      description: modules.find(x => x.id === editModId)?.description ?? "",
      icon: modIcon,
      order: editModId ? (modules.find(x => x.id === editModId)?.order ?? 0) : modules.length, 
      createdAt: modules.find(x => x.id === editModId)?.createdAt ?? new Date().toISOString(),
    };
    await saveModule(m);
    setModName(""); setModIcon("Bookmark"); setEditModId(null); setShowNewModule(false);
    loadData();
  };

  const createLesson = async () => {
    if (!lessonName.trim() || !targetMod) return;
    const existing = lessons[targetMod]?.find(l => l.id === editLessonId);
    const l: Lesson = {
      id: editLessonId ?? generateId(), 
      moduleId: targetMod,
      name: lessonName.trim(), 
      description: lessonDesc.trim(),
      icon: lessonIcon,
      order: editLessonId ? (existing?.order ?? 0) : (lessons[targetMod] ?? []).length,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    await saveLesson(l);
    setLessonName(""); setLessonDesc(""); setLessonIcon("PenTool"); setEditLessonId(null); setShowNewLesson(false);
    loadData();
  };

  const handleDeleteModule = (mod: Module) => {
    Alert.alert(
      t.course.delete_mod_title,
      t.course.delete_mod_msg(mod.name),
      [
        { text: t.common.cancel, style: "cancel" },
        { text: t.common.delete, style: "destructive", onPress: async () => { await deleteModule(mod.id); loadData(); } },
      ]
    );
  };

  const handleDeleteLesson = (lesson: Lesson) => {
    Alert.alert(
      t.course.delete_lesson_title,
      t.course.delete_lesson_msg(lesson.name),
      [
        { text: t.common.cancel, style: "cancel" },
        { text: t.common.delete, style: "destructive", onPress: async () => { await deleteLesson(lesson.id); loadData(); } },
      ]
    );
  };

  const toggleExpand = (modId: string) =>
    setExpanded((prev) => ({ ...prev, [modId]: !prev[modId] }));

  const toggleComplete = async (lessonId: string) => {
    const isDone = completions.includes(lessonId);
    await setLessonCompleted(lessonId, !isDone);
    setCompletions(await getCompletedLessons());
  };

  const courseProgress = useMemo(() => {
    let total = 0;
    let done = 0;
    Object.values(lessons).forEach(list => {
      total += list.length;
      list.forEach(l => {
        if (completions.includes(l.id)) done++;
      });
    });

    // Calculate target status
    let status = "relaxed"; // relaxed, ontract, behind
    let daysLeft = 0;
    let lessonsPerDay = 0;

    if (path?.targetDate && total > done) {
      const target = new Date(path.targetDate);
      const remaining = total - done;
      const today = new Date();
      const diffTime = target.getTime() - today.getTime();
      daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (daysLeft > 0) {
        lessonsPerDay = Math.ceil(remaining / daysLeft);
        // Assuming user should finish at least 1 lesson per day if deadline is tight
        status = lessonsPerDay > 2 ? "behind" : "ontrack";
      } else {
        status = "overdue";
      }
    }

    return { done, total, pct: total > 0 ? (done / total) : 0, status, daysLeft, lessonsPerDay };
  }, [lessons, completions, path]);

  const handleClaimCertificate = async () => {
    try {
      const user = await getUser();
      await exportCourseCertificate(user?.name || "Lulusan LearnPath", path?.name || "Kursus Tanpa Nama");
    } catch (e) {
      Alert.alert("Gagal", "Terjadi kesalahan saat membuat sertifikat.");
    }
  };

  const handleDownloadReport = async () => {
    if (!path) return;
    
    const allowed = await isFeatureAllowed("bundle");
    if (!allowed) {
      Alert.alert(
        "Fitur Premium",
        "Laporan Belajar lengkap hanya tersedia di versi Premium (Full Activation).",
        [{ text: "OK" }]
      );
      return;
    }

    try {
      const user = await getUser();
      const userName = user?.name || "Pelajar LearnPath";
      
      let reportHtml = `
        <html>
          <head>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap');
              body { font-family: 'Plus Jakarta Sans', 'Helvetica', sans-serif; padding: 0; margin: 0; color: #1e293b; background: #fff; }
              .page { padding: 50px; }
              .header-bg { background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%); padding: 60px 50px; color: #fff; border-bottom-right-radius: 60px; }
              .header-bg h1 { margin: 0; font-size: 36px; font-weight: 800; letter-spacing: -1px; }
              .header-bg p { opacity: 0.8; margin-top: 10px; font-size: 16px; }
              
              .container { padding: 40px 50px; }
              .summary-cards { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: -50px; }
              .card { background: #fff; padding: 25px; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: center; border: 1px solid #f1f5f9; }
              .card-val { display: block; font-size: 24px; font-weight: 800; color: #4338ca; }
              .card-label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-top: 5px; letter-spacing: 1px; }

              .section-title { font-size: 20px; font-weight: 800; color: #1e293b; margin-top: 40px; margin-bottom: 20px; display: flex; align-items: center; }
              .section-title::after { content: ''; flex: 1; height: 2px; background: #f1f5f9; margin-left: 15px; }

              .mod-block { margin-bottom: 30px; }
              .mod-header { background: #f8fafc; padding: 15px 20px; border-radius: 12px; font-weight: 800; color: #4338ca; border-left: 4px solid #6366f1; margin-bottom: 10px; }
              .lesson-item { display: flex; align-items: center; padding: 12px 20px; border-radius: 10px; margin-bottom: 5px; background: #fff; border: 1px solid #f8fafc; }
              .status-icon { width: 20px; height: 20px; border-radius: 50%; margin-right: 15px; display: flex; align-items: center; justify-content: center; font-size: 12px; }
              .status-done { background: #dcfce7; color: #16a34a; }
              .status-todo { background: #f1f5f9; color: #94a3b8; }
              .lesson-txt { flex: 1; font-size: 14px; font-weight: 600; color: #334155; }
              
              .footer { text-align: center; margin-top: 80px; padding: 40px; border-top: 1px solid #f1f5f9; color: #94a3b8; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="header-bg">
              <h1>Laporan Belajar</h1>
              <p>${path.name}</p>
              <div style="margin-top: 20px; font-size: 13px; opacity: 0.9;">
                <b>Siswa:</b> ${userName} &nbsp; | &nbsp; <b>Tanggal:</b> ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>

            <div class="container">
              <div class="summary-cards">
                <div class="card">
                  <span class="card-val">${Math.round(courseProgress.pct * 100)}%</span>
                  <span class="card-label">Sertifikasi</span>
                </div>
                <div class="card">
                  <span class="card-val">${courseProgress.done}</span>
                  <span class="card-label">Materi Selesai</span>
                </div>
                <div class="card">
                  <span class="card-val">${courseProgress.total}</span>
                  <span class="card-label">Total Materi</span>
                </div>
              </div>

              <div class="section-title">Detail Kurikulum</div>
              ${modules.map(mod => {
                const modL = lessons[mod.id] || [];
                return `
                  <div class="mod-block">
                    <div class="mod-header">${mod.name}</div>
                    ${modL.map(l => {
                      const isDone = completions.includes(l.id);
                      return `
                        <div class="lesson-item">
                          <div class="status-icon ${isDone ? 'status-done' : 'status-todo'}">${isDone ? '✓' : ''}</div>
                          <div class="lesson-txt">${l.name}</div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                `;
              }).join('')}

              <div class="footer">
                <img src="https://cdn-icons-png.flaticon.com/512/3135/3135715.png" width="30" style="margin-bottom: 10px; opacity: 0.5;" /><br/>
                Dokumen Resmi LearnPath Premium Edition<br/>
                &copy; ${new Date().getFullYear()} Antigravity Learning Intelligence
              </div>
            </div>
          </body>
        </html>
      `;

      await printHtml(reportHtml, { dialogTitle: "Laporan Kursus" });
    } catch (e) {
      Alert.alert("Gagal", "Terjadi kesalahan saat mengekspor laporan.");
    }
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <LinearGradient
        colors={(palette === "minimal" && isDark) ? [colors.primaryLight, colors.background] : [colors.primary, colors.purple]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: Platform.OS === "web" ? 56 : insets.top + 10 }]}
      >
        <View style={styles.hdot1} />
        <View style={styles.hdot2} />
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <LucideIcons.ArrowLeft size={20} color={colors.white} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerSub}>{t.course.header_sub}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[styles.headerTitle, { flex: 1 }]} numberOfLines={1}>{path?.name ?? "..."}</Text>
              <TouchableOpacity onPress={handleEditCourse} style={styles.miniEditBtn}>
                <LucideIcons.Edit2 size={12} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => setShowNewModule(true)}
            style={styles.addBtn}
            activeOpacity={0.8}
          >
            <LinearGradient colors={["rgba(255,255,255,0.3)", "rgba(255,255,255,0.15)"]} style={styles.addGrad}>
              <LucideIcons.Plus size={20} color={colors.white} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
        {!!path?.description && (
          <Text style={styles.headerDesc} numberOfLines={2}>{path.description}</Text>
        )}

        {/* PROGRESS BAR */}
        <View style={styles.progContainer}>
          <View style={styles.progHeader}>
            <Text style={styles.progLabel}>Progres Belajar</Text>
            <Text style={styles.progVal}>{Math.round(courseProgress.pct * 100)}%</Text>
          </View>
          <View style={styles.progTrack}>
            <View style={[styles.progFill, { width: `${courseProgress.pct * 100}%` }]} />
          </View>
          <Text style={styles.progSub}>
            {courseProgress.done} dari {courseProgress.total} materi selesai
          </Text>
          
          <View style={styles.targetRow}>
            {path?.targetDate ? (
              <TouchableOpacity onPress={handleEditTarget} style={styles.targetStatusInfo}>
                <LucideIcons.Calendar size={12} color="#fff" />
                <Text style={styles.targetStatusText}>
                  Target: {new Date(path.targetDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} 
                  {courseProgress.status === "behind" && " • Perlu Kejar!"}
                  {courseProgress.status === "ontrack" && " • On Track"}
                  {courseProgress.status === "overdue" && " • Lewat Target!"}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={handleEditTarget} style={styles.setTargetBtn}>
                <LucideIcons.Target size={12} color="#fff" />
                <Text style={styles.targetStatusText}>Atur Target Selesai</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity 
              onPress={handleDownloadReport}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}
            >
              <LucideIcons.FileDown size={14} color="#fff" />
              <Text style={styles.downloadReportText}>Laporan</Text>
            </TouchableOpacity>
          </View>
        </View>

        {courseProgress.pct === 1 && courseProgress.total > 0 && (
          <TouchableOpacity 
            style={styles.certClaimCard} 
            onPress={handleClaimCertificate}
            activeOpacity={0.85}
          >
            <LinearGradient colors={["#F59E0B", "#D97706"]} style={styles.certClaimGrad} start={{x:0,y:0}} end={{x:1,y:1}}>
              <LucideIcons.Award size={20} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={styles.certClaimTitle}>Kursus Selesai!</Text>
                <Text style={styles.certClaimSub}>Klik untuk klaim Sertifikat Kelulusan Anda</Text>
              </View>
              <LucideIcons.ChevronRight size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        )}
      </LinearGradient>

      {/* MODULE LIST */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          isTablet && { maxWidth: 1100, alignSelf: "center", width: "100%" },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {modules.length === 0 && (
          <TouchableOpacity
            onPress={() => setShowNewModule(true)}
            style={styles.emptyModBtn}
            activeOpacity={0.8}
          >
            <LucideIcons.PlusCircle size={18} color={colors.primary} />
            <Text style={styles.emptyModText}>{t.course.empty_mod}</Text>
          </TouchableOpacity>
        )}

        <View style={isTablet ? styles.tabletGrid : undefined}>
          {modules.map((mod, mi) => {
            const isExpanded = !!expanded[mod.id];
            const modLessons = lessons[mod.id] ?? [];
            const cnt = counts[mod.id] ?? { fc: 0, qz: 0, nt: 0, mt: 0 };
            const grad = GRAD_PALETTE[mi % GRAD_PALETTE.length];
            const iconName = mod.icon || MOD_ICONS[mi % MOD_ICONS.length];

            return (
              <View key={mod.id} style={[styles.moduleCard, isTablet && styles.moduleCardTablet]}>
                {/* Module header row */}
                <TouchableOpacity
                  onPress={() => toggleExpand(mod.id)}
                  style={styles.moduleHeader}
                  activeOpacity={0.7}
                >
                  <LinearGradient colors={grad} style={styles.modIconGrad}>
                    <DynamicIcon name={iconName} size={18} color="#fff" />
                  </LinearGradient>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.moduleName} numberOfLines={1}>{mod.name}</Text>
                    <View style={styles.moduleMetaRow}>
                      <MetaChip label={t.course.meta_cards(cnt.fc)} />
                      <MetaChip label={t.course.meta_quiz(cnt.qz)} />
                      <MetaChip label={t.course.meta_notes(cnt.nt)} color={colors.primary} bg="#EEF0FF" />
                      <MetaChip label={t.course.meta_material(cnt.mt)} color={colors.purple} bg={colors.purpleLight} />
                    </View>
                  </View>

                  <View style={styles.moduleActionRow}>
                    <TouchableOpacity
                      onPress={() => handleEditModule(mod)}
                      style={[styles.moduleActionBtn, { backgroundColor: colors.primaryLight }]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <LucideIcons.Edit3 size={13} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteModule(mod)}
                      style={styles.moduleActionBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <LucideIcons.Trash2 size={13} color={colors.danger} />
                    </TouchableOpacity>
                  </View>

                  <LucideIcons.ChevronDown
                    size={16} color={colors.textMuted}
                    style={isExpanded && { transform: [{ rotate: "180deg" }] }}
                  />
                </TouchableOpacity>

                {/* Lessons */}
                {isExpanded && (
                  <View style={styles.lessonList}>
                    {modLessons.map((lesson, li) => (
                      <View key={lesson.id} style={styles.lessonRow}>
                        <LinearGradient colors={grad} style={styles.lessonNum}>
                          {lesson.icon ? (
                            <DynamicIcon name={lesson.icon} size={12} color="#fff" />
                          ) : (
                            <Text style={styles.lessonNumText}>{li + 1}</Text>
                          )}
                        </LinearGradient>
                        
                        <TouchableOpacity 
                          style={{ flex: 1, minWidth: 0 }}
                          onPress={() => router.push({ pathname: "/learning/[lessonId]", params: { lessonId: lesson.id } })}
                        >
                          <View style={styles.lessonTitleRow}>
                            <TouchableOpacity 
                              onPress={() => toggleComplete(lesson.id)}
                              style={[
                                styles.checkCircle, 
                                completions.includes(lesson.id) && { backgroundColor: isDark ? colors.surface : "#fff", borderColor: isDark ? colors.surface : "#fff" }
                              ]}
                            >
                              {completions.includes(lesson.id) && (
                                <LucideIcons.Check size={10} color={grad[0]} />
                              )}
                            </TouchableOpacity>
                            <Text 
                              style={[
                                styles.lessonName, 
                                { flex: 1 },
                                completions.includes(lesson.id) && { textDecorationLine: "line-through", opacity: 0.6 }
                              ]} 
                              numberOfLines={1}
                            >
                              {lesson.name}
                            </Text>
                            <TouchableOpacity
                              onPress={() => handleEditLesson(lesson, mod.id)}
                              style={[styles.lessonActionBtn, { backgroundColor: colors.primaryLight, marginRight: 6 }]}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <LucideIcons.Edit3 size={12} color={colors.primary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleDeleteLesson(lesson)}
                              style={styles.lessonActionBtn}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <LucideIcons.Trash2 size={12} color={colors.danger} />
                            </TouchableOpacity>
                          </View>
                          {!!lesson.description && (
                            <Text style={[styles.lessonDesc, { paddingLeft: 34 }, completions.includes(lesson.id) && { opacity: 0.6 }]} numberOfLines={1}>
                              {lesson.description}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    ))}

                    <TouchableOpacity
                      style={styles.addLessonRow}
                      onPress={() => { setTargetMod(mod.id); setShowNewLesson(true); }}
                    >
                      <Feather name="plus-circle" size={14} color={colors.primary} />
                      <Text style={styles.addLessonText}>{t.course.add_lesson}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {modules.length > 0 && (
          <TouchableOpacity style={styles.addModBtn} onPress={() => setShowNewModule(true)}>
            <Feather name="plus" size={15} color={colors.primary} />
            <Text style={styles.addModText}>{t.course.add_mod_btn}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* MODALS */}
      {[
        {
          vis: showNewModule, title: editModId ? "Edit Modul" : t.course.new_module_modal,
          close: () => { setShowNewModule(false); setModName(""); setModIcon("📘"); setEditModId(null); }, save: createModule,
          body: (
            <>
              <TextInput
                placeholder="Nama modul" value={modName}
                onChangeText={setModName} style={styles.mInput}
                placeholderTextColor={colors.textMuted} autoFocus
              />
              <Text style={styles.mLabel}>Pilih Ikon Modul</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconGrid}>
                {MOD_ICONS.map(i => (
                  <TouchableOpacity key={i} onPress={() => setModIcon(i)} style={[styles.iconPick, modIcon === i && styles.iconPickActive]}>
                    <DynamicIcon name={i} size={18} color={modIcon === i ? colors.primary : colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ),
        },
        {
          vis: showNewLesson, title: editLessonId ? "Edit Pelajaran" : t.course.new_lesson_modal,
          close: () => { setShowNewLesson(false); setLessonName(""); setLessonDesc(""); setLessonIcon("PenTool"); setEditLessonId(null); }, save: createLesson,
          body: (
            <>
              <TextInput
                placeholder="Nama pelajaran" value={lessonName}
                onChangeText={setLessonName} style={styles.mInput}
                placeholderTextColor={colors.textMuted} autoFocus
              />
              <TextInput
                placeholder="Deskripsi (opsional)" value={lessonDesc}
                onChangeText={setLessonDesc} style={styles.mInput}
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.mLabel}>Pilih Ikon Pelajaran</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconGrid}>
                {MOD_ICONS.map(i => (
                  <TouchableOpacity key={i} onPress={() => setLessonIcon(i)} style={[styles.iconPick, lessonIcon === i && styles.iconPickActive]}>
                    <DynamicIcon name={i} size={18} color={lessonIcon === i ? colors.primary : colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ),
        },
        {
          vis: showEditCourse, title: "Edit Detail Kursus",
          close: () => setShowEditCourse(false), save: updateCourse,
          body: (
            <>
              <TextInput
                placeholder="Nama kursus" value={pathName}
                onChangeText={setPathName} style={styles.mInput}
                placeholderTextColor={colors.textMuted} autoFocus
              />
              <TextInput
                placeholder="Deskripsi kursus" value={pathDesc}
                onChangeText={setPathDesc} style={[styles.mInput, { height: 100 }]}
                placeholderTextColor={colors.textMuted} multiline
              />
              <Text style={styles.mLabel}>Pilih Ikon Kursus</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconGrid}>
                {COURSE_ICONS.map(i => (
                  <TouchableOpacity key={i} onPress={() => setPathIcon(i)} style={[styles.iconPick, pathIcon === i && styles.iconPickActive]}>
                    <DynamicIcon name={i} size={18} color={pathIcon === i ? colors.primary : colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ),
        },
        {
          vis: showEditTarget, title: "Target Belajar",
          close: () => setShowEditTarget(false), save: saveTarget,
          body: (
            <>
              <Text style={styles.mLabel}>Tanggal Target Selesai (YYYY-MM-DD)</Text>
              <TextInput
                placeholder="Contoh: 2024-12-31" value={targetDateInput}
                onChangeText={setTargetDateInput} style={styles.mInput}
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.mLabel}>Target Durasi Belajar (Menit/Hari)</Text>
              <TextInput
                placeholder="Menit" value={targetDailyMin}
                onChangeText={setTargetDailyMin} style={styles.mInput}
                keyboardType="numeric"
                placeholderTextColor={colors.textMuted}
              />
              <View style={styles.calloutTarget}>
                <LucideIcons.Info size={14} color={colors.primary} />
                <Text style={styles.calloutTargetText}>
                  Sistem akan menghitung beban belajar harian agar Anda selesai tepat waktu.
                </Text>
              </View>
            </>
          ),
        },
      ].map((m) => (
        <Modal key={m.title} visible={m.vis} transparent animationType="slide">
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <View style={styles.mOverlay}>
              <View style={styles.mBox}>
                <Text style={styles.mTitle}>{m.title}</Text>
                {m.body}
                <View style={styles.mBtns}>
                  <TouchableOpacity onPress={m.close} style={styles.mBtnCancel}>
                    <Text style={styles.mBtnCancelText}>{t.common.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={m.save} style={styles.mBtnOk}>
                    <LinearGradient colors={[colors.primary, colors.purple]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.mBtnOkGrad}>
                      <Text style={styles.mBtnOkText}>{t.common.save}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ))}
    </View>
  );
}

function MetaChip({ label, color, bg }: { label: string; color?: string; bg?: string }) {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  return (
    <View style={[styles.metaChip, bg ? { backgroundColor: bg } : undefined]}>
      <Text style={[styles.metaChipText, color ? { color } : undefined]}>{label}</Text>
    </View>
  );
}

function ActionPill({
  label, icon, bg, border, textColor, onPress,
}: {
  label: string; icon?: React.ComponentProps<typeof Feather>["name"];
  bg: string; border?: string; textColor?: string;
  onPress: () => void;
}) {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.actionPill, { backgroundColor: bg }, border ? { borderWidth: 1, borderColor: border } : undefined]}
      activeOpacity={0.75}
    >
      {icon && <Feather name={icon} size={10} color={textColor ?? colors.text} />}
      <Text style={[styles.actionPillText, textColor ? { color: textColor } : undefined]}>{label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (c: ColorScheme, isDark: boolean, palette: string) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },

  header: { paddingHorizontal: 20, paddingBottom: 18, overflow: "hidden" },
  hdot1: { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.06)", top: -50, right: -40 },
  hdot2: { position: "absolute", width: 110, height: 110, borderRadius: 55, backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.05)", bottom: -20, right: 70 },
  headerRow: { flexDirection: "row", alignItems: "center" },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  headerSub: { fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: "700", letterSpacing: 1.5 },
  headerTitle: { fontSize: 22, fontWeight: "900", color: "#fff", letterSpacing: -0.3 },
  miniEditBtn: {
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  headerDesc: { fontSize: 13, color: "rgba(255,255,255,0.65)", fontWeight: "500", marginTop: 6 },
  
  progContainer: { marginTop: 12, gap: 6 },
  progHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progLabel: { fontSize: 11, fontWeight: "800", color: "#fff", textTransform: "uppercase", opacity: 0.8 },
  progVal: { fontSize: 12, fontWeight: "900", color: "#fff" },
  progTrack: { height: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 3, overflow: "hidden" },
  progFill: { height: "100%", backgroundColor: (palette === "minimal" && isDark) ? c.primary : "#fff", borderRadius: 3 },
  progSub: { fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: "600" },
  downloadReportText: { fontSize: 11, fontWeight: "800", color: "#fff" },
  targetRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  targetStatusInfo: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 6, paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 8,
  },
  setTargetBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 6, paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.2)", borderRadius: 8,
  },
  targetStatusText: { fontSize: 11, fontWeight: "800", color: "#fff" },
  calloutTarget: { 
    flexDirection: "row", gap: 10, padding: 12, 
    backgroundColor: c.primaryLight, borderRadius: 12, marginTop: 10 
  },
  calloutTargetText: { fontSize: 12, color: c.primary, fontWeight: "600", flex: 1, lineHeight: 18 },

  addBtn: { borderRadius: 13, overflow: "hidden" },
  addGrad: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  tabletGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },

  emptyModBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 20, borderRadius: 16,
    borderWidth: 2, borderColor: c.primary, borderStyle: "dashed",
    backgroundColor: c.primaryLight, marginBottom: 12,
  },
  emptyModText: { fontSize: 14, fontWeight: "700", color: c.primary },

  moduleCard: {
    backgroundColor: c.surface, borderRadius: 18, marginBottom: 10,
    overflow: "hidden", borderWidth: 1, borderColor: c.border,
  },
  moduleCardTablet: { width: "48.5%", marginBottom: 0 },
  moduleHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  modIconGrad: { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  moduleName: { fontSize: 15, fontWeight: "800", color: c.text, marginBottom: 5 },
  moduleMetaRow: { flexDirection: "row", gap: 4, flexWrap: "wrap", marginTop: 2 },
  metaChip: { backgroundColor: c.background, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: c.border },
  metaChipText: { fontSize: 9, fontWeight: "800", color: c.textMuted, textTransform: "uppercase" },
  moduleActionRow: { flexDirection: "row", gap: 8, alignItems: "center", marginLeft: 4 },
  moduleActionBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: c.background, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: c.border,
  },

  lessonList: { borderTopWidth: 1, borderTopColor: c.border, paddingHorizontal: 14, paddingBottom: 8 },
  lessonRow: {
    flexDirection: "row", alignItems: "flex-start",
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border, gap: 10,
  },
  lessonNum: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center", marginTop: 2 },
  lessonNumText: { fontSize: 11, fontWeight: "900", color: "#fff" },
  checkCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  lessonTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 1 },
  lessonName: { fontSize: 13, fontWeight: "700", color: c.text },
  lessonDesc: { fontSize: 11, color: c.textMuted, fontWeight: "500", marginTop: 1 },
  lessonActionBtn: {
    width: 24, height: 24, borderRadius: 6,
    backgroundColor: c.dangerLight, alignItems: "center", justifyContent: "center",
  },

  actionRow: { flexDirection: "row", gap: 5, alignItems: "center" },
  actionPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  actionPillText: { fontSize: 10, fontWeight: "800", color: c.dark },

  addLessonRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
  addLessonText: { fontSize: 13, color: c.primary, fontWeight: "700" },
  addModBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, borderRadius: 14, marginTop: 4,
    borderWidth: 1.5, borderColor: c.primary, borderStyle: "dashed",
  },
  addModText: { fontSize: 13, fontWeight: "700", color: c.primary },

  mOverlay: { flex: 1, backgroundColor: isDark ? "rgba(0,0,0,0.8)" : "rgba(10,22,40,0.6)", justifyContent: "flex-end" },
  mBox: { backgroundColor: c.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 12 },
  mTitle: { fontSize: 20, fontWeight: "900", color: c.text },
  mInput: {
    backgroundColor: c.background, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 14, fontWeight: "600", color: c.text,
    borderWidth: 1.5, borderColor: c.border,
  },
  mBtns: { flexDirection: "row", gap: 10 },
  mBtnCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 999,
    alignItems: "center", backgroundColor: c.background,
    borderWidth: 1, borderColor: c.border,
  },
  mBtnCancelText: { fontSize: 14, fontWeight: "700", color: c.textSecondary },
  mBtnOk: { flex: 1, borderRadius: 999, overflow: "hidden" },
  mBtnOkGrad: { paddingVertical: 14, alignItems: "center" },
  mBtnOkText: { fontSize: 14, fontWeight: "900", color: "#fff" },

  mLabel: { fontSize: 12, fontWeight: "800", color: c.textSecondary, textTransform: "uppercase", marginTop: 12, marginBottom: 8 },
  iconGrid: { flexDirection: "row", gap: 10, paddingBottom: 10 },
  iconPick: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: c.background, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "transparent",
  },
  iconPickActive: { borderColor: c.primary, backgroundColor: c.primaryLight },

  certClaimCard: {
    marginTop: 18,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  certClaimGrad: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  certClaimTitle: { fontSize: 15, fontWeight: "900", color: "#fff" },
  certClaimSub: { fontSize: 11, color: "rgba(255,255,255,0.9)", fontWeight: "600" },
});
