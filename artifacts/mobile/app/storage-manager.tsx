import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  X,
  HardDrive,
  Trash2,
  Database,
  Music,
  Files,
  RefreshCw,
  Info,
} from "lucide-react-native";
import { useColors, useTheme } from "@/contexts/ThemeContext";
import { getStorageStats, clearAppCache, type StorageStats } from "@/utils/storage";
import { toast } from "@/components/Toast";
import { useTranslation } from "@/contexts/LanguageContext";

export default function StorageManagerScreen() {
  const colors = useColors();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    const s = await getStorageStats();
    setStats(s);
    setLoading(false);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleClearTemp = async () => {
    Alert.alert(
      "Bersihkan Cache SQLite",
      "Hapus file database sementara dari proses impor Anki? Ini tidak akan menghapus kartu yang sudah diimpor.",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Bersihkan",
          style: "destructive",
          onPress: async () => {
            setClearing(true);
            await clearAppCache("temp");
            await loadStats();
            setClearing(false);
            toast.success("Cache sementara dibersihkan");
          },
        },
      ]
    );
  };

  const handleClearMedia = async () => {
    Alert.alert(
      "Hapus Semua Media Anki",
      "PERINGATAN: Ini akan menghapus SEMUA gambar dan audio dari deck Anki yang sudah diimpor. Kartu teks akan tetap ada tapi gambar/suara akan hilang.",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus Permanen",
          style: "destructive",
          onPress: async () => {
            setClearing(true);
            await clearAppCache("media");
            await loadStats();
            setClearing(false);
            toast.success("Semua media Anki dihapus");
          },
        },
      ]
    );
  };

  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <X size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manajemen Penyimpanan</Text>
        <TouchableOpacity onPress={loadStats} disabled={loading} style={styles.refreshBtn}>
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <RefreshCw size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* Total Storage Card */}
        <View style={styles.mainCard}>
          <View style={styles.mainCardIcon}>
            <HardDrive size={32} color={colors.primary} />
          </View>
          <Text style={styles.mainCardValue}>
            {stats ? formatSize(stats.total) : "0 MB"}
          </Text>
          <Text style={styles.mainCardLabel}>Total Memori Digunakan Aplikasi</Text>
          
          <View style={styles.progressBar}>
             <View 
                style={[
                  styles.progressFill, 
                  { 
                    width: stats && stats.total > 0 
                      ? `${Math.min(100, (stats.sqliteSize / Math.max(1, stats.total)) * 100)}%` 
                      : "0%",
                    backgroundColor: colors.amber 
                  }
                ]} 
             />
             <View 
                style={[
                  styles.progressFill, 
                  { 
                    width: stats && stats.total > 0 
                      ? `${Math.min(100, (stats.ankiMediaSize / Math.max(1, stats.total)) * 100)}%` 
                      : "0%",
                    backgroundColor: colors.primary 
                  }
                ]} 
             />
             <View 
                style={[
                  styles.progressFill, 
                  { 
                    width: stats && stats.total > 0 
                      ? `${Math.min(100, (stats.assetsSize / Math.max(1, stats.total)) * 100)}%` 
                      : "0%",
                    backgroundColor: colors.success 
                  }
                ]} 
             />
          </View>

          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: colors.amber }]} />
              <Text style={styles.legendText}>SQLite</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: colors.primary }]} />
              <Text style={styles.legendText}>Media Anki</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: colors.success }]} />
              <Text style={styles.legendText}>Aset Lain</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Rincian Folder</Text>

        {/* Details List */}
        <View style={styles.listCard}>
          <View style={styles.listItem}>
            <View style={[styles.itemIcon, { backgroundColor: colors.amber + "20" }]}>
              <Database size={20} color={colors.amber} />
            </View>
            <View style={styles.itemContent}>
              <Text style={styles.itemTitle}>Database (SQLite)</Text>
              <Text style={styles.itemSub}>File sistem dan database impor</Text>
            </View>
            <Text style={styles.itemValue}>{stats ? formatSize(stats.sqliteSize) : "..."}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.listItem}>
            <View style={[styles.itemIcon, { backgroundColor: colors.primary + "20" }]}>
              <Music size={20} color={colors.primary} />
            </View>
            <View style={styles.itemContent}>
              <Text style={styles.itemTitle}>Media Anki</Text>
              <Text style={styles.itemSub}>Audio & Gambar dari Anki</Text>
            </View>
            <Text style={styles.itemValue}>{stats ? formatSize(stats.ankiMediaSize) : "..."}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.listItem}>
            <View style={[styles.itemIcon, { backgroundColor: colors.success + "20" }]}>
              <Files size={20} color={colors.success} />
            </View>
            <View style={styles.itemContent}>
              <Text style={styles.itemTitle}>Aset Pengguna</Text>
              <Text style={styles.itemSub}>Catatan, Profil & Lampiran</Text>
            </View>
            <Text style={styles.itemValue}>{stats ? formatSize(stats.assetsSize) : "..."}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Tindakan Pembersihan</Text>

        <TouchableOpacity 
          style={styles.actionBtn} 
          onPress={handleClearTemp}
          disabled={clearing}
        >
          <View style={[styles.actionIcon, { backgroundColor: colors.amber + "15" }]}>
            <RefreshCw size={20} color={colors.amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Bersihkan Cache Impor</Text>
            <Text style={styles.actionSub}>Hapus file .db sisa proses impor Anki</Text>
          </View>
          <Trash2 size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionBtn, { marginTop: 12 }]} 
          onPress={handleClearMedia}
          disabled={clearing}
        >
          <View style={[styles.actionIcon, { backgroundColor: colors.danger + "15" }]}>
            <Music size={20} color={colors.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Hapus Semua Media Anki</Text>
            <Text style={styles.actionSub}>Bersihkan semua gambar/audio impor</Text>
          </View>
          <Trash2 size={18} color={colors.danger} />
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Info size={16} color={colors.textMuted} />
          <Text style={styles.infoText}>
            Pembersihan cache hanya menghapus file media atau database sementara. Data kartu flashcard dan quiz Anda tetap aman di sistem utama.
          </Text>
        </View>
      </ScrollView>

      {clearing && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.overlayText}>Sedang membersihkan...</Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: {
    backgroundColor: c.primary,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 16,
  },
  headerTitle: { fontSize: 20, fontWeight: "900", color: "#fff", flex: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  refreshBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  content: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  mainCard: {
    backgroundColor: c.card,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  mainCardIcon: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: c.primary + "15",
    alignItems: "center", justifyContent: "center",
    marginBottom: 16,
  },
  mainCardValue: { fontSize: 32, fontWeight: "900", color: c.dark },
  mainCardLabel: { fontSize: 13, color: c.textMuted, fontWeight: "600", marginBottom: 20 },
  progressBar: {
    height: 10, width: "100%", 
    backgroundColor: c.border, borderRadius: 5,
    flexDirection: "row", overflow: "hidden",
    marginBottom: 16,
  },
  progressFill: { height: "100%" },
  legend: { flexDirection: "row", gap: 16, flexWrap: "wrap", justifyContent: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: c.textSecondary, fontWeight: "700" },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: c.textSecondary, textTransform: "uppercase", letterSpacing: 1, marginTop: 24, marginBottom: 12, paddingHorizontal: 4 },
  listCard: { backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  listItem: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  itemIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  itemContent: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: "700", color: c.dark },
  itemSub: { fontSize: 12, color: c.textMuted },
  itemValue: { fontSize: 14, fontWeight: "800", color: c.dark },
  divider: { height: 1, backgroundColor: c.border, marginHorizontal: 16 },
  actionBtn: {
    flexDirection: "row", alignItems: "center", 
    backgroundColor: c.card, borderRadius: 20, 
    padding: 16, gap: 12, borderWidth: 1, borderColor: c.border
  },
  actionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionTitle: { fontSize: 15, fontWeight: "700", color: c.dark },
  actionSub: { fontSize: 12, color: c.textMuted },
  infoBox: { flexDirection: "row", gap: 10, backgroundColor: c.background, padding: 16, borderRadius: 16, marginTop: 24, borderWidth: 1, borderColor: c.border, borderStyle: "dashed" },
  infoText: { flex: 1, fontSize: 12, color: c.textMuted, lineHeight: 18 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", zIndex: 100 },
  overlayText: { color: "#fff", fontWeight: "700", marginTop: 12 },
});
