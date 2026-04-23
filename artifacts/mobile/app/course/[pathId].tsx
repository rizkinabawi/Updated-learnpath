import React, { useCallback, useEffect, useState } from "react";
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
  generateId,
  type LearningPath, type Module, type Lesson,
} from "@/utils/storage";
import Colors from "@/constants/colors";
import { useTranslation } from "@/contexts/LanguageContext";

const GRAD_PALETTE: [string, string][] = [
  ["#4A9EFF", "#6C63FF"],
  ["#FF6B6B", "#FF9500"],
  ["#38BDF8", "#0EA5E9"],
  ["#7C3AED", "#A855F7"],
  ["#059669", "#10B981"],
];
const MOD_EMOJIS = ["📘", "🎨", "🌐", "🧠", "⚗️"];

type ModCounts = { fc: number; qz: number; nt: number; mt: number };

export default function CourseDetailPage() {
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

  const { t } = useTranslation();
  const [showNewModule, setShowNewModule] = useState(false);
  const [showNewLesson, setShowNewLesson] = useState(false);
  const [modName, setModName] = useState("");
  const [lessonName, setLessonName] = useState("");
  const [lessonDesc, setLessonDesc] = useState("");
  const [targetMod, setTargetMod] = useState<string | null>(null);

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
  };

  useFocusEffect(useCallback(() => { loadData(); }, [pathId]));

  const createModule = async () => {
    if (!modName.trim() || !pathId) return;
    const m: Module = {
      id: generateId(), pathId,
      name: modName.trim(), description: "",
      order: modules.length, createdAt: new Date().toISOString(),
    };
    await saveModule(m);
    setModName(""); setShowNewModule(false);
    loadData();
  };

  const createLesson = async () => {
    if (!lessonName.trim() || !targetMod) return;
    const l: Lesson = {
      id: generateId(), moduleId: targetMod,
      name: lessonName.trim(), description: lessonDesc.trim(),
      order: (lessons[targetMod] ?? []).length,
      createdAt: new Date().toISOString(),
    };
    await saveLesson(l);
    setLessonName(""); setLessonDesc(""); setShowNewLesson(false);
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

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <LinearGradient
        colors={["#4C6FFF", "#7C47FF"]}
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
            <Feather name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerSub}>{t.course.header_sub}</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>{path?.name ?? "..."}</Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowNewModule(true)}
            style={styles.addBtn}
            activeOpacity={0.8}
          >
            <LinearGradient colors={["rgba(255,255,255,0.3)", "rgba(255,255,255,0.15)"]} style={styles.addGrad}>
              <Feather name="plus" size={20} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
        {!!path?.description && (
          <Text style={styles.headerDesc} numberOfLines={2}>{path.description}</Text>
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
            <Feather name="plus-circle" size={18} color={Colors.primary} />
            <Text style={styles.emptyModText}>{t.course.empty_mod}</Text>
          </TouchableOpacity>
        )}

        <View style={isTablet ? styles.tabletGrid : undefined}>
          {modules.map((mod, mi) => {
            const isExpanded = !!expanded[mod.id];
            const modLessons = lessons[mod.id] ?? [];
            const cnt = counts[mod.id] ?? { fc: 0, qz: 0, nt: 0, mt: 0 };
            const grad = GRAD_PALETTE[mi % GRAD_PALETTE.length];
            const emoji = MOD_EMOJIS[mi % MOD_EMOJIS.length];

            return (
              <View key={mod.id} style={[styles.moduleCard, isTablet && styles.moduleCardTablet]}>
                {/* Module header row */}
                <TouchableOpacity
                  onPress={() => toggleExpand(mod.id)}
                  style={styles.moduleHeader}
                  activeOpacity={0.7}
                >
                  <LinearGradient colors={grad} style={styles.modIconGrad}>
                    <Text style={{ fontSize: 18 }}>{emoji}</Text>
                  </LinearGradient>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.moduleName} numberOfLines={1}>{mod.name}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={styles.moduleMetaRow}>
                        <MetaChip label={t.course.meta_lessons(modLessons.length)} />
                        <MetaChip label={t.course.meta_cards(cnt.fc)} />
                        <MetaChip label={t.course.meta_quiz(cnt.qz)} />
                        <MetaChip label={t.course.meta_notes(cnt.nt)} color={Colors.primary} bg="#EEF0FF" />
                        <MetaChip label={t.course.meta_material(cnt.mt)} color={Colors.purple} bg={Colors.purpleLight} />
                      </View>
                    </ScrollView>
                  </View>

                  <TouchableOpacity
                    onPress={() => handleDeleteModule(mod)}
                    style={styles.modDeleteBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="trash-2" size={13} color={Colors.danger} />
                  </TouchableOpacity>
                  <Feather
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={16} color={Colors.textMuted}
                  />
                </TouchableOpacity>

                {/* Lessons */}
                {isExpanded && (
                  <View style={styles.lessonList}>
                    {modLessons.map((lesson, li) => (
                      <View key={lesson.id} style={styles.lessonRow}>
                        <LinearGradient colors={grad} style={styles.lessonNum}>
                          <Text style={styles.lessonNumText}>{li + 1}</Text>
                        </LinearGradient>

                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={styles.lessonTitleRow}>
                            <Text style={[styles.lessonName, { flex: 1 }]} numberOfLines={1}>{lesson.name}</Text>
                            <TouchableOpacity
                              onPress={() => handleDeleteLesson(lesson)}
                              style={styles.lessonDeleteBtn}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <Feather name="trash-2" size={12} color={Colors.danger} />
                            </TouchableOpacity>
                          </View>
                          {!!lesson.description && (
                            <Text style={styles.lessonDesc} numberOfLines={1}>{lesson.description}</Text>
                          )}

                          {/* Action pills */}
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                            <View style={styles.actionRow}>
                              <ActionPill
                                label={t.course.action_notes} bg="#EEF0FF"
                                onPress={() => router.push(`/notes/${lesson.id}`)}
                              />
                              <ActionPill
                                label={t.course.action_material} bg={Colors.purpleLight}
                                onPress={() => router.push(`/study-material/${lesson.id}`)}
                              />
                              <ActionPill
                                label={t.course.action_cards} bg={Colors.primaryLight}
                                onPress={() => router.push(`/flashcard/${lesson.id}`)}
                              />
                              <ActionPill
                                label={t.course.action_quiz} bg={Colors.amberLight}
                                onPress={() => router.push(`/quiz/${lesson.id}`)}
                              />
                              <ActionPill
                                icon="plus" label="Soal" bg={Colors.background}
                                border={Colors.border} textColor={Colors.primary}
                                onPress={() => router.push(`/create-quiz/${lesson.id}`)}
                              />
                            </View>
                          </ScrollView>
                        </View>
                      </View>
                    ))}

                    <TouchableOpacity
                      style={styles.addLessonRow}
                      onPress={() => { setTargetMod(mod.id); setShowNewLesson(true); }}
                    >
                      <Feather name="plus-circle" size={14} color={Colors.primary} />
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
            <Feather name="plus" size={15} color={Colors.primary} />
            <Text style={styles.addModText}>{t.course.add_mod_btn}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* MODALS */}
      {[
        {
          vis: showNewModule, title: t.course.new_module_modal,
          close: () => { setShowNewModule(false); setModName(""); }, save: createModule,
          body: (
            <TextInput
              placeholder="Nama modul" value={modName}
              onChangeText={setModName} style={styles.mInput}
              placeholderTextColor={Colors.textMuted} autoFocus
            />
          ),
        },
        {
          vis: showNewLesson, title: t.course.new_lesson_modal,
          close: () => { setShowNewLesson(false); setLessonName(""); setLessonDesc(""); }, save: createLesson,
          body: (
            <>
              <TextInput
                placeholder="Nama pelajaran" value={lessonName}
                onChangeText={setLessonName} style={styles.mInput}
                placeholderTextColor={Colors.textMuted} autoFocus
              />
              <TextInput
                placeholder="Deskripsi (opsional)" value={lessonDesc}
                onChangeText={setLessonDesc} style={styles.mInput}
                placeholderTextColor={Colors.textMuted}
              />
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
                    <LinearGradient colors={["#4A9EFF", "#6C63FF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.mBtnOkGrad}>
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
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.actionPill, { backgroundColor: bg }, border ? { borderWidth: 1, borderColor: border } : undefined]}
      activeOpacity={0.75}
    >
      {icon && <Feather name={icon} size={10} color={textColor ?? Colors.dark} />}
      <Text style={[styles.actionPillText, textColor ? { color: textColor } : undefined]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: { paddingHorizontal: 20, paddingBottom: 18, overflow: "hidden" },
  hdot1: { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(255,255,255,0.06)", top: -50, right: -40 },
  hdot2: { position: "absolute", width: 110, height: 110, borderRadius: 55, backgroundColor: "rgba(255,255,255,0.05)", bottom: -20, right: 70 },
  headerRow: { flexDirection: "row", alignItems: "center" },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  headerSub: { fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: "700", letterSpacing: 1.5 },
  headerTitle: { fontSize: 22, fontWeight: "900", color: "#fff", letterSpacing: -0.3 },
  headerDesc: { fontSize: 13, color: "rgba(255,255,255,0.65)", fontWeight: "500", marginTop: 6 },
  addBtn: { borderRadius: 13, overflow: "hidden" },
  addGrad: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  tabletGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },

  emptyModBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 20, borderRadius: 16,
    borderWidth: 2, borderColor: Colors.primary, borderStyle: "dashed",
    backgroundColor: Colors.primaryLight, marginBottom: 12,
  },
  emptyModText: { fontSize: 14, fontWeight: "700", color: Colors.primary },

  moduleCard: {
    backgroundColor: "#fff", borderRadius: 18, marginBottom: 10,
    overflow: "hidden", borderWidth: 1, borderColor: Colors.border,
  },
  moduleCardTablet: { width: "48.5%", marginBottom: 0 },
  moduleHeader: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  modIconGrad: { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  moduleName: { fontSize: 15, fontWeight: "800", color: Colors.dark, marginBottom: 5 },
  moduleMetaRow: { flexDirection: "row", gap: 5 },
  metaChip: { backgroundColor: Colors.background, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  metaChipText: { fontSize: 10, fontWeight: "700", color: Colors.textSecondary },
  modDeleteBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: Colors.dangerLight, alignItems: "center", justifyContent: "center",
  },

  lessonList: { borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: 14, paddingBottom: 8 },
  lessonRow: {
    flexDirection: "row", alignItems: "flex-start",
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10,
  },
  lessonNum: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center", marginTop: 2 },
  lessonNumText: { fontSize: 11, fontWeight: "900", color: "#fff" },
  lessonTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 1 },
  lessonName: { fontSize: 13, fontWeight: "700", color: Colors.dark },
  lessonDesc: { fontSize: 11, color: Colors.textMuted, fontWeight: "500", marginTop: 1 },
  lessonDeleteBtn: {
    width: 24, height: 24, borderRadius: 6,
    backgroundColor: Colors.dangerLight, alignItems: "center", justifyContent: "center",
  },

  actionRow: { flexDirection: "row", gap: 5, alignItems: "center" },
  actionPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  actionPillText: { fontSize: 10, fontWeight: "800", color: Colors.dark },

  addLessonRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
  addLessonText: { fontSize: 13, color: Colors.primary, fontWeight: "700" },
  addModBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, borderRadius: 14, marginTop: 4,
    borderWidth: 1.5, borderColor: Colors.primary, borderStyle: "dashed",
  },
  addModText: { fontSize: 13, fontWeight: "700", color: Colors.primary },

  mOverlay: { flex: 1, backgroundColor: "rgba(10,22,40,0.6)", justifyContent: "flex-end" },
  mBox: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 12 },
  mTitle: { fontSize: 20, fontWeight: "900", color: Colors.dark },
  mInput: {
    backgroundColor: Colors.background, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 14, fontWeight: "600", color: Colors.dark,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  mBtns: { flexDirection: "row", gap: 10 },
  mBtnCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 999,
    alignItems: "center", backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
  },
  mBtnCancelText: { fontSize: 14, fontWeight: "700", color: Colors.textSecondary },
  mBtnOk: { flex: 1, borderRadius: 999, overflow: "hidden" },
  mBtnOkGrad: { paddingVertical: 14, alignItems: "center" },
  mBtnOkText: { fontSize: 14, fontWeight: "900", color: "#fff" },
});
