/**
 * Unit tests for contexts/ThemeContext.tsx
 * 
 * Tests ThemeProvider state management and the useTheme/useColors hooks.
 */

import React from "react";
import { renderHook, act } from "@testing-library/react-native";

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

// Mock react-native's useColorScheme
jest.mock("react-native", () => ({
  ...jest.requireActual("react-native"),
  useColorScheme: jest.fn().mockReturnValue("light"),
}));

import { ThemeProvider, useTheme, useColors } from "../contexts/ThemeContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

// ─── useTheme hook ────────────────────────────────────────────────────────────

describe("useTheme", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  });

  test("provides default theme values", async () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.isDark).toBe(false);
    expect(["light", "dark", "system"]).toContain(result.current.mode);
    expect(result.current.colors).toBeDefined();
  });

  test("colors object has required color keys", async () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    const { colors } = result.current;
    expect(colors).toHaveProperty("primary");
    expect(colors).toHaveProperty("background");
    expect(colors).toHaveProperty("text");
    expect(colors).toHaveProperty("textMuted");
    expect(colors).toHaveProperty("border");
  });

  test("provides toggleTheme, setMode, setPalette functions", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(typeof result.current.toggleTheme).toBe("function");
    expect(typeof result.current.setMode).toBe("function");
    expect(typeof result.current.setPalette).toBe("function");
  });

  test("toggleTheme switches isDark", async () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    const initialDark = result.current.isDark;
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.isDark).toBe(!initialDark);
  });

  test("setMode to 'dark' sets isDark to true", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => {
      result.current.setMode("dark");
    });
    expect(result.current.isDark).toBe(true);
    expect(result.current.mode).toBe("dark");
  });

  test("setMode to 'light' sets isDark to false", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => {
      result.current.setMode("dark"); // First go dark
    });
    act(() => {
      result.current.setMode("light"); // Then go light
    });
    expect(result.current.isDark).toBe(false);
    expect(result.current.mode).toBe("light");
  });

  test("setMode persists to AsyncStorage", async () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => {
      result.current.setMode("dark");
    });
    // Give effect time to flush
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      expect.stringContaining("theme"),
      "dark"
    );
  });

  test("themeKey is a number and increments on theme change", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    const initialKey = result.current.themeKey;
    act(() => {
      result.current.setMode("dark");
    });
    expect(result.current.themeKey).toBeGreaterThan(initialKey);
  });
});

// ─── useColors hook ───────────────────────────────────────────────────────────

describe("useColors", () => {
  test("returns a colors object", () => {
    const { result } = renderHook(() => useColors(), { wrapper });
    expect(result.current).toBeDefined();
    expect(typeof result.current).toBe("object");
  });

  test("colors contain string color values", () => {
    const { result } = renderHook(() => useColors(), { wrapper });
    const colors = result.current;
    // All color values should be strings (hex or named colors)
    expect(typeof colors.primary).toBe("string");
    expect(typeof colors.background).toBe("string");
    expect(typeof colors.text).toBe("string");
  });
});
