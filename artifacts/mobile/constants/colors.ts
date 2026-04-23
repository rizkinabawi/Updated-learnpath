/**
 * Single source of truth for theme colors.
 *
 * Four palette combinations are supported:
 *   - light  + default (color)
 *   - light  + minimal (B&W)
 *   - dark   + default (color)
 *   - dark   + minimal (B&W)
 *
 * The exported `Colors` object is mutable: call `applyTheme(palette, isDark)`
 * (done automatically by ThemeContext) to swap its values at runtime.
 * Screens that `import Colors from "@/constants/colors"` will read the active
 * palette after the navigation Stack remounts via `themeKey` in ThemeContext.
 */

export type ColorScheme = {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  accent: string;
  accentLight: string;
  teal: string;
  tealLight: string;
  amber: string;
  amberLight: string;
  purple: string;
  purpleLight: string;
  emerald: string;
  emeraldLight: string;
  dark: string;
  black: string;
  darkMed: string;
  white: string;
  background: string;
  surface: string;
  border: string;
  borderLight: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  success: string;
  successLight: string;
  danger: string;
  dangerLight: string;
  warning: string;
  warningLight: string;
  tabActive: string;
  tabInactive: string;
  card1: string;
  card2: string;
  card3: string;
  card4: string;
  /** Backdrop color used for shadow/elevation (kept as alias for shadow util). */
  shadow: string;
};

// ── LIGHT × DEFAULT ──────────────────────────────────────────────────────────
const LightDefault: ColorScheme = {
  primary: "#4C6FFF",
  primaryDark: "#3B5AF0",
  primaryLight: "#EEF0FF",
  accent: "#FF6B6B",
  accentLight: "#FFF0F0",
  teal: "#38BDF8",
  tealLight: "#E0F2FE",
  amber: "#FF9500",
  amberLight: "#FFF8EB",
  purple: "#7C3AED",
  purpleLight: "#F5F3FF",
  emerald: "#10B981",
  emeraldLight: "#ECFDF5",
  dark: "#0F1F3D",
  black: "#0F1F3D",
  darkMed: "#1E3A5F",
  white: "#FFFFFF",
  background: "#F4F7FF",
  surface: "#FFFFFF",
  border: "#E6ECF8",
  borderLight: "#F0F4FC",
  text: "#0F1F3D",
  textSecondary: "#526484",
  textMuted: "#99AAC3",
  success: "#22C55E",
  successLight: "#F0FDF4",
  danger: "#EF4444",
  dangerLight: "#FEF2F2",
  warning: "#F59E0B",
  warningLight: "#FFFBEB",
  tabActive: "#4C6FFF",
  tabInactive: "#99AAC3",
  card1: "#4C6FFF",
  card2: "#FF9500",
  card3: "#38BDF8",
  card4: "#7C3AED",
  shadow: "#1E3A5F",
};

// ── LIGHT × MINIMAL (B&W) ────────────────────────────────────────────────────
const LightMinimal: ColorScheme = {
  primary: "#111111",
  primaryDark: "#000000",
  primaryLight: "#F2F2F2",
  accent: "#333333",
  accentLight: "#F2F2F2",
  teal: "#444444",
  tealLight: "#F2F2F2",
  amber: "#555555",
  amberLight: "#F2F2F2",
  purple: "#222222",
  purpleLight: "#F2F2F2",
  emerald: "#333333",
  emeraldLight: "#F2F2F2",
  dark: "#000000",
  black: "#000000",
  darkMed: "#222222",
  white: "#FFFFFF",
  background: "#FAFAFA",
  surface: "#FFFFFF",
  border: "#E5E5E5",
  borderLight: "#F0F0F0",
  text: "#0A0A0A",
  textSecondary: "#444444",
  textMuted: "#888888",
  success: "#222222",
  successLight: "#F2F2F2",
  danger: "#000000",
  dangerLight: "#F2F2F2",
  warning: "#333333",
  warningLight: "#F2F2F2",
  tabActive: "#000000",
  tabInactive: "#999999",
  card1: "#111111",
  card2: "#333333",
  card3: "#555555",
  card4: "#222222",
  shadow: "#000000",
};

// ── DARK × DEFAULT ───────────────────────────────────────────────────────────
const DarkDefault: ColorScheme = {
  primary: "#6B8EFF",
  primaryDark: "#5577EE",
  primaryLight: "#1A2040",
  accent: "#FF8080",
  accentLight: "#2A1818",
  teal: "#56CFFF",
  tealLight: "#0A2030",
  amber: "#FFB340",
  amberLight: "#2A1E00",
  purple: "#A57EFF",
  purpleLight: "#1E1230",
  emerald: "#34D399",
  emeraldLight: "#0A2018",
  dark: "#F1F5FF",
  black: "#F1F5FF",
  darkMed: "#C8D6F0",
  white: "#1E2535",
  background: "#0F1420",
  surface: "#1A2035",
  border: "#2A3555",
  borderLight: "#1E2A45",
  text: "#F1F5FF",
  textSecondary: "#9AAACF",
  textMuted: "#5B6E90",
  success: "#34D399",
  successLight: "#0A2018",
  danger: "#FF6B6B",
  dangerLight: "#2A1010",
  warning: "#FFB340",
  warningLight: "#2A1A00",
  tabActive: "#6B8EFF",
  tabInactive: "#5B6E90",
  card1: "#3A5AEE",
  card2: "#CC7700",
  card3: "#2AADDD",
  card4: "#6A3ACD",
  shadow: "#000000",
};

// ── DARK × MINIMAL (B&W) ─────────────────────────────────────────────────────
const DarkMinimal: ColorScheme = {
  primary: "#FFFFFF",
  primaryDark: "#E5E5E5",
  primaryLight: "#1A1A1A",
  accent: "#CCCCCC",
  accentLight: "#1A1A1A",
  teal: "#BBBBBB",
  tealLight: "#1A1A1A",
  amber: "#AAAAAA",
  amberLight: "#1A1A1A",
  purple: "#DDDDDD",
  purpleLight: "#1A1A1A",
  emerald: "#CCCCCC",
  emeraldLight: "#1A1A1A",
  dark: "#FFFFFF",
  black: "#FFFFFF",
  darkMed: "#DDDDDD",
  white: "#111111",
  background: "#000000",
  surface: "#0E0E0E",
  border: "#262626",
  borderLight: "#1A1A1A",
  text: "#FAFAFA",
  textSecondary: "#BBBBBB",
  textMuted: "#777777",
  success: "#FFFFFF",
  successLight: "#1A1A1A",
  danger: "#EEEEEE",
  dangerLight: "#1A1A1A",
  warning: "#CCCCCC",
  warningLight: "#1A1A1A",
  tabActive: "#FFFFFF",
  tabInactive: "#777777",
  card1: "#2A2A2A",
  card2: "#1F1F1F",
  card3: "#333333",
  card4: "#252525",
  shadow: "#000000",
};

export type Palette = "color" | "minimal";

const PRESETS = {
  light: { color: LightDefault, minimal: LightMinimal },
  dark: { color: DarkDefault, minimal: DarkMinimal },
} as const;

// Mutable runtime export — overwritten in place by `applyTheme`.
const Colors: ColorScheme = { ...LightDefault };

let _palette: Palette = "color";
let _isDark = false;

export function applyTheme(palette: Palette, isDark: boolean) {
  _palette = palette;
  _isDark = isDark;
  const src = PRESETS[isDark ? "dark" : "light"][palette];
  (Object.keys(src) as Array<keyof ColorScheme>).forEach((k) => {
    (Colors as any)[k] = src[k];
  });
}

/** Backwards-compat shim — older code may still call this. */
export function applyMinimalPalette(minimal: boolean) {
  applyTheme(minimal ? "minimal" : "color", _isDark);
}

export function getActivePalette(): Palette {
  return _palette;
}

export function isDarkActive(): boolean {
  return _isDark;
}

export default Colors;

// ── Card gradient presets ────────────────────────────────────────────────────
const CARD_GRADIENTS_LIGHT: [string, string][] = [
  ["#4C6FFF", "#7C47FF"],
  ["#FF6B6B", "#FF9500"],
  ["#38BDF8", "#0EA5E9"],
  ["#7C3AED", "#A855F7"],
  ["#10B981", "#059669"],
  ["#F59E0B", "#EF4444"],
];

const CARD_GRADIENTS_DARK: [string, string][] = [
  ["#3A5AEE", "#5B3AEE"],
  ["#CC5555", "#CC7700"],
  ["#2AADDD", "#0E84C9"],
  ["#6A3ACD", "#8B47C7"],
  ["#0E8B61", "#067849"],
  ["#CC8500", "#CC3333"],
];

const CARD_GRADIENTS_MINIMAL_LIGHT: [string, string][] = [
  ["#1A1A1A", "#000000"],
  ["#2A2A2A", "#111111"],
  ["#333333", "#1A1A1A"],
  ["#222222", "#0A0A0A"],
  ["#3A3A3A", "#1F1F1F"],
  ["#2D2D2D", "#0F0F0F"],
];

const CARD_GRADIENTS_MINIMAL_DARK: [string, string][] = [
  ["#2A2A2A", "#1A1A1A"],
  ["#333333", "#222222"],
  ["#3A3A3A", "#2A2A2A"],
  ["#2D2D2D", "#1F1F1F"],
  ["#3D3D3D", "#2A2A2A"],
  ["#252525", "#151515"],
];

export const CARD_GRADIENTS: [string, string][] = [...CARD_GRADIENTS_LIGHT];
export const CARD_GRADIENTS_MINIMAL: [string, string][] = [...CARD_GRADIENTS_MINIMAL_LIGHT];

// Re-populate gradients when the theme changes so screens importing them re-read.
export function applyGradientsForTheme(palette: Palette, isDark: boolean) {
  const colorSrc = isDark ? CARD_GRADIENTS_DARK : CARD_GRADIENTS_LIGHT;
  const minSrc = isDark ? CARD_GRADIENTS_MINIMAL_DARK : CARD_GRADIENTS_MINIMAL_LIGHT;
  CARD_GRADIENTS.length = 0;
  CARD_GRADIENTS.push(...colorSrc);
  CARD_GRADIENTS_MINIMAL.length = 0;
  CARD_GRADIENTS_MINIMAL.push(...minSrc);
}

export const CARD_COLORS = ["#4C6FFF", "#FF6B6B", "#38BDF8", "#7C3AED", "#10B981", "#FF9500"];

// ── Shadow / elevation tokens ────────────────────────────────────────────────
export const shadow = {
  get shadowColor() {
    return Colors.shadow;
  },
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 5,
};

export const shadowSm = {
  get shadowColor() {
    return Colors.shadow;
  },
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
};

// ── Global spacing / radius / type-scale tokens ──────────────────────────────
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  "2xl": 20,
  "3xl": 24,
  "4xl": 32,
} as const;
