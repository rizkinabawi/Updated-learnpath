import React from "react";
import { View, ViewProps, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

interface CardProps extends ViewProps {
  children?: React.ReactNode;
}

export const Card = ({ children, style, ...props }: CardProps) => (
  <View style={[styles.card, style]} {...props}>
    {children}
  </View>
);

export const CardContent = ({ children, style, ...props }: CardProps) => (
  <View style={[styles.content, style]} {...props}>
    {children}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    overflow: "hidden",
  },
  content: {
    padding: 20,
  },
});
