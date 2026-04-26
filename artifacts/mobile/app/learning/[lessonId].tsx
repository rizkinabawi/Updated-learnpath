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
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as LucideIcons from "lucide-react-native";
import { getLessons, getModules, type Lesson, type Module } from "@/utils/storage";

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

  const tabs = [
    { id: "material", label: "Materi", icon: LucideIcons.BookOpen },
    { id: "notes", label: "Catatan", icon: LucideIcons.FileText },
    { id: "flashcard", label: "Flashcard", icon: LucideIcons.Layers },
    { id: "quiz", label: "Kuis", icon: LucideIcons.CheckSquare },
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
            <LucideIcons.ChevronLeft size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>{lesson?.name || "Memuat..."}</Text>
            <Text style={styles.headerSub}>Lesson Hub</Text>
          </View>
          <TouchableOpacity style={styles.backBtn}>
            <LucideIcons.Settings size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* QUICK NAV */}
        <View style={styles.quickNav}>
           <TouchableOpacity 
             onPress={() => navigateLesson(-1)}
             style={[styles.navStep, !hasPrev && { opacity: 0.3 }]}
             disabled={!hasPrev}
           >
              <LucideIcons.ChevronLeft size={14} color={colors.text} />
              <Text style={styles.navStepText}>Prev</Text>
           </TouchableOpacity>
           <View style={styles.navDivider} />
           <TouchableOpacity 
             onPress={() => navigateLesson(1)}
             style={[styles.navStep, !hasNext && { opacity: 0.3 }]}
             disabled={!hasNext}
           >
              <Text style={styles.navStepText}>Next</Text>
              <LucideIcons.ChevronRight size={14} color={colors.text} />
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
});
