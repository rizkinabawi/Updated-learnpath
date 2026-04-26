import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { 
  Plus, 
  CheckSquare, 
  Play, 
  ChevronRight,
  Trophy,
  Timer,
} from "lucide-react-native";
import { 
  getQuizzes, 
  type Quiz 
} from "@/utils/storage";
import { useColors, useTheme } from "@/contexts/ThemeContext";
import { useRouter } from "expo-router";

interface Props {
  lessonId: string;
}

export default function QuizSection({ lessonId }: Props) {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  const router = useRouter();

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);

  useEffect(() => {
    loadQuizzes();
  }, [lessonId]);

  const loadQuizzes = async () => {
    const list = await getQuizzes(lessonId);
    setQuizzes(list);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.list}>
        {quizzes.length === 0 ? (
          <View style={styles.empty}>
             <CheckSquare size={48} color={colors.border} />
             <Text style={styles.emptyText}>Belum ada latihan soal</Text>
             <TouchableOpacity 
                style={styles.addBtn}
                onPress={() => router.push({ pathname: "/create-quiz/[lessonId]", params: { lessonId } })}
             >
                <Text style={styles.addBtnText}>Buat Soal Pertama</Text>
             </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.scoreCard}>
                <Trophy size={32} color={colors.amber} />
                <View style={{ flex: 1 }}>
                    <Text style={styles.scoreTitle}>Siap Untuk Ujian?</Text>
                    <Text style={styles.scoreSub}>{quizzes.length} Pertanyaan tersedia untuk dikerjakan.</Text>
                </View>
            </View>

            <TouchableOpacity 
                style={styles.startBtn}
                onPress={() => router.push(`/quiz/${lessonId}`)}
            >
                <Timer size={20} color="#fff" />
                <Text style={styles.startBtnText}>Mulai Simulasi Tryout</Text>
            </TouchableOpacity>

            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Daftar Soal</Text>
            </View>

            {quizzes.map((quiz, i) => (
                 <View key={quiz.id} style={styles.miniCard}>
                    <View style={styles.qCircle}><Text style={styles.qNum}>{i+1}</Text></View>
                    <Text style={styles.miniQ} numberOfLines={1}>{quiz.question}</Text>
                    <ChevronRight size={14} color={colors.textMuted} />
                 </View>
            ))}
          </>
        )}
      </ScrollView>

      <TouchableOpacity 
        style={styles.fab}
        onPress={() => router.push({ pathname: "/create-quiz/[lessonId]", params: { lessonId } })}
      >
        <Plus size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (c: any, isDark: boolean, palette: string) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  list: { padding: 16, gap: 16, paddingBottom: 100 },
  scoreCard: { 
    flexDirection: "row", alignItems: "center", gap: 16,
    backgroundColor: c.surface, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: c.border 
  },
  scoreTitle: { fontSize: 17, fontWeight: "900", color: c.text },
  scoreSub: { fontSize: 12, color: c.textMuted, fontWeight: "600", marginTop: 2 },
  
  startBtn: { 
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12,
    backgroundColor: c.secondary || "#10B981", paddingVertical: 16, borderRadius: 16,
    elevation: 4, shadowColor: "#10B981", shadowOpacity: 0.3, shadowRadius: 10
  },
  startBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: c.textMuted, textTransform: "uppercase" },

  miniCard: { 
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: c.surface, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border, gap: 12
  },
  qCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: c.background, alignItems: "center", justifyContent: "center" },
  qNum: { fontSize: 11, fontWeight: "900", color: c.textMuted },
  miniQ: { fontSize: 14, fontWeight: "600", color: c.text, flex: 1 },

  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 12 },
  emptyText: { color: c.textMuted, fontWeight: "600" },
  addBtn: { backgroundColor: c.primaryLight, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  addBtnText: { color: c.primary, fontWeight: "700", fontSize: 13 },
  fab: {
    position: "absolute", right: 20, bottom: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: c.primary, alignItems: "center", justifyContent: "center",
    elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8,
  }
});
