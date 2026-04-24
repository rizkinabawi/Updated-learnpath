import { useColors } from "@/contexts/ThemeContext";
import React from "react";
import { View, StyleSheet } from "react-native";
import { type ColorScheme } from "@/constants/colors";

interface ProgressBarProps {
  value: number;
  color?: string;
  backgroundColor?: string;
  height?: number;
  borderRadius?: number;
}

export const ProgressBar = ({
  value,
  color = colors.primary,
  backgroundColor = colors.border,
  height = 6,
  borderRadius = 999,
}: ProgressBarProps) => {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const pct = Math.min(100, Math.max(0, value));
  return (
    <View style={[styles.track, { backgroundColor, height, borderRadius }]}>
      <View
        style={[
          styles.fill,
          { backgroundColor: color, width: `${pct}%`, borderRadius },
        ]}
      />
    </View>
  );
};

const makeStyles = (c: ColorScheme) => StyleSheet.create({
  track: { width: "100%", overflow: "hidden" },
  fill: { height: "100%" },
});
