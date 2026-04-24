import { useColors } from "@/contexts/ThemeContext";
import React, { useMemo } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { type ColorScheme } from "@/constants/colors";

export const COURSE_ICON_CHOICES: React.ComponentProps<typeof Feather>["name"][] = [
  "book", "book-open", "code", "globe", "cpu", "layers", "award",
  "edit-3", "feather", "compass", "map", "target", "trending-up",
  "briefcase", "package", "tool", "zap", "star", "heart", "sun",
  "moon", "music", "camera", "image", "film", "headphones",
  "coffee", "anchor", "activity", "bar-chart-2", "pie-chart",
];

interface Props {
  visible: boolean;
  current?: string;
  onClose: () => void;
  onSelect: (icon: string) => void;
}

export function IconPicker({ visible, current, onClose, onSelect }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Pilih Ikon Course</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
          <Text style={styles.sub}>Tap salah satu ikon untuk diterapkan</Text>

          <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
            {COURSE_ICON_CHOICES.map((name) => {
              const active = name === current;
              return (
                <TouchableOpacity
                  key={name}
                  style={[styles.iconCell, active && styles.iconCellActive]}
                  onPress={() => {
                    onSelect(name);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <Feather
                    name={name}
                    size={22}
                    color={active ? "#fff" : colors.text}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: ColorScheme) => StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,31,61,0.4)" },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
    maxHeight: "75%",
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: c.border,
    alignSelf: "center", marginBottom: 12,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 16, fontWeight: "800", color: c.text },
  closeBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: c.background,
    alignItems: "center", justifyContent: "center",
  },
  sub: { fontSize: 12, color: c.textMuted, marginTop: 4, marginBottom: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "flex-start" },
  iconCell: {
    width: "18%",
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: c.background,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  iconCellActive: { backgroundColor: c.primary, borderColor: c.primary },
});
