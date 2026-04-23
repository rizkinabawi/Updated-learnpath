import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, ThemeMode, Palette } from "@/contexts/ThemeContext";
import Colors from "@/constants/colors";

const PALETTE_OPTIONS: { id: Palette; title: string; sub: string; preview: string[] }[] = [
  {
    id: "color",
    title: "Default",
    sub: "Warna penuh — biru, ungu, oranye, dst.",
    preview: ["#4C6FFF", "#FF6B6B", "#7C3AED", "#FF9500"],
  },
  {
    id: "minimal",
    title: "Minimal B&W",
    sub: "Hitam putih elegan — fokus tanpa distraksi",
    preview: ["#000000", "#333333", "#888888", "#FFFFFF"],
  },
];

const MODE_OPTIONS: { id: ThemeMode; title: string; icon: React.ComponentProps<typeof Feather>["name"] }[] = [
  { id: "light", title: "Terang", icon: "sun" },
  { id: "dark", title: "Gelap", icon: "moon" },
  { id: "system", title: "Sistem", icon: "smartphone" },
];

export default function ThemeSettings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode, palette, setMode, setPalette } = useTheme();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Tema</Text>
          <Text style={styles.headerSub}>Pilih tampilan & warna app</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {/* Palette */}
        <Text style={styles.sectionTitle}>Palet Warna</Text>
        <View style={{ gap: 10 }}>
          {PALETTE_OPTIONS.map((opt) => {
            const active = palette === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[styles.card, active && styles.cardActive]}
                activeOpacity={0.85}
                onPress={() => setPalette(opt.id)}
              >
                <View style={styles.cardLeft}>
                  <Text style={styles.cardTitle}>{opt.title}</Text>
                  <Text style={styles.cardSub}>{opt.sub}</Text>
                  <View style={styles.swatchRow}>
                    {opt.preview.map((c, i) => (
                      <View
                        key={i}
                        style={[styles.swatch, { backgroundColor: c, borderColor: c === "#FFFFFF" ? Colors.border : "transparent" }]}
                      />
                    ))}
                  </View>
                </View>
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active && <Feather name="check" size={14} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Mode */}
        <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Mode Tampilan</Text>
        <View style={styles.modeRow}>
          {MODE_OPTIONS.map((opt) => {
            const active = mode === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[styles.modeBtn, active && styles.modeBtnActive]}
                onPress={() => setMode(opt.id)}
                activeOpacity={0.8}
              >
                <Feather
                  name={opt.icon}
                  size={18}
                  color={active ? Colors.white : Colors.text}
                />
                <Text style={[styles.modeLabel, active && { color: Colors.white }]}>{opt.title}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.note}>
          <Feather name="info" size={14} color={Colors.textMuted} />
          <Text style={styles.noteText}>
            Tema akan diterapkan langsung. Buka ulang halaman untuk melihat semua perubahan.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: Colors.background,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  headerSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.border,
  },
  cardActive: { borderColor: Colors.primary },
  cardLeft: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: Colors.text },
  cardSub: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  swatchRow: { flexDirection: "row", gap: 6, marginTop: 12 },
  swatch: { width: 20, height: 20, borderRadius: 10, borderWidth: 1 },
  radio: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center", justifyContent: "center",
  },
  radioActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  modeRow: { flexDirection: "row", gap: 10 },
  modeBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    gap: 6,
  },
  modeBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  modeLabel: { fontSize: 12, fontWeight: "700", color: Colors.text },
  note: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  noteText: { flex: 1, fontSize: 11, color: Colors.textMuted, lineHeight: 16 },
});
