import React from "react";
import { View, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

interface ProgressBarProps {
  value: number;
  color?: string;
  backgroundColor?: string;
  height?: number;
  borderRadius?: number;
}

export const ProgressBar = ({
  value,
  color = Colors.primary,
  backgroundColor = Colors.border,
  height = 6,
  borderRadius = 999,
}: ProgressBarProps) => {
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

const styles = StyleSheet.create({
  track: { width: "100%", overflow: "hidden" },
  fill: { height: "100%" },
});
