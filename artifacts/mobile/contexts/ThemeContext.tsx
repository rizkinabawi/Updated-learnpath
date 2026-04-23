import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "react-native";
import LightColors, { applyMinimalPalette } from "@/constants/colors";
import DarkColors, { applyMinimalDarkPalette } from "@/constants/dark-colors";

type ColorSet = typeof LightColors;
export type ThemeMode = "light" | "dark" | "system";
export type Palette = "color" | "minimal";

interface ThemeCtx {
  isDark: boolean;
  mode: ThemeMode;
  palette: Palette;
  colors: ColorSet;
  toggleTheme: () => void;
  setMode: (m: ThemeMode) => void;
  setPalette: (p: Palette) => void;
  /** key bumped on theme/palette change — use to remount subtrees */
  themeKey: number;
}

const ThemeContext = createContext<ThemeCtx>({
  isDark: false,
  mode: "system",
  palette: "color",
  colors: LightColors,
  toggleTheme: () => {},
  setMode: () => {},
  setPalette: () => {},
  themeKey: 0,
});

const THEME_KEY = "theme_preference";
const PALETTE_KEY = "palette_preference";

function applyPalette(p: Palette) {
  const minimal = p === "minimal";
  applyMinimalPalette(minimal);
  applyMinimalDarkPalette(minimal);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [palette, setPaletteState] = useState<Palette>("color");
  const [isDark, setIsDark] = useState(systemScheme === "dark");
  const [themeKey, setThemeKey] = useState(0);

  useEffect(() => {
    (async () => {
      const t = await AsyncStorage.getItem(THEME_KEY);
      const p = await AsyncStorage.getItem(PALETTE_KEY);
      if (t === "light" || t === "dark" || t === "system") {
        setModeState(t);
        setIsDark(t === "dark" || (t === "system" && systemScheme === "dark"));
      }
      if (p === "color" || p === "minimal") {
        setPaletteState(p);
        applyPalette(p);
      }
      setThemeKey((k) => k + 1);
    })();
  }, []);

  useEffect(() => {
    if (mode === "system") setIsDark(systemScheme === "dark");
  }, [systemScheme, mode]);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    setIsDark(next === "dark" || (next === "system" && systemScheme === "dark"));
    AsyncStorage.setItem(THEME_KEY, next).catch(() => {});
    setThemeKey((k) => k + 1);
  };

  const setPalette = (p: Palette) => {
    setPaletteState(p);
    applyPalette(p);
    AsyncStorage.setItem(PALETTE_KEY, p).catch(() => {});
    setThemeKey((k) => k + 1);
  };

  const toggleTheme = () => {
    const next: ThemeMode = isDark ? "light" : "dark";
    setMode(next);
  };

  const colors = isDark ? DarkColors : LightColors;

  return (
    <ThemeContext.Provider
      value={{ isDark, mode, palette, colors, toggleTheme, setMode, setPalette, themeKey }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
export const useColors = () => useContext(ThemeContext).colors;
