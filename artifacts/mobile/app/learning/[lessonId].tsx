import { useColors, useTheme } from "@/contexts/ThemeContext";
import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  Animated,
  InteractionManager,
  Alert,
  Modal,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, FileText, BookOpen, Layers, CheckSquare, Settings, Sparkles, ChevronRight, Send, X } from "lucide-react-native";
import { getLessons, getModules, getStudyMaterials, saveNote, generateId, type Lesson, type Module } from "@/utils/storage";
import { getApiKeys } from "@/utils/ai-keys";
import { callAI } from "@/utils/ai-providers";
import { toast } from "@/components/Toast";
import { LinearGradient } from "expo-linear-gradient";

import MaterialSection from "@/components/learning/MaterialSection";
import NotesSection from "@/components/learning/NotesSection";
import FlashcardSection from "@/components/learning/FlashcardSection";
import QuizSection from "@/components/learning/QuizSection";

// We'll import content sections later or define them as sub-components
const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function LessonHub() {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { lessonId, initialTab } = useLocalSearchParams<{ lessonId: string; initialTab?: string }>();

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [allLessons, setAllLessons] = useState<Lesson[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [showAIModal, setShowAIModal] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");

  const tabs = [
    { id: "material", label: "Materi", icon: BookOpen },
    { id: "notes", label: "Catatan", icon: FileText },
    { id: "flashcard", label: "Flashcard", icon: Layers },
    { id: "quiz", label: "Kuis", icon: CheckSquare },
  ];

  useEffect(() => {
    (async () => {
      const allLs = await getLessons();
      const current = allLs.find(l => l.id === lessonId);
      if (current) {
        setLesson(current);
        
        // Find the course (path) of this lesson
        const allMs = await getModules();
        const currentMod = allMs.find(m => m.id === current.moduleId);
        if (currentMod) {
          const pathId = currentMod.pathId;
          const courseModules = allMs.filter(m => m.pathId === pathId).sort((a, b) => a.order - b.order);
          const courseModIds = courseModules.map(m => m.id);
          
          // Get all lessons for these specific modules, in order
          const courseLessons = allLs
            .filter(l => courseModIds.includes(l.moduleId))
            .sort((a, b) => {
              const modA = courseModules.findIndex(m => m.id === a.moduleId);
              const modB = courseModules.findIndex(m => m.id === b.moduleId);
              if (modA !== modB) return modA - modB;
              return a.order - b.order;
            });
            
          setAllLessons(courseLessons);
        }
      }
    })();
  }, [lessonId]);

  useEffect(() => {
    if (initialTab) {
      const idx = tabs.findIndex(t => t.id === initialTab);
      if (idx !== -1) {
        // Delay to allow scrollview to mount
        InteractionManager.runAfterInteractions(() => {
          scrollToIndex(idx, false);
        });
      }
    }
  }, [initialTab]);

  const scrollToIndex = (index: number, animated = true) => {
    setActiveIndex(index);
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated });
  };

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: false,
      listener: (event: any) => {
        const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
        if (index !== activeIndex) setActiveIndex(index);
      }
    }
  );

  const currentIdx = allLessons.findIndex(l => l.id === lessonId);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx !== -1 && currentIdx < allLessons.length - 1;

  const navigateLesson = (dir: number) => {
    const next = allLessons[currentIdx + dir];
    if (next) {
      router.setParams({ lessonId: next.id });
    }
  };

  const handleAINoteGen = async () => {
    if (aiLoading || !lessonId) return;
    setAiLoading(true);
    try {
      const keys = await getApiKeys();
      const key = keys.find(k => k.provider === "gemini") || keys[0];
      if (!key) {
        Alert.alert("API Key Dibutuhkan", "Harap pasang API Key di pengaturan.");
        return;
      }

      const materials = await getStudyMaterials(lessonId);
      const textMaterials = materials.filter(m => m.type === "text" || m.type === "html");
      
      if (textMaterials.length === 0) {
        toast.error("Tidak ada materi teks untuk dianalisa.");
        return;
      }

      const content = textMaterials.map(m => `Title: ${m.title}\nContent: ${m.content}`).join("\n\n");
      
      const prompt = customPrompt.trim() 
        ? `${customPrompt}\n\nMATERI REFERENSI:\n${content}`
        : `Buatkan catatan ringkasan poin-poin penting (bullet points) dari materi berikut.\n\nMATERI:\n${content}\n\nBahasa: Bahasa Indonesia.`;

      const { content: aiNote } = await callAI(key.provider as any, prompt, key.apiKey, key.model);
      
      await saveNote({
        id: generateId(),
        lessonId,
        title: "AI Summary: " + (lesson?.name || "Materi"),
        content: aiNote,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      setAiResponse(aiNote);
      setShowAIModal(true);
      toast.success("Catatan AI berhasil dibuat!");
      scrollToIndex(1); // Switch to notes tab
    } catch (e: any) {
      console.error(e);
      toast.error("Gagal generate catatan.");
    } finally {
      setAiLoading(false);
    }
  };

  const indicatorTranslate = scrollX.interpolate({
    inputRange: [0, SCREEN_WIDTH * (tabs.length - 1)],
    outputRange: [0, (SCREEN_WIDTH - 32) * ((tabs.length - 1) / tabs.length)],
  });

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 20 : insets.top + 10 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ChevronLeft size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>{lesson?.name || "Memuat..."}</Text>
            <Text style={styles.headerSub}>Lesson Hub</Text>
          </View>
          <TouchableOpacity onPress={handleAINoteGen} style={[styles.backBtn, { marginRight: 8, backgroundColor: colors.primary + "15" }]}>
            {aiLoading ? <ActivityIndicator size="small" color={colors.primary} /> : <Sparkles size={18} color={colors.primary} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.backBtn}>
            <Settings size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* QUICK NAV */}
        <View style={styles.quickNav}>
           <TouchableOpacity 
             onPress={() => navigateLesson(-1)}
             style={[styles.navStep, !hasPrev && { opacity: 0.3 }]}
             disabled={!hasPrev}
           >
              <ChevronLeft size={14} color={colors.text} />
              <Text style={styles.navStepText}>Prev</Text>
           </TouchableOpacity>
           <View style={styles.navDivider} />
           <TouchableOpacity 
             onPress={() => navigateLesson(1)}
             style={[styles.navStep, !hasNext && { opacity: 0.3 }]}
             disabled={!hasNext}
           >
              <Text style={styles.navStepText}>Next</Text>
              <ChevronRight size={14} color={colors.text} />
           </TouchableOpacity>
        </View>

        {/* TAB BAR */}
        <View style={styles.tabBarContainer}>
          <View style={styles.tabBar}>
            {tabs.map((tab, i) => {
              const Icon = tab.icon;
              const isActive = activeIndex === i;
              return (
                <TouchableOpacity 
                  key={tab.id} 
                  style={styles.tabBtn} 
                  onPress={() => scrollToIndex(i)}
                >
                  <Icon size={18} color={isActive ? colors.primary : colors.textMuted} />
                  <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <Animated.View 
              style={[
                styles.tabIndicator, 
                { 
                  width: (SCREEN_WIDTH - 32) / tabs.length,
                  transform: [{ translateX: indicatorTranslate }]
                }
              ]} 
            />
          </View>
        </View>
      </View>

      {/* PAGER CONTENT */}
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        contentContainerStyle={styles.hubPager}
        bounces={false}
      >
        {/* PAGE 1: MATERIAL */}
        <View style={styles.page}>
           <MaterialSection lessonId={lessonId} />
        </View>

        {/* PAGE 2: NOTES */}
        <View style={styles.page}>
           <NotesSection lessonId={lessonId} lessonName={lesson?.name || ""} />
        </View>

        {/* PAGE 3: FLASHCARD */}
        <View style={styles.page}>
           <FlashcardSection lessonId={lessonId} />
        </View>

        {/* PAGE 4: QUIZ */}
        <View style={styles.page}>
           <QuizSection lessonId={lessonId} />
        </View>
      </Animated.ScrollView>

      <Modal visible={showAIModal} transparent animationType="fade" onRequestClose={() => setShowAIModal(false)}>
        <View style={styles.modalBg}>
           <View style={styles.aiModal}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <View style={{ backgroundColor: colors.primary + "15", padding: 8, borderRadius: 10 }}>
                    <Sparkles size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.modalTitle}>AI Assistant</Text>
                </View>
                <TouchableOpacity onPress={() => setShowAIModal(false)} style={styles.closeModalBtn}>
                  <X size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 300, marginVertical: 12 }}>
                 <Text style={styles.aiContent}>{aiResponse || "Tanyakan sesuatu tentang materi ini..."}</Text>
              </ScrollView>

              <View style={styles.aiInputRow}>
                <TextInput 
                  style={styles.aiInput}
                  placeholder="Tanya kustom (cth: Ringkas dalam 3 poin)"
                  placeholderTextColor={colors.textMuted}
                  value={customPrompt}
                  onChangeText={setCustomPrompt}
                  multiline
                />
                <TouchableOpacity 
                  style={[styles.aiSendBtn, aiLoading && { opacity: 0.7 }]} 
                  onPress={handleAINoteGen}
                  disabled={aiLoading}
                >
                  {aiLoading ? <ActivityIndicator size="small" color="#fff" /> : <Send size={18} color="#fff" />}
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowAIModal(false)}>
                   <LinearGradient
                     colors={[colors.primary, colors.purple]}
                     start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                     style={styles.startBtn}
                   >
                     <Text style={styles.startBtnText}>Simpan ke Catatan</Text>
                   </LinearGradient>
                </TouchableOpacity>
              </View>
           </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (c: any, isDark: boolean, palette: string) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: { 
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 16,
    paddingBottom: 0,
  },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: c.background,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: c.border,
  },
  headerTitle: { fontSize: 18, fontWeight: "900", color: c.text },
  headerSub: { fontSize: 11, fontWeight: "700", color: c.textMuted, textTransform: "uppercase" },
  
  quickNav: { 
    flexDirection: "row", alignItems: "center", justifyContent: "center", 
    backgroundColor: c.background, borderRadius: 10, marginVertical: 8,
    paddingVertical: 6, borderWidth: 1, borderColor: c.border,
  },
  navStep: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20 },
  navStepText: { fontSize: 12, fontWeight: "800", color: c.text },
  navDivider: { width: 1, height: 14, backgroundColor: c.border },

  tabBarContainer: { marginTop: 4 },
  tabBar: { flexDirection: "row", position: "relative", paddingBottom: 2 },
  tabBtn: { 
    flex: 1, 
    alignItems: "center", 
    paddingVertical: 14, 
    gap: 4
  },
  tabLabel: { fontSize: 11, fontWeight: "700", color: c.textMuted },
  tabLabelActive: { color: c.primary },
  tabIndicator: { 
    position: "absolute",
    bottom: 0,
    height: 3.5,
    backgroundColor: c.primary,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },

  mLabel: { fontSize: 12, fontWeight: "800", color: c.textSecondary, textTransform: "uppercase", marginTop: 12, marginBottom: 8 },
  iconGrid: { flexDirection: "row", gap: 10, paddingBottom: 10 },
  iconPick: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: c.background, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "transparent",
  },
  iconPickActive: { borderColor: c.primary, backgroundColor: c.primaryLight },

  hubPager: { flexGrow: 1 },
  page: { width: SCREEN_WIDTH },
  placeholderText: { fontSize: 16, fontWeight: "600", color: c.textMuted },
  aiInputRow: { flexDirection: "row", gap: 10, alignItems: "flex-end", backgroundColor: c.background, padding: 8, borderRadius: 16, borderWidth: 1, borderColor: c.border },
  aiInput: { flex: 1, maxHeight: 100, fontSize: 14, color: c.text, paddingHorizontal: 8, paddingVertical: 4 },
  aiSendBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  aiModal: { backgroundColor: c.surface, width: "92%", borderRadius: 32, padding: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  modalHeader: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  closeModalBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.background, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  modalTitle: { fontSize: 18, fontWeight: "900", color: c.text },
  aiContent: { fontSize: 14, color: c.textSecondary, lineHeight: 22, fontWeight: "500" },
  startBtn: { paddingVertical: 14, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  startBtnText: { color: "#fff", fontWeight: "900", fontSize: 15 },
});
