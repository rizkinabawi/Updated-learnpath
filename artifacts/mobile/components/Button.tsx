import { useColors } from "@/contexts/ThemeContext";
import React, { useMemo } from "react";
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  PressableProps,
  ViewStyle,
} from "react-native";
import { type ColorScheme } from "@/constants/colors";

type Variant = "default" | "outline" | "ghost" | "danger" | "accent";
type Size = "default" | "sm" | "lg" | "icon" | "pill";

interface ButtonProps extends PressableProps {
  children?: React.ReactNode;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  label?: string;
  style?: ViewStyle;
}

export const Button = ({
  children,
  variant = "default",
  size = "default",
  loading = false,
  label,
  style,
  disabled,
  ...props
}: ButtonProps) => {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const bg = {
    default: colors.primary,
    outline: colors.white,
    ghost: "transparent",
    danger: colors.danger,
    accent: colors.accent,
  }[variant];

  const textColor = {
    default: "#fff",
    outline: colors.text,
    ghost: colors.textSecondary,
    danger: "#fff",
    accent: "#fff",
  }[variant];

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        styles[`size_${size}` as keyof typeof styles] as ViewStyle,
        { backgroundColor: bg },
        variant === "outline" && styles.outlineBorder,
        disabled || loading ? styles.disabled : {},
        pressed && !disabled && !loading ? styles.pressed : {},
        style ?? {},
      ]}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === "default" || variant === "accent" ? "#fff" : colors.text} />
      ) : label ? (
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
};

const makeStyles = (c: ColorScheme) => StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    paddingHorizontal: 20,
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.5 },
  outlineBorder: { borderWidth: 1.5, borderColor: c.border },
  label: { fontWeight: "800", fontSize: 15, textAlign: "center" },
  size_default: { height: 52 },
  size_sm: { height: 38, paddingHorizontal: 14 },
  size_lg: { height: 58, paddingHorizontal: 36 },
  size_pill: { height: 40, paddingHorizontal: 18 },
  size_icon: { height: 44, width: 44, padding: 0, paddingHorizontal: 0, borderRadius: 14 },
});
