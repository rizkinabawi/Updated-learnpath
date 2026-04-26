import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "react-native";
import Colors, {
  applyTheme,
  applyGradientsForTheme,
  type ColorScheme,
  type Palette,
} from "@/constants/colors";

export type ThemeMode = "light" | "dark" | "system";
export type { Palette };

interface ThemeCtx {
  isDark: boolean;
  mode: ThemeMode;
  palette: Palette;
  /**
   * Active color set. Reactive — re-reads when theme changes.
   * Prefer using `useColors()` in new code so re-renders happen automatically.
   */
  colors: ColorScheme;
  toggleTheme: () => void;
  setMode: (m: ThemeMode) => void;
  setPalette: (p: Palette) => void;
  /** Bumped on theme/palette change — used to remount subtrees so StyleSheet picks up new colors. */
  themeKey: number;
}

const ThemeContext = React.createContext<ThemeCtx>({
  isDark: false,
  mode: "system",
  palette: "color",
  colors: Colors,
  toggleTheme: () => {},
  setMode: () => {},
  setPalette: () => {},
  themeKey: 0,
});

const THEME_KEY = "theme_preference";
const PALETTE_KEY = "palette_preference";

function syncTheme(palette: Palette, isDark: boolean) {
  applyTheme(palette, isDark);
  applyGradientsForTheme(palette, isDark);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = React.useState<ThemeMode>("system");
  const [palette, setPaletteState] = React.useState<Palette>("color");
  const [isDark, setIsDark] = React.useState(systemScheme === "dark");
  const [themeKey, setThemeKey] = React.useState(0);
  const [hydrated, setHydrated] = React.useState(false);

  // Apply default theme synchronously on first render so children read the right colors.
  if (!hydrated) {
    syncTheme("color", systemScheme === "dark");
  }

  React.useEffect(() => {
    (async () => {
      try {
        const t = await AsyncStorage.getItem(THEME_KEY);
        const p = await AsyncStorage.getItem(PALETTE_KEY);
        const nextMode: ThemeMode =
          t === "light" || t === "dark" || t === "system" ? t : "system";
        const nextPalette: Palette =
          p === "minimal" || p === "premium" || p === "color" ? p : "color";
        const nextDark =
          nextMode === "dark" || (nextMode === "system" && systemScheme === "dark");
        setModeState(nextMode);
        setPaletteState(nextPalette);
        setIsDark(nextDark);
        syncTheme(nextPalette, nextDark);
      } finally {
        setHydrated(true);
        setThemeKey((k) => k + 1);
      }
    })();
  }, []);

  // Follow system scheme changes when in "system" mode.
  React.useEffect(() => {
    if (mode !== "system") return;
    const nextDark = systemScheme === "dark";
    if (nextDark !== isDark) {
      setIsDark(nextDark);
      syncTheme(palette, nextDark);
      setThemeKey((k) => k + 1);
    }
  }, [systemScheme, mode]);

  const setMode = (next: ThemeMode) => {
    const nextDark =
      next === "dark" || (next === "system" && systemScheme === "dark");
    setModeState(next);
    setIsDark(nextDark);
    syncTheme(palette, nextDark);
    AsyncStorage.setItem(THEME_KEY, next).catch(() => {});
    setThemeKey((k) => k + 1);
  };

  const setPalette = (p: Palette) => {
    setPaletteState(p);
    syncTheme(p, isDark);
    AsyncStorage.setItem(PALETTE_KEY, p).catch(() => {});
    setThemeKey((k) => k + 1);
  };

  const toggleTheme = () => setMode(isDark ? "light" : "dark");

  // `Colors` is the live mutable object — pass a fresh shallow copy by reference
  // so consumers using `useColors()` re-render when themeKey changes.
  const value = React.useMemo<ThemeCtx>(
    () => ({
      isDark,
      mode,
      palette,
      colors: { ...Colors },
      toggleTheme,
      setMode,
      setPalette,
      themeKey,
    }),
    [isDark, mode, palette, themeKey],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => React.useContext(ThemeContext);
export const useColors = () => React.useContext(ThemeContext).colors;
