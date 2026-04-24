import { useColors } from "@/contexts/ThemeContext";
import React, { useMemo } from "react";
import { View, ViewProps, StyleSheet } from "react-native";
import { type ColorScheme } from "@/constants/colors";

interface CardProps extends ViewProps {
  children?: React.ReactNode;
}

export const Card = ({ children, style, ...props }: CardProps) => {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.card, style]} {...props}>
    {children}
  </View>
  );
};

export const CardContent = ({ children, style, ...props }: CardProps) => {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.content, style]} {...props}>
    {children}
  </View>
  );
};

const makeStyles = (c: ColorScheme) => StyleSheet.create({
  card: {
    backgroundColor: c.white,
    borderRadius: 24,
    overflow: "hidden",
  },
  content: {
    padding: 20,
  },
});
