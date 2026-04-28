import { useColors, useTheme } from "@/contexts/ThemeContext";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  TextInput,
  useWindowDimensions,
  ScrollView,
  BackHandler,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { 
  ArrowLeft, 
  Search, 
  Book, 
  BookOpen, 
  ChevronRight, 
  X,
  Volume2,
  Info,
  Hash,
  Play,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  Trophy,
  Languages,
  Check,
  PlusCircle,
  FilePlus,
  AlertCircle
} from "lucide-react-native";
import { 
  getLearningPaths, 
  getModules, 
  getLessons, 
  saveNote, 
  generateId 
} from "@/utils/storage";
import { Modal } from "react-native";
import { toast } from "@/components/Toast";
import { type ColorScheme } from "@/constants/colors";

// ─── Data Mapping ─────────────────────────────────────────────────────────────

const DATA_MAP: Record<string, { grammar: string; vocab: string }> = {
  "N1": { grammar: "", vocab: "n1_vocab.csv" },
  "N2": { grammar: "n2_grammar.json", vocab: "n2_vocab.csv" },
  "N3": { grammar: "n3_grammar.json", vocab: "n3_vocab.csv" },
  "N4": { grammar: "n4_grammar.json", vocab: "n4_vocab.csv" },
  "N5": { grammar: "n5_grammar.json", vocab: "n5_vocab.csv" },
};

const ITEMS_PER_LESSON = 50;

// ─── Types ────────────────────────────────────────────────────────────────────

interface GrammarItem {
  id: string;
  bunpou: string;
  arti_umum: string;
  penggunaan: string;
  pola: string;
  contoh: Array<{ kalimat_jepang: string; arti_indonesia: string }>;
  catatan?: string;
}

interface VocabItem {
  word: string;
  reading: string;
  id_mean: string;
  en_mean: string;
  vn_mean: string;
  kr_mean: string;
}

type ScreenMode = "hub" | "lesson" | "detail";

export default function JLPTLevelDetail() {
  const { level } = useLocalSearchParams<{ level: string }>();
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Navigation State
  const [mode, setMode] = useState<ScreenMode>("hub");
  const [activeTab, setActiveTab] = useState<"grammar" | "vocab">("grammar");
  
  // Data State
  const [loading, setLoading] = useState(true);
  const [grammarData, setGrammarData] = useState<GrammarItem[]>([]);
  const [vocabData, setVocabData] = useState<VocabItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Lesson State
  const [selectedLessonIdx, setSelectedLessonIdx] = useState(0);
  const [fcIndex, setFcIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  
  // Detail State
  const [selectedItem, setSelectedItem] = useState<GrammarItem | VocabItem | null>(null);

  // Mastery State
  const [mastery, setMastery] = useState<Record<string, { status: "mastered" | "failed" | "new" }>>({});

  const getItemId = (item: GrammarItem | VocabItem) => {
    return "bunpou" in item ? `g_${item.bunpou}` : `v_${item.word}`;
  };

  const loadMastery = async () => {
    try {
      const key = `jlpt_mastery_${level}`;
      const data = await AsyncStorage.getItem(key);
      if (data) setMastery(JSON.parse(data));
    } catch (e) {
      console.error("Failed to load mastery:", e);
    }
  };

  const updateItemMastery = async (item: GrammarItem | VocabItem, status: "mastered" | "failed") => {
    const id = getItemId(item);
    const newMastery = { ...mastery, [id]: { status } };
    setMastery(newMastery);
    try {
      const key = `jlpt_mastery_${level}`;
      await AsyncStorage.setItem(key, JSON.stringify(newMastery));
    } catch (e) {
      console.error("Failed to save mastery:", e);
    }
  };

  // Add to Course State
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [targetPaths, setTargetPaths] = useState<any[]>([]);
  const [selectedPathId, setSelectedPathId] = useState("");
  const [targetModules, setTargetModules] = useState<any[]>([]);
  const [selectedModId, setSelectedModId] = useState("");
  const [targetLessons, setTargetLessons] = useState<any[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const openSaveModal = async (item: GrammarItem | VocabItem) => {
    setSelectedItem(item);
    const paths = await getLearningPaths();
    setTargetPaths(paths);
    setShowSaveModal(true);
  };

  useEffect(() => {
    if (selectedPathId) {
      getModules(selectedPathId).then(setTargetModules);
      setSelectedModId("");
      setTargetLessons([]);
      setSelectedLessonId("");
    }
  }, [selectedPathId]);

  useEffect(() => {
    if (selectedModId) {
      getLessons(selectedModId).then(setTargetLessons);
      setSelectedLessonId("");
    }
  }, [selectedModId]);

  const handleSaveToNote = async () => {
    if (!selectedLessonId || !selectedItem) {
      toast.error("Pilih pelajaran tujuan!");
      return;
    }
    setIsSaving(true);
    try {
      const isGrammar = "bunpou" in selectedItem;
      const title = `[JLPT ${level}] ${isGrammar ? (selectedItem as GrammarItem).bunpou : (selectedItem as VocabItem).word}`;
      
      let content = "";
      if (isGrammar) {
        const g = selectedItem as GrammarItem;
        content = `Arti: ${g.arti_umum}\n\nPenggunaan: ${g.penggunaan}\n\nPola: ${g.pola}\n\nContoh:\n${g.contoh.map(c => `- ${c.kalimat_jepang}\n  (${c.arti_indonesia})`).join("\n")}`;
      } else {
        const v = selectedItem as VocabItem;
        content = `Bacaan: ${v.reading}\n\nArti (ID): ${v.id_mean}\nArti (EN): ${v.en_mean}\nArti (VN): ${v.vn_mean}`;
      }

      await saveNote({
        id: generateId(),
        lessonId: selectedLessonId,
        title,
        content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      toast.success("Berhasil ditambahkan ke kursus!");
      setShowSaveModal(false);
    } catch (e) {
      toast.error("Gagal menyimpan catatan.");
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Back Action Handler ───────────────────────────────────────────────────

  useEffect(() => {
    const onBackPress = () => {
      if (mode === "detail") {
        setMode("lesson");
        return true;
      }
      if (mode === "lesson") {
        setMode("hub");
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, [mode]);

  // ─── Data Loading ──────────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    try {
      const paths = DATA_MAP[level as string];
      if (!paths) return;

      const getUrl = (filename: string) => {
        if (Platform.OS === "web") {
          return `${window.location.origin}/jlpt-data/${filename}`;
        }
        const host = Constants.expoConfig?.hostUri?.split(':').shift() || 'localhost';
        return `http://${host}:8081/jlpt-data/${filename}`;
      };

      if (paths.grammar) {
        const url = getUrl(paths.grammar);
        const response = await fetch(url);
        const json = await response.json();
        let flattened: GrammarItem[] = [];
        if (json && json.data && Array.isArray(json.data)) {
          flattened = json.data.every(Array.isArray) ? json.data.flat(1) : json.data;
        }
        setGrammarData(flattened);
      }

      if (paths.vocab) {
        const url = getUrl(paths.vocab);
        const response = await fetch(url);
        const text = await response.text();
        
        const parseCSVLine = (line: string) => {
          const result = [];
          let current = "";
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) {
              result.push(current);
              current = "";
            } else {
              current += char;
            }
          }
          result.push(current);
          return result;
        };

        const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
        const parsed: VocabItem[] = lines.slice(1).map(line => {
          const parts = parseCSVLine(line);
          return {
            word: (parts[0] || "").trim(),
            reading: (parts[1] || "").trim(),
            id_mean: (parts[2] || "").trim(),
            en_mean: (parts[3] || "").trim(),
            vn_mean: (parts[4] || "").trim(),
            kr_mean: (parts[5] || "").trim()
          };
        });
        setVocabData(parsed);
      }
    } catch (error) {
      console.error("[JLPT] Load failed:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    loadMastery();
    if (level === "N1") setActiveTab("vocab");
  }, [level]);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const currentFullList = activeTab === "grammar" ? grammarData : vocabData;
  const lessonsCount = Math.ceil(currentFullList.length / ITEMS_PER_LESSON);

  const getLessonItems = (idx: number) => {
    const start = idx * ITEMS_PER_LESSON;
    return currentFullList.slice(start, start + ITEMS_PER_LESSON);
  };

  const filteredHubData = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    return currentFullList.filter(i => {
      if (activeTab === "grammar") {
        const g = i as GrammarItem;
        return (g.bunpou || "").toLowerCase().includes(q) || (g.arti_umum || "").toLowerCase().includes(q);
      } else {
        const v = i as VocabItem;
        return (v.word || "").toLowerCase().includes(q) || (v.reading || "").toLowerCase().includes(q) || (v.id_mean || "").toLowerCase().includes(q);
      }
    });
  }, [currentFullList, searchQuery, activeTab]);

  // ─── Renderers ─────────────────────────────────────────────────────────────

  const renderHub = () => (
    <View style={styles.hubContainer}>
      <LinearGradient colors={[colors.primary, colors.purple]} style={[styles.headerHub, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <ArrowLeft size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.hubTitle}>JLPT {level}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.tabBar}>
          {level !== "N1" && (
            <TouchableOpacity 
              style={[styles.tab, activeTab === "grammar" && styles.activeTab]}
              onPress={() => setActiveTab("grammar")}
            >
              <BookOpen size={16} color={activeTab === "grammar" ? colors.primary : "#fff"} />
              <Text style={[styles.tabText, activeTab === "grammar" && styles.activeTabText]}>Grammar</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            style={[styles.tab, activeTab === "vocab" && styles.activeTab, level === "N1" && { flex: 1 }]}
            onPress={() => setActiveTab("vocab")}
          >
            <Book size={16} color={activeTab === "vocab" ? colors.primary : "#fff"} />
            <Text style={[styles.tabText, activeTab === "vocab" && styles.activeTabText]}>Vocab</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchBox}>
          <Search size={18} color="rgba(255,255,255,0.6)" />
          <TextInput
            style={styles.searchInput}
            placeholder={`Cari materi ${activeTab}...`}
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.hubContent}>
        {level === "N5" && !searchQuery && (
          <View style={styles.n5Hero}>
            <LinearGradient colors={["rgba(255,255,255,0.1)", "transparent"]} style={styles.n5HeroGrad}>
              <View style={styles.n5HeroRow}>
                <View style={styles.n5HeroIcon}>
                  <Award size={32} color={colors.amber} />
                </View>
                <View style={styles.n5HeroText}>
                  <Text style={styles.n5HeroTitle}>Starter Mastery (N5)</Text>
                  <Text style={styles.n5HeroSub}>Landasan utama Bahasa Jepang kamu dimulai dari sini.</Text>
                </View>
              </View>
              <View style={styles.n5HeroStats}>
                <View style={styles.n5StatItem}>
                  <Text style={styles.n5StatVal}>{grammarData.length + vocabData.length}</Text>
                  <Text style={styles.n5StatLabel}>Total Materi</Text>
                </View>
                <View style={styles.n5StatDivider} />
                <View style={styles.n5StatItem}>
                  <Text style={styles.n5StatVal}>~30 Hari</Text>
                  <Text style={styles.n5StatLabel}>Estimasi</Text>
                </View>
                <TouchableOpacity style={styles.n5ResumeBtn} onPress={() => { setSelectedLessonIdx(0); setMode("lesson"); }}>
                  <Play size={14} color="#fff" />
                  <Text style={styles.n5ResumeText}>Mulai</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : searchQuery ? (
          filteredHubData.map((item, idx) => (
            <TouchableOpacity key={idx} style={styles.searchResult} onPress={() => { setSelectedItem(item); setMode("detail"); }}>
              <Text style={styles.searchResultText}>{"bunpou" in item ? item.bunpou : item.word}</Text>
              <ChevronRight size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.lessonGrid}>
            {Array.from({ length: lessonsCount }).map((_, idx) => {
              const lessonItems = getLessonItems(idx);
              const firstItem = lessonItems[0];
              const previewText = firstItem ? ("bunpou" in firstItem ? firstItem.bunpou : firstItem.word) : "...";
              
              // Calculate progress
              const masteredCount = lessonItems.filter(item => mastery[getItemId(item)]?.status === "mastered").length;
              const progress = (masteredCount / lessonItems.length) * 100;

              return (
                <TouchableOpacity 
                  key={idx} 
                  style={styles.lessonCard}
                  onPress={() => {
                    setSelectedLessonIdx(idx);
                    setFcIndex(0);
                    setIsFlipped(false);
                    setMode("lesson");
                  }}
                >
                  <View style={styles.lessonHeader}>
                    <View style={styles.lessonIconBox}>
                      {progress === 100 ? (
                        <Trophy size={20} color={colors.amber} />
                      ) : (
                        <Sparkles size={20} color={colors.primary} />
                      )}
                    </View>
                    <View style={styles.lessonInfo}>
                      <Text style={styles.lessonTitle}>Lesson {idx + 1}</Text>
                      <Text style={styles.lessonPreview}>{previewText}</Text>
                    </View>
                    {progress === 100 && <Check size={16} color={colors.success} />}
                  </View>
                  
                  <View style={styles.lessonMeta}>
                    <Text style={styles.lessonSub}>{lessonItems.length} Materi</Text>
                    <Text style={styles.lessonProgressText}>{Math.round(progress)}%</Text>
                  </View>
                  
                  <View style={styles.lessonProgressTrack}>
                    <View style={[styles.lessonProgressFill, { width: `${progress}%`, backgroundColor: progress === 100 ? colors.success : colors.primary }]} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );

  const renderGrammarStudy = () => {
    const items = getLessonItems(selectedLessonIdx);
    return (
      <View style={styles.fullScreen}>
        <LinearGradient colors={[colors.primary, colors.purple]} style={[styles.miniHeader, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => setMode("hub")} style={styles.iconBtn}>
            <ArrowLeft size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.miniHeaderTitle}>Study List: Lesson {selectedLessonIdx + 1}</Text>
          <Text style={styles.miniHeaderCount}>{items.length} Items</Text>
        </LinearGradient>

        <FlatList
          data={items}
          keyExtractor={(item, index) => index.toString()}
          contentContainerStyle={styles.studyList}
          renderItem={({ item, index }) => (
            <TouchableOpacity 
              style={styles.studyItem}
              onPress={() => { setSelectedItem(item); setMode("detail"); }}
            >
              <View style={styles.studyItemBadge}>
                <Text style={styles.studyItemIndex}>{index + 1}</Text>
              </View>
              <View style={styles.studyItemContent}>
                <Text style={styles.studyItemTitle}>{(item as GrammarItem).bunpou}</Text>
                <Text style={styles.studyItemSub}>{(item as GrammarItem).arti_umum}</Text>
              </View>
              <ChevronRight size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      </View>
    );
  };

  const renderVocabFlashcards = () => {
    const items = getLessonItems(selectedLessonIdx);
    const item = items[fcIndex];
    if (!item) return null;

    return (
      <View style={styles.fullScreen}>
        <LinearGradient colors={[colors.primary, colors.purple]} style={[styles.miniHeader, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => setMode("hub")} style={styles.iconBtn}>
            <ArrowLeft size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.miniHeaderTitle}>Lesson {selectedLessonIdx + 1}</Text>
            <View style={styles.premiumProgress}>
              <View style={[styles.premiumProgressBar, { width: `${((fcIndex + 1) / items.length) * 100}%` }]} />
            </View>
          </View>
          <Text style={styles.miniHeaderCount}>{fcIndex + 1}/{items.length}</Text>
        </LinearGradient>

        <View style={styles.premiumGameContainer}>
          <TouchableOpacity 
            activeOpacity={0.95} 
            onPress={() => setIsFlipped(!isFlipped)} 
            style={[styles.premiumCard, isFlipped ? styles.cardBackPremium : styles.cardFrontPremium]}
          >
            <View style={styles.premiumCardInner}>
              <View style={styles.cardTag}>
                <Sparkles size={10} color={colors.primary} />
                <Text style={styles.cardTagText}>{isFlipped ? "MEANING" : "VOCABULARY"}</Text>
              </View>

              {!isFlipped ? (
                <>
                  <Text style={styles.premiumCardMain}>{(item as VocabItem).word}</Text>
                  <Text style={styles.premiumCardSub}>{(item as VocabItem).reading}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.premiumCardMeaning}>{(item as VocabItem).id_mean}</Text>
                  <View style={styles.premiumCardSecondary}>
                    <Text style={styles.premiumCardSecondaryText}>EN: {(item as VocabItem).en_mean}</Text>
                  </View>
                </>
              )}

              <View style={styles.premiumTapHint}>
                <RotateCcw size={14} color={colors.textMuted} />
                <Text style={styles.premiumTapHintText}>TAP TO FLIP</Text>
              </View>
            </View>
          </TouchableOpacity>

          <View style={styles.premiumNav}>
            {isFlipped ? (
              <View style={styles.tracingContainer}>
                <TouchableOpacity 
                  style={[styles.tracingBtn, styles.wrongBtn]}
                  onPress={() => {
                    updateItemMastery(item, "failed");
                    if (fcIndex < items.length - 1) {
                      setFcIndex(fcIndex + 1);
                      setIsFlipped(false);
                    } else {
                      setMode("hub");
                    }
                  }}
                >
                  <X size={20} color="#fff" />
                  <Text style={styles.tracingBtnText}>SALAH</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.tracingBtn, styles.correctBtn]}
                  onPress={() => {
                    updateItemMastery(item, "mastered");
                    if (fcIndex < items.length - 1) {
                      setFcIndex(fcIndex + 1);
                      setIsFlipped(false);
                    } else {
                      setMode("hub");
                    }
                  }}
                >
                  <Check size={20} color="#fff" />
                  <Text style={styles.tracingBtnText}>BENAR</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TouchableOpacity 
                  style={[styles.premiumNavBtn, fcIndex === 0 && styles.disabledBtn]} 
                  disabled={fcIndex === 0}
                  onPress={() => { setFcIndex(fcIndex - 1); setIsFlipped(false); }}
                >
                  <ArrowLeft size={24} color={colors.text} />
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.premiumNextBtn}
                  onPress={() => setIsFlipped(true)}
                >
                  <Text style={styles.premiumNextBtnText}>LIHAT ARTI</Text>
                  <ChevronRight size={20} color="#fff" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderLessonFlashcard = () => {
    return activeTab === "grammar" ? renderGrammarStudy() : renderVocabFlashcards();
  };

  const renderDetail = () => {
    if (!selectedItem) return null;
    const isGrammar = "bunpou" in selectedItem;

    return (
      <View style={styles.fullScreen}>
        <View style={[styles.detailHeader, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => setMode("lesson")} style={styles.detailBackBtn}>
            <X size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.detailHeaderTitle}>Detail Materi</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={styles.detailContent}>
          <View style={styles.detailHero}>
            <Text style={styles.heroMain}>{isGrammar ? (selectedItem as GrammarItem).bunpou : (selectedItem as VocabItem).word}</Text>
            <Text style={styles.heroSub}>{isGrammar ? (selectedItem as GrammarItem).arti_umum : (selectedItem as VocabItem).reading}</Text>
          </View>

          {isGrammar ? (
            <>
              <View style={styles.detailSection}>
                <View style={styles.sectionHead}><Info size={16} color={colors.primary} /><Text style={styles.sectionLabel}>PENGGUNAAN</Text></View>
                <Text style={styles.sectionText}>{(selectedItem as GrammarItem).penggunaan}</Text>
              </View>
              <View style={styles.detailSection}>
                <View style={styles.sectionHead}><Hash size={16} color={colors.primary} /><Text style={styles.sectionLabel}>POLA KALIMAT</Text></View>
                <View style={styles.polaBox}><Text style={styles.polaText}>{(selectedItem as GrammarItem).pola}</Text></View>
              </View>
              <View style={styles.detailSection}>
                <View style={styles.sectionHead}><BookOpen size={16} color={colors.primary} /><Text style={styles.sectionLabel}>CONTOH KALIMAT</Text></View>
                {(selectedItem as GrammarItem).contoh?.map((ex, i) => (
                  <View key={i} style={styles.exampleCard}>
                    <Text style={styles.exJp}>{ex.kalimat_jepang}</Text>
                    <Text style={styles.exId}>{ex.arti_indonesia}</Text>
                  </View>
                ))}
                </View>
            </>
          ) : (
            <>
              <View style={styles.meanGrid}>
                {[
                  { lang: 'INDONESIA', val: (selectedItem as VocabItem).id_mean },
                  { lang: 'ENGLISH', val: (selectedItem as VocabItem).en_mean },
                  { lang: 'VIETNAMESE', val: (selectedItem as VocabItem).vn_mean }
                ].map((m, i) => (
                  <View key={i} style={styles.meanRow}>
                    <Text style={styles.meanLabel}>{m.lang}</Text>
                    <Text style={styles.meanVal}>{m.val}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity style={styles.speakBtn}>
                <Volume2 size={20} color="#fff" />
                <Text style={styles.speakBtnText}>Dengarkan Audio</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.addToCourseBtn} onPress={() => openSaveModal(selectedItem)}>
            <FilePlus size={20} color={colors.primary} />
            <Text style={styles.addToCourseBtnText}>Tambahkan ke Kursus Saya</Text>
          </TouchableOpacity>
        </ScrollView>

        <Modal visible={showSaveModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Simpan ke Kursus</Text>
                <TouchableOpacity onPress={() => setShowSaveModal(false)}>
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={styles.modalLabel}>Pilih Kursus</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pathPicker}>
                {targetPaths.map(p => (
                  <TouchableOpacity 
                    key={p.id} 
                    style={[styles.pathChip, selectedPathId === p.id && styles.pathChipActive]}
                    onPress={() => setSelectedPathId(p.id)}
                  >
                    <Text style={[styles.pathChipText, selectedPathId === p.id && styles.pathChipTextActive]}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {selectedPathId && (
                <>
                  <Text style={styles.modalLabel}>Pilih Modul</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pathPicker}>
                    {targetModules.map(m => (
                      <TouchableOpacity 
                        key={m.id} 
                        style={[styles.pathChip, selectedModId === m.id && styles.pathChipActive]}
                        onPress={() => setSelectedModId(m.id)}
                      >
                        <Text style={[styles.pathChipText, selectedModId === m.id && styles.pathChipTextActive]}>{m.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              {selectedModId && (
                <>
                  <Text style={styles.modalLabel}>Pilih Pelajaran (Lesson)</Text>
                  <ScrollView style={styles.lessonPicker}>
                    {targetLessons.map(l => (
                      <TouchableOpacity 
                        key={l.id} 
                        style={[styles.lessonPickItem, selectedLessonId === l.id && styles.lessonPickItemActive]}
                        onPress={() => setSelectedLessonId(l.id)}
                      >
                        <Text style={[styles.lessonPickText, selectedLessonId === l.id && styles.lessonPickTextActive]}>{l.name}</Text>
                        {selectedLessonId === l.id && <Check size={18} color={colors.primary} />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              <TouchableOpacity 
                style={[styles.saveConfirmBtn, (!selectedLessonId || isSaving) && styles.disabledBtn]}
                onPress={handleSaveToNote}
                disabled={!selectedLessonId || isSaving}
              >
                {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveConfirmText}>SIMPAN SEBAGAI CATATAN</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {mode === "hub" && renderHub()}
      {mode === "lesson" && renderLessonFlashcard()}
      {mode === "detail" && renderDetail()}
    </View>
  );
}

const makeStyles = (c: ColorScheme, isDark: boolean, palette: string) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  fullScreen: { flex: 1, backgroundColor: c.background },
  
  // Hub Styles
  hubContainer: { flex: 1 },
  headerHub: { paddingHorizontal: 20, paddingBottom: 30, borderBottomLeftRadius: 40, borderBottomRightRadius: 40 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 25 },
  hubTitle: { fontSize: 24, fontWeight: "900", color: "#fff" },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  
  tabBar: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, padding: 5, marginBottom: 20 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 16 },
  activeTab: { backgroundColor: "#fff" },
  tabText: { fontSize: 14, fontWeight: "800", color: "#fff" },
  activeTabText: { color: c.primary },
  
  searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 16, paddingHorizontal: 15, height: 52 },
  searchInput: { flex: 1, color: "#fff", fontSize: 16, marginLeft: 12, fontWeight: "600" },

  hubContent: { padding: 20 },
  lessonGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 15 },
  lessonCard: { 
    width: '100%', 
    backgroundColor: c.surface, 
    borderRadius: 20, 
    padding: 16, 
    borderWidth: 1, 
    borderColor: c.border, 
    marginBottom: 12,
    elevation: 3, 
    shadowColor: "#000", 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.05, 
    shadowRadius: 8 
  },
  lessonHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  lessonIconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.primaryLight, alignItems: "center", justifyContent: "center", marginRight: 12 },
  lessonInfo: { flex: 1 },
  lessonTitle: { fontSize: 16, fontWeight: "800", color: c.text },
  lessonPreview: { fontSize: 13, fontWeight: "600", color: c.primary, marginTop: 1 },
  lessonMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  lessonSub: { fontSize: 11, fontWeight: "700", color: c.textMuted },
  lessonProgressText: { fontSize: 11, fontWeight: "800", color: c.primary },
  lessonProgressTrack: { height: 6, backgroundColor: c.border, borderRadius: 3, overflow: "hidden" },
  lessonProgressFill: { height: "100%", borderRadius: 3 },

  miniHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 20, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  miniHeaderTitle: { fontSize: 18, fontWeight: "900", color: "#fff" },
  miniHeaderCount: { fontSize: 14, fontWeight: "800", color: "rgba(255,255,255,0.8)" },


  // Grammar Study List Styles
  studyList: { padding: 20, gap: 12 },
  studyItem: { 
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: c.surface, 
    padding: 16, 
    borderRadius: 20, 
    borderWidth: 1, 
    borderColor: c.border,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5
  },
  studyItemBadge: { 
    width: 32, 
    height: 32, 
    borderRadius: 10, 
    backgroundColor: c.primaryLight, 
    alignItems: "center", 
    justifyContent: "center", 
    marginRight: 15 
  },
  studyItemIndex: { fontSize: 12, fontWeight: "900", color: c.primary },
  studyItemContent: { flex: 1 },
  studyItemTitle: { fontSize: 18, fontWeight: "800", color: c.text, marginBottom: 2 },
  studyItemSub: { fontSize: 13, color: c.textMuted, fontWeight: "600" },

  // Premium Flashcard Styles
  premiumGameContainer: { flex: 1, padding: 25, justifyContent: "center" },
  premiumCard: { 
    width: "100%", 
    height: 480, 
    borderRadius: 36, 
    elevation: 12, 
    shadowColor: "#000", 
    shadowOffset: { width: 0, height: 12 }, 
    shadowOpacity: 0.15, 
    shadowRadius: 24, 
    borderWidth: 1, 
    borderColor: c.border,
    overflow: "hidden" 
  },
  cardFrontPremium: { backgroundColor: c.surface },
  cardBackPremium: { backgroundColor: isDark ? "rgba(79, 70, 229, 0.15)" : c.primaryLight, borderColor: c.primary + "40" },
  premiumCardInner: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  cardTag: { 
    position: "absolute", 
    top: 30, 
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.primaryLight, 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 20 
  },
  cardTagText: { fontSize: 10, fontWeight: "900", color: c.primary, letterSpacing: 1 },
  premiumCardMain: { fontSize: 52, fontWeight: "900", color: c.text, textAlign: "center" },
  premiumCardSub: { fontSize: 24, fontWeight: "700", color: c.primary, marginTop: 12 },
  premiumCardMeaning: { fontSize: 36, fontWeight: "800", color: c.text, textAlign: "center", lineHeight: 48 },
  premiumCardSecondary: { marginTop: 20, paddingHorizontal: 15, paddingVertical: 8, backgroundColor: "rgba(0,0,0,0.05)", borderRadius: 12 },
  premiumCardSecondaryText: { fontSize: 14, fontWeight: "700", color: c.textSecondary },
  premiumTapHint: { position: "absolute", bottom: 30, flexDirection: "row", alignItems: "center", gap: 8 },
  premiumTapHintText: { fontSize: 11, fontWeight: "800", color: c.textMuted, letterSpacing: 1 },
  
  premiumProgress: { width: 100, height: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, marginTop: 6, overflow: "hidden" },
  premiumProgressBar: { height: "100%", backgroundColor: "#fff" },

  premiumNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 35, minHeight: 60 },
  tracingContainer: { flex: 1, flexDirection: "row", gap: 12 },
  tracingBtn: { flex: 1, height: 56, borderRadius: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  wrongBtn: { backgroundColor: c.danger },
  correctBtn: { backgroundColor: c.success },
  tracingBtnText: { color: "#fff", fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  
  // N5 Custom Hero
  n5Hero: { marginBottom: 25, borderRadius: 24, overflow: "hidden", backgroundColor: c.primary },
  n5HeroGrad: { padding: 20 },
  n5HeroRow: { flexDirection: "row", alignItems: "center", gap: 15, marginBottom: 20 },
  n5HeroIcon: { width: 60, height: 60, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  n5HeroText: { flex: 1 },
  n5HeroTitle: { fontSize: 20, fontWeight: "900", color: "#fff" },
  n5HeroSub: { fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: "600", marginTop: 4 },
  n5HeroStats: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.15)", borderRadius: 16, padding: 12 },
  n5StatItem: { flex: 1, alignItems: "center" },
  n5StatVal: { fontSize: 14, fontWeight: "900", color: "#fff" },
  n5StatLabel: { fontSize: 9, fontWeight: "700", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", marginTop: 2 },
  n5StatDivider: { width: 1, height: 20, backgroundColor: "rgba(255,255,255,0.1)" },
  n5ResumeBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", paddingHorizontal: 15, paddingVertical: 8, borderRadius: 12, marginLeft: 10 },
  n5ResumeText: { fontSize: 12, fontWeight: "900", color: c.primary },

  // Tool Styles
  addToCourseBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 18, borderRadius: 20, borderWidth: 2, borderColor: c.primaryLight, marginTop: 20 },
  addToCourseBtnText: { fontSize: 15, fontWeight: "800", color: c.primary },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: c.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 25, maxHeight: "80%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: "900", color: c.text },
  modalLabel: { fontSize: 11, fontWeight: "900", color: c.textMuted, textTransform: "uppercase", letterSpacing: 1, marginTop: 15, marginBottom: 10 },
  pathPicker: { flexDirection: "row", marginBottom: 10 },
  pathChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: c.background, marginRight: 10, borderWidth: 1, borderColor: c.border },
  pathChipActive: { backgroundColor: c.primary, borderColor: c.primary },
  pathChipText: { fontSize: 13, fontWeight: "700", color: c.textSecondary },
  pathChipTextActive: { color: "#fff" },
  lessonPicker: { maxHeight: 200, marginBottom: 20 },
  lessonPickItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: c.border },
  lessonPickItemActive: { borderBottomColor: c.primary },
  lessonPickText: { fontSize: 14, fontWeight: "600", color: c.text },
  lessonPickTextActive: { color: c.primary, fontWeight: "800" },
  saveConfirmBtn: { backgroundColor: c.primary, paddingVertical: 18, borderRadius: 20, alignItems: "center", justifyContent: "center", marginTop: 10 },
  saveConfirmText: { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 1 },

  // Existing styles...
  // Detail Styles
  detailHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 20, backgroundColor: c.background },
  detailBackBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border },
  detailHeaderTitle: { fontSize: 18, fontWeight: "900", color: c.text },
  detailContent: { padding: 25 },
  detailHero: { alignItems: "center", marginBottom: 30, paddingBottom: 30, borderBottomWidth: 1, borderBottomColor: c.border },
  heroMain: { fontSize: 48, fontWeight: "900", color: c.text, textAlign: "center" },
  heroSub: { fontSize: 22, fontWeight: "800", color: c.primary, marginTop: 10, textAlign: "center" },
  
  detailSection: { marginBottom: 25 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  sectionLabel: { fontSize: 12, fontWeight: "900", color: c.textMuted, letterSpacing: 1 },
  sectionText: { fontSize: 16, color: c.text, lineHeight: 26, fontWeight: "500" },
  polaBox: { backgroundColor: c.primaryLight, padding: 20, borderRadius: 20 },
  polaText: { fontSize: 18, fontWeight: "800", color: c.primary },
  exampleCard: { backgroundColor: c.surface, padding: 18, borderRadius: 20, marginBottom: 12, borderWidth: 1, borderColor: c.border },
  exJp: { fontSize: 18, fontWeight: "700", color: c.text, marginBottom: 6 },
  exId: { fontSize: 15, color: c.textSecondary, fontStyle: "italic" },

  meanGrid: { gap: 15, marginBottom: 30 },
  meanRow: { backgroundColor: c.surface, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: c.border },
  meanLabel: { fontSize: 10, fontWeight: "900", color: c.primary, marginBottom: 5 },
  meanVal: { fontSize: 18, fontWeight: "800", color: c.text },
  speakBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: c.primary, paddingVertical: 20, borderRadius: 24 },
  speakBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 }
});
