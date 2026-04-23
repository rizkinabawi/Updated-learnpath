import React, { useEffect, useRef } from "react";
import {
  Animated,
  Text,
  StyleSheet,
  View,
  Platform,
} from "react-native";
import Colors from "@/constants/colors";
import { Feather } from "@expo/vector-icons";

type ToastType = "success" | "error" | "info";

interface ToastConfig {
  message: string;
  type?: ToastType;
  duration?: number;
}

type Listener = (config: ToastConfig) => void;
const listeners: Set<Listener> = new Set();

export const toast = {
  show(config: ToastConfig) {
    listeners.forEach((l) => l(config));
  },
  success(message: string, duration?: number) {
    this.show({ message, type: "success", duration });
  },
  error(message: string, duration?: number) {
    this.show({ message, type: "error", duration });
  },
  info(message: string, duration?: number) {
    this.show({ message, type: "info", duration });
  },
};

const ICON_MAP: Record<ToastType, React.ComponentProps<typeof Feather>["name"]> = {
  success: "check-circle",
  error: "x-circle",
  info: "info",
};

const COLOR_MAP: Record<ToastType, string> = {
  success: Colors.success,
  error: Colors.danger,
  info: Colors.primary,
};

const BG_MAP: Record<ToastType, string> = {
  success: "#F0FDF4",
  error: "#FEF2F2",
  info: "#EEF2FF",
};

interface State {
  visible: boolean;
  message: string;
  type: ToastType;
}

export function ToastContainer() {
  const [state, setState] = React.useState<State>({
    visible: false,
    message: "",
    type: "info",
  });

  const anim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = () => {
    Animated.timing(anim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setState((s) => ({ ...s, visible: false })));
  };

  const show = (config: ToastConfig) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState({ visible: true, message: config.message, type: config.type ?? "info" });
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 15,
      stiffness: 180,
    }).start();
    timerRef.current = setTimeout(hide, config.duration ?? 2500);
  };

  useEffect(() => {
    listeners.add(show);
    return () => { listeners.delete(show); };
  }, []);

  if (!state.visible) return null;

  const color = COLOR_MAP[state.type];
  const bg = BG_MAP[state.type];
  const icon = ICON_MAP[state.type];

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [-20, 0],
              }),
            },
          ],
        },
      ]}
      pointerEvents="none"
    >
      <View style={[styles.pill, { backgroundColor: bg, borderColor: color + "30" }]}>
        <Feather name={icon} size={16} color={color} />
        <Text style={[styles.text, { color }]}>{state.message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: Platform.OS === "ios" ? 56 : 40,
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  text: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.1,
    flexShrink: 1,
  },
});
