import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "react-native";
import LightColors from "@/constants/colors";
import DarkColors from "@/constants/dark-colors";

type ColorSet = typeof LightColors;

interface ThemeCtx {
  isDark: boolean;
  colors: ColorSet;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeCtx>({
  isDark: false,
  colors: LightColors,
  toggleTheme: () => {},
});

const THEME_KEY = "theme_preference";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<"light" | "dark" | "system">("system");
  const [isDark, setIsDark] = useState(systemScheme === "dark");

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((v) => {
      if (v === "light" || v === "dark" || v === "system") {
        setMode(v);
        setIsDark(v === "dark" || (v === "system" && systemScheme === "dark"));
      }
    });
  }, []);

  useEffect(() => {
    if (mode === "system") setIsDark(systemScheme === "dark");
  }, [systemScheme, mode]);

  const toggleTheme = () => {
    const next = isDark ? "light" : "dark";
    setMode(next);
    setIsDark(next === "dark");
    AsyncStorage.setItem(THEME_KEY, next);
  };

  const colors = isDark ? DarkColors : LightColors;

  return (
    <ThemeContext.Provider value={{ isDark, colors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
export const useColors = () => useContext(ThemeContext).colors;
