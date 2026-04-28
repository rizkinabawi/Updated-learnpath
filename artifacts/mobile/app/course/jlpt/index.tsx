import { useColors, useTheme } from "@/contexts/ThemeContext";
import React, { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { 
  ArrowLeft, 
  BookOpen, 
  Award, 
  ChevronRight, 
  Info,
  Layers,
  Search,
  Book,
  GraduationCap
} from "lucide-react-native";
import { type ColorScheme } from "@/constants/colors";

const JLPT_LEVELS = [
  { 
    id: "N1", 
    name: "JLPT N1", 
    desc: "Advanced Level - Pemahaman bahasa Jepang dalam berbagai situasi.",
    grad: ["#4F46E5", "#7C3AED"] as [string, string],
    stats: { grammar: 100, vocab: "3000+" }
  },
  { 
    id: "N2", 
    name: "JLPT N2", 
    desc: "Upper Intermediate - Pemahaman bahasa Jepang yang digunakan dalam kehidupan sehari-hari.",
    grad: ["#2563EB", "#3B82F6"] as [string, string],
    stats: { grammar: 80, vocab: "1500+" }
  },
  { 
    id: "N3", 
    name: "JLPT N3", 
    desc: "Intermediate - Jembatan antara level dasar dan tingkat lanjut.",
    grad: ["#059669", "#10B981"] as [string, string],
    stats: { grammar: 70, vocab: "1000+" }
  },
  { 
    id: "N4", 
    name: "JLPT N4", 
    desc: "Elementary - Pemahaman bahasa Jepang dasar.",
    grad: ["#D97706", "#F59E0B"] as [string, string],
    stats: { grammar: 50, vocab: "600+" }
  },
  { 
    id: "N5", 
    name: "JLPT N5", 
    desc: "Basic - Tingkat pemula dalam bahasa Jepang.",
    grad: ["#DC2626", "#EF4444"] as [string, string],
    stats: { grammar: 40, vocab: "400+" }
  },
];

export default function JLPTHub() {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.primary, colors.purple]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: Platform.OS === "web" ? 56 : insets.top + 20 }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerSub}>Japanese Proficiency</Text>
            <Text style={styles.headerTitle}>JLPT Learning Hub</Text>
          </View>
        </View>
        
        <View style={styles.heroCard}>
          <View style={styles.heroInfo}>
            <GraduationCap size={32} color="#fff" strokeWidth={1.5} />
            <Text style={styles.heroText}>Kuasai semua level JLPT dari dasar hingga mahir dengan kurikulum terpadu.</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView 
        style={styles.scroll} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHeader}>
          <Layers size={16} color={colors.primary} />
          <Text style={styles.sectionTitle}>Pilih Level Belajar</Text>
        </View>

        {JLPT_LEVELS.map((level, index) => (
          <TouchableOpacity
            key={level.id}
            activeOpacity={0.9}
            onPress={() => router.push({ pathname: "/course/jlpt/[level]", params: { level: level.id } })}
            style={styles.levelCard}
          >
            <LinearGradient
              colors={level.grad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.levelGrad}
            >
              <View style={styles.levelLeft}>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelBadgeText}>{level.id}</Text>
                </View>
                <View style={styles.levelInfo}>
                  <Text style={styles.levelName}>{level.name}</Text>
                  <Text style={styles.levelDesc} numberOfLines={2}>{level.desc}</Text>
                </View>
              </View>
              
              <View style={styles.levelStats}>
                <View style={styles.statItem}>
                  <Book size={10} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.statText}>{level.stats.grammar} Grammar</Text>
                </View>
                <View style={styles.statItem}>
                  <Search size={10} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.statText}>{level.stats.vocab} Vocab</Text>
                </View>
              </View>
              
              <View style={styles.chevronWrap}>
                <ChevronRight size={18} color="#fff" />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        ))}

        <View style={styles.infoFooter}>
          <Info size={14} color={colors.textMuted} />
          <Text style={styles.infoFooterText}>
            Semua data disinkronkan dengan database resmi JLPT. Klik pada level untuk mulai belajar.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ColorScheme, isDark: boolean, palette: string) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: { paddingHorizontal: 20, paddingBottom: 30, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: "600", textTransform: "uppercase" },
  headerTitle: { fontSize: 24, fontWeight: "900", color: "#fff" },
  
  heroCard: { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, padding: 20, marginTop: 10 },
  heroInfo: { flexDirection: "row", alignItems: "center", gap: 15 },
  heroText: { flex: 1, fontSize: 13, color: "#fff", lineHeight: 20, fontWeight: "500" },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: c.text },

  levelCard: { marginBottom: 12, borderRadius: 20, overflow: "hidden", elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  levelGrad: { padding: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  levelLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 15 },
  levelBadge: { width: 48, height: 48, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  levelBadgeText: { fontSize: 18, fontWeight: "900", color: "#fff" },
  levelInfo: { flex: 1 },
  levelName: { fontSize: 18, fontWeight: "900", color: "#fff" },
  levelDesc: { fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2, lineHeight: 16 },
  
  levelStats: { alignItems: "flex-end", marginRight: 10 },
  statItem: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 },
  statText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  
  chevronWrap: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  
  infoFooter: { flexDirection: "row", gap: 10, padding: 20, alignItems: "center", justifyContent: "center" },
  infoFooterText: { fontSize: 11, color: c.textMuted, textAlign: "center", flex: 1, fontWeight: "500" }
});
