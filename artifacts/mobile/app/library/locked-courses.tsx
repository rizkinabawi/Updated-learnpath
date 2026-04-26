/**
 * library/locked-courses.tsx
 *
 * A specialized dashboard for the learner to see all imported, DRM-protected courses.
 */

import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/contexts/ThemeContext";
import { getLearningPaths, type LearningPath, getCourseProgress } from "@/utils/storage";

export default function LockedCoursesScreen() {
  const colors = useColors();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [lockedPaths, setLockedPaths] = useState<(LearningPath & { progress?: number })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const all = await getLearningPaths();
      const filtered = all.filter(p => p.isLocked);
      
      // Load progress for each
      const withProgress = await Promise.all(filtered.map(async (p) => {
        const prog = await getCourseProgress(p.id);
        return { ...p, progress: prog.percentage };
      }));

      setLockedPaths(withProgress);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: LearningPath & { progress?: number } }) => (
    <TouchableOpacity 
      style={styles.card}
      onPress={() => router.push({ pathname: "/(tabs)/collection" as any, params: { pathId: item.id } })}
    >
      <View style={styles.cardIcon}>
        <Feather name={(item.icon as any) || "shield"} size={24} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.cardSub} numberOfLines={1}>{item.description || "Secured Course Bundle"}</Text>
        
        {/* Visual Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <View 
              style={[
                styles.progressBarFill, 
                { width: `${Math.max(5, item.progress || 0)}%`, backgroundColor: colors.primary }
              ]} 
            />
          </View>
          <Text style={styles.progressValue}>{Math.round(item.progress || 0)}%</Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.badge}>
            <Feather name="lock" size={10} color="#166534" />
            <Text style={styles.badgeText}>DRM Protected</Text>
          </View>
        </View>
      </View>
      <Feather name="chevron-right" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Kursus Terkunci</Text>
          <Text style={styles.subtitle}>Konten premium hasil import bundle aman</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : lockedPaths.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Feather name="shield-off" size={48} color={colors.border} />
          </View>
          <Text style={styles.emptyTitle}>Belum ada kursus terkunci</Text>
          <Text style={styles.emptyText}>
            Kursus hasil import dari bundle yang berpassword akan muncul di sini secara otomatis.
          </Text>
        </View>
      ) : (
        <FlatList
          data={lockedPaths}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 20, gap: 15 }}
          onRefresh={loadData}
          refreshing={loading}
        />
      )}
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.background,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.border,
  },
  title: { fontSize: 20, fontWeight: "800", color: c.text },
  subtitle: { fontSize: 12, color: c.textSecondary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    padding: 16,
    backgroundColor: c.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.border,
  },
  cardIcon: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: c.primary + "10",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: c.text },
  cardSub: { fontSize: 13, color: c.textSecondary, marginTop: 2 },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: c.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressValue: {
    fontSize: 11,
    fontWeight: "800",
    color: c.text,
    width: 32,
    textAlign: "right",
  },
  footer: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between",
    marginTop: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#dcfce7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: "#166534", textTransform: "uppercase" },
  progressText: { fontSize: 11, fontWeight: "700", color: c.primary },
  emptyIcon: { marginBottom: 20 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: c.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: c.textSecondary, textAlign: "center", lineHeight: 20 },
});
