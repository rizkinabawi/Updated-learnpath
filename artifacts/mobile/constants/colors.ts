// Default colorful palette
const ColorPalette = {
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
};

// Minimal monochrome (B&W) palette — light variant
const MinimalLightPalette: typeof ColorPalette = {
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
};

// Mutable export — gets overwritten when palette changes
const Colors: typeof ColorPalette = { ...ColorPalette };

export function applyMinimalPalette(minimal: boolean) {
  const src = minimal ? MinimalLightPalette : ColorPalette;
  (Object.keys(src) as Array<keyof typeof ColorPalette>).forEach((k) => {
    (Colors as any)[k] = src[k];
  });
}

export default Colors;

export const CARD_COLORS = ["#4C6FFF", "#FF6B6B", "#38BDF8", "#7C3AED", "#10B981", "#FF9500"];

export const CARD_GRADIENTS: [string, string][] = [
  ["#4C6FFF", "#7C47FF"],
  ["#FF6B6B", "#FF9500"],
  ["#38BDF8", "#0EA5E9"],
  ["#7C3AED", "#A855F7"],
  ["#10B981", "#059669"],
  ["#F59E0B", "#EF4444"],
];

export const CARD_GRADIENTS_MINIMAL: [string, string][] = [
  ["#1A1A1A", "#000000"],
  ["#2A2A2A", "#111111"],
  ["#333333", "#1A1A1A"],
  ["#222222", "#0A0A0A"],
  ["#3A3A3A", "#1F1F1F"],
  ["#2D2D2D", "#0F0F0F"],
];

export const shadow = {
  shadowColor: "#1E3A5F",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 5,
};

export const shadowSm = {
  shadowColor: "#1E3A5F",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
};
