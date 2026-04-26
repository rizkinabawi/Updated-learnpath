import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Image,
} from "react-native";
import { 
  Plus, 
  BookOpen, 
  Clock, 
  Play, 
  FileText, 
  ExternalLink,
  ChevronRight,
  Globe,
  Video,
  Paperclip,
} from "lucide-react-native";
import { 
  getStudyMaterials, 
  type StudyMaterial 
} from "@/utils/storage";
import { useColors, useTheme } from "@/contexts/ThemeContext";
import { useRouter } from "expo-router";

interface Props {
  lessonId: string;
}

export default function MaterialSection({ lessonId }: Props) {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  const router = useRouter();

  const [materials, setMaterials] = useState<StudyMaterial[]>([]);

  useEffect(() => {
    loadMaterials();
  }, [lessonId]);

  const loadMaterials = async () => {
    const list = await getStudyMaterials(lessonId);
    setMaterials(list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "youtube": return <Video size={16} color="#FF0000" />;
      case "googledoc": return <Globe size={16} color="#1967D2" />;
      case "file": return <Paperclip size={16} color={colors.amber} />;
      default: return <FileText size={16} color={colors.primary} />;
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.list}>
        {materials.length === 0 ? (
          <View style={styles.empty}>
             <BookOpen size={48} color={colors.border} />
             <Text style={styles.emptyText}>Materi belum tersedia</Text>
             <TouchableOpacity 
                style={styles.addBtn}
                onPress={() => router.push({ pathname: "/study-material/[lessonId]", params: { lessonId } })}
             >
                <Text style={styles.addBtnText}>Tambah Materi</Text>
             </TouchableOpacity>
          </View>
        ) : (
          materials.map(mat => (
            <TouchableOpacity 
                key={mat.id} 
                style={styles.card}
                onPress={() => router.push({ pathname: "/study-material/view/[matId]", params: { matId: mat.id, lessonId } })}
            >
              <View style={styles.cardContent}>
                  <View style={styles.iconBox}>{getIcon(mat.type)}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.matTitle} numberOfLines={1}>{mat.title}</Text>
                    <Text style={styles.matType}>{mat.type.toUpperCase()}</Text>
                  </View>
                  <ChevronRight size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <TouchableOpacity 
        style={styles.fab}
        onPress={() => router.push({ pathname: "/study-material/[lessonId]", params: { lessonId } })}
      >
        <Plus size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (c: any, isDark: boolean, palette: string) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  list: { padding: 16, gap: 10, paddingBottom: 100 },
  card: { backgroundColor: c.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: c.border },
  cardContent: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: c.background, alignItems: "center", justifyContent: "center" },
  matTitle: { fontSize: 15, fontWeight: "800", color: c.text },
  matType: { fontSize: 10, fontWeight: "700", color: c.textMuted, marginTop: 1 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 12 },
  emptyText: { color: c.textMuted, fontWeight: "600" },
  addBtn: { backgroundColor: c.primaryLight, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  addBtnText: { color: c.primary, fontWeight: "700", fontSize: 13 },
  fab: {
    position: "absolute", right: 20, bottom: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: c.secondary || c.primary, alignItems: "center", justifyContent: "center",
    elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8,
  }
});
