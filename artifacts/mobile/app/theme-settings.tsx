import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, type ThemeMode, type Palette } from "@/contexts/ThemeContext";
import { Spacing, Radius, FontSize, type ColorScheme } from "@/constants/colors";

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
  const { mode, palette, setMode, setPalette, colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Tema</Text>
          <Text style={styles.headerSub}>Pilih tampilan & warna app</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing["4xl"] + Spacing.lg }}>
        <Text style={styles.sectionTitle}>Palet Warna</Text>
        <View style={{ gap: Spacing.md }}>
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
                        style={[
                          styles.swatch,
                          {
                            backgroundColor: c,
                            borderColor: c.toUpperCase() === "#FFFFFF" ? colors.border : "transparent",
                          },
                        ]}
                      />
                    ))}
                  </View>
                </View>
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active && <Feather name="check" size={14} color={colors.white} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: Spacing["2xl"] + Spacing.xs }]}>Mode Tampilan</Text>
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
                  color={active ? colors.white : colors.text}
                />
                <Text style={[styles.modeLabel, active && { color: colors.white }]}>{opt.title}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.note}>
          <Feather name="info" size={14} color={colors.textMuted} />
          <Text style={styles.noteText}>
            Tema langsung diterapkan ke seluruh aplikasi. Jika ada layar yang belum berganti, kembali sebentar lalu buka kembali.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ColorScheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      gap: Spacing.md,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: Radius.md,
      backgroundColor: c.background,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: { fontSize: FontSize.lg, fontWeight: "700", color: c.text },
    headerSub: { fontSize: FontSize.xs, color: c.textMuted, marginTop: 2 },
    sectionTitle: {
      fontSize: FontSize.sm,
      fontWeight: "700",
      color: c.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: Spacing.md,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 2,
      borderColor: c.border,
    },
    cardActive: { borderColor: c.primary },
    cardLeft: { flex: 1 },
    cardTitle: { fontSize: FontSize.md + 1, fontWeight: "700", color: c.text },
    cardSub: { fontSize: FontSize.sm, color: c.textMuted, marginTop: Spacing.xs },
    swatchRow: { flexDirection: "row", gap: Spacing.xs + 2, marginTop: Spacing.md },
    swatch: { width: 20, height: 20, borderRadius: 10, borderWidth: 1 },
    radio: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    radioActive: { backgroundColor: c.primary, borderColor: c.primary },
    modeRow: { flexDirection: "row", gap: Spacing.md - 2 },
    modeBtn: {
      flex: 1,
      backgroundColor: c.surface,
      borderWidth: 2,
      borderColor: c.border,
      paddingVertical: Spacing.lg,
      borderRadius: Radius.lg - 2,
      alignItems: "center",
      gap: Spacing.xs + 2,
    },
    modeBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    modeLabel: { fontSize: FontSize.sm, fontWeight: "700", color: c.text },
    note: {
      marginTop: Spacing["2xl"],
      flexDirection: "row",
      alignItems: "flex-start",
      gap: Spacing.sm,
      padding: Spacing.md,
      backgroundColor: c.surface,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    noteText: { flex: 1, fontSize: FontSize.xs, color: c.textMuted, lineHeight: 16 },
  });
