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
  Layers, 
  Play, 
  ChevronRight,
  Activity,
} from "lucide-react-native";
import { 
  getFlashcards, 
  getSpacedRepData,
  type Flashcard 
} from "@/utils/storage";
import { useColors, useTheme } from "@/contexts/ThemeContext";
import { useRouter } from "expo-router";

interface Props {
  lessonId: string;
}

export default function FlashcardSection({ lessonId }: Props) {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  const router = useRouter();

  const [cards, setCards] = useState<Flashcard[]>([]);
  const [dueCount, setDueCount] = useState(0);

  useEffect(() => {
    loadCards();
  }, [lessonId]);

  const loadCards = async () => {
    const list = await getFlashcards(lessonId);
    setCards(list);
    
    // Check spaced repetition
    const rep = await getSpacedRepData();
    const now = Date.now();
    const due = list.filter(c => {
        const d = rep.find(r => r.cardId === c.id);
        return !d || new Date(d.nextReview).getTime() <= now;
    });
    setDueCount(due.length);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.list}>
        {cards.length === 0 ? (
          <View style={styles.empty}>
             <Layers size={48} color={colors.border} />
             <Text style={styles.emptyText}>Belum ada kartu memori</Text>
             <TouchableOpacity 
                style={styles.addBtn}
                onPress={() => router.push({ pathname: "/create-flashcard/[lessonId]", params: { lessonId } })}
             >
                <Text style={styles.addBtnText}>Buat Kartu Pertama</Text>
             </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.summaryCard}>
                <View style={styles.statItem}>
                    <Text style={styles.statVal}>{cards.length}</Text>
                    <Text style={styles.statLabel}>Total Kartu</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                    <Text style={[styles.statVal, { color: colors.warning }]}>{dueCount}</Text>
                    <Text style={styles.statLabel}>Perlu Review</Text>
                </View>
            </View>

            <TouchableOpacity 
                style={styles.startBtn}
                onPress={() => router.push(`/flashcard/${lessonId}`)}
            >
                <Play size={20} color="#fff" fill="#fff" />
                <Text style={styles.startBtnText}>Mulai Belajar Sekarang</Text>
            </TouchableOpacity>

            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Pratinjau Kartu</Text>
                <TouchableOpacity onPress={() => router.push(`/flashcard/${lessonId}`)}>
                    <Text style={styles.viewAll}>Lihat Semua</Text>
                </TouchableOpacity>
            </View>

            {cards.slice(0, 5).map(card => (
                 <View key={card.id} style={styles.miniCard}>
                    <Text style={styles.miniQ} numberOfLines={1}>{card.question}</Text>
                    <ChevronRight size={14} color={colors.textMuted} />
                 </View>
            ))}
          </>
        )}
      </ScrollView>

      <TouchableOpacity 
        style={styles.fab}
        onPress={() => router.push({ pathname: "/create-flashcard/[lessonId]", params: { lessonId } })}
      >
        <Plus size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (c: any, isDark: boolean, palette: string) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  list: { padding: 16, gap: 16, paddingBottom: 100 },
  summaryCard: { 
    flexDirection: "row", backgroundColor: c.surface, 
    borderRadius: 20, padding: 20, borderWidth: 1, borderColor: c.border 
  },
  statItem: { flex: 1, alignItems: "center" },
  statVal: { fontSize: 24, fontWeight: "900", color: c.text },
  statLabel: { fontSize: 11, fontWeight: "700", color: c.textMuted, marginTop: 2, textTransform: "uppercase" },
  statDivider: { width: 1, backgroundColor: c.border, marginHorizontal: 10 },
  
  startBtn: { 
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12,
    backgroundColor: c.primary, paddingVertical: 16, borderRadius: 16,
    elevation: 4, shadowColor: c.primary, shadowOpacity: 0.3, shadowRadius: 10
  },
  startBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: c.textMuted, textTransform: "uppercase" },
  viewAll: { fontSize: 13, fontWeight: "700", color: c.primary },

  miniCard: { 
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: c.surface, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: c.border
  },
  miniQ: { fontSize: 14, fontWeight: "600", color: c.text, flex: 1, marginRight: 10 },

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
