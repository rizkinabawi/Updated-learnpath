import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors, useTheme } from "@/contexts/ThemeContext";
import { db, auth } from "@/utils/firebase";
import { doc, updateDoc, onSnapshot, collection, query, orderBy, limit } from "firebase/firestore";
import { toast } from "@/components/Toast";
import { shadowSm, type ColorScheme } from "@/constants/colors";

export default function SenseiDashboard() {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState("0"); // Default room for demo

  // Simulation: Sensei controls the "Live" status of a room in Firestore
  const toggleLive = async (val: boolean) => {
    setIsLive(val);
    toast.success(val ? "Sesi sekarang LIVE!" : "Sesi telah diakhiri.");
    // In real app, update Firestore status:
    // await updateDoc(doc(db, "live_rooms", activeRoomId), { status: val ? 'live' : 'upcoming' });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sensei Dashboard</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.statusCard, shadowSm]}>
          <View style={styles.statusInfo}>
            <Text style={styles.statusLabel}>Status Live Stream</Text>
            <Text style={[styles.statusValue, { color: isLive ? colors.danger : colors.textMuted }]}>
              {isLive ? "LIVE" : "OFFLINE"}
            </Text>
          </View>
          <Switch
            value={isLive}
            onValueChange={toggleLive}
            trackColor={{ false: colors.border, true: colors.danger }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kontrol Kelas</Text>
          <View style={styles.grid}>
            <ControlBtn icon="video" label="Mulai Kamera" color={colors.primary} />
            <ControlBtn icon="mic" label="Unmute Mic" color={colors.success} />
            <ControlBtn icon="monitor" label="Share Screen" color={colors.purple} />
            <ControlBtn icon="message-square" label="Buka Chat" color={colors.amber} 
              onPress={() => router.push({ pathname: "/live-room", params: { id: activeRoomId, title: "Moderasi Chat" } } as any)} />
          </View>
        </View>

        <View style={styles.infoBox}>
          <Feather name="info" size={20} color={colors.primary} />
          <Text style={styles.infoText}>
            Sebagai Sensei, gunakan OBS atau Larix Broadcaster untuk streaming ke RTMP server. 
            Chat akan otomatis muncul di aplikasi murid.
          </Text>
        </View>

        <TouchableOpacity style={styles.endBtn} onPress={() => toggleLive(false)}>
          <Text style={styles.endBtnText}>Akhiri Sesi Kelas</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function ControlBtn({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress?: () => void }) {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  return (
    <TouchableOpacity style={[styles.controlBtn, shadowSm]} onPress={onPress}>
      <View style={[styles.iconWrap, { backgroundColor: color + "15" }]}>
        <Feather name={icon as any} size={24} color={color} />
      </View>
      <Text style={styles.controlLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (c: ColorScheme, isDark: boolean, palette: string) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: c.borderLight },
  backBtn: { padding: 8, marginLeft: -8 },
  headerTitle: { fontSize: 20, fontWeight: "900", color: c.text, marginLeft: 8 },
  scrollContent: { padding: 20, gap: 20 },
  
  statusCard: { flexDirection: "row", alignItems: "center", backgroundColor: c.surface, padding: 20, borderRadius: 24, borderWidth: 1, borderColor: c.border },
  statusInfo: { flex: 1 },
  statusLabel: { fontSize: 14, fontWeight: "700", color: c.textMuted, marginBottom: 4 },
  statusValue: { fontSize: 22, fontWeight: "900" },
  
  section: { gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: c.text, marginLeft: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  controlBtn: { width: "48%", backgroundColor: c.surface, padding: 20, borderRadius: 20, alignItems: "center", gap: 12, borderWidth: 1, borderColor: c.border },
  iconWrap: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  controlLabel: { fontSize: 14, fontWeight: "800", color: c.text },
  
  infoBox: { flexDirection: "row", gap: 12, backgroundColor: c.primaryLight, padding: 16, borderRadius: 16, alignItems: "center" },
  infoText: { flex: 1, fontSize: 13, color: c.primary, fontWeight: "600", lineHeight: 18 },
  
  endBtn: { backgroundColor: c.danger, paddingVertical: 18, borderRadius: 18, alignItems: "center", marginTop: 20 },
  endBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },
});
