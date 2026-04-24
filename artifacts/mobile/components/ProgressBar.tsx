import { useColors } from "@/contexts/ThemeContext";
import React, { useMemo } from "react";
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
  color,
  backgroundColor,
  height = 6,
  borderRadius = 999,
}: ProgressBarProps) => {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const fillColor = color ?? colors.primary;
  const trackBg = backgroundColor ?? colors.border;

  const pct = Math.min(100, Math.max(0, value));
  return (
    <View style={[styles.track, { backgroundColor: trackBg, height, borderRadius }]}>
      <View
        style={[
          styles.fill,
          { backgroundColor: fillColor, width: `${pct}%`, borderRadius },
        ]}
      />
    </View>
  );
};

const makeStyles = (c: ColorScheme) => StyleSheet.create({
  track: { width: "100%", overflow: "hidden" },
  fill: { height: "100%" },
});
