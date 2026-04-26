/**
 * Unit tests for contexts/OverlayContext.tsx
 *
 * Tests timer state management: start, pause, resume, stop.
 * Tests video overlay state: show, close, minimize.
 */

import React from "react";
import { renderHook, act } from "@testing-library/react-native";
import { OverlayProvider, useOverlay } from "../contexts/OverlayContext";

// Mock AppState
jest.mock("react-native", () => {
  const actual = jest.requireActual("react-native");
  return {
    ...actual,
    AppState: {
      addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
      currentState: "active",
    },
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <OverlayProvider>{children}</OverlayProvider>
);

// ─── Timer State ──────────────────────────────────────────────────────────────

describe("OverlayContext - Timer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("initial timer state is correct", () => {
    const { result } = renderHook(() => useOverlay(), { wrapper });
    expect(result.current.timer.isActive).toBe(false);
    expect(result.current.timer.timeLeft).toBe(25 * 60);
    expect(result.current.timer.mode).toBe("work");
    expect(result.current.timer.endTime).toBeNull();
  });

  test("startTimer sets isActive to true with correct duration", () => {
    const { result } = renderHook(() => useOverlay(), { wrapper });
    act(() => {
      result.current.startTimer(60, "work");
    });
    expect(result.current.timer.isActive).toBe(true);
    expect(result.current.timer.timeLeft).toBe(60);
    expect(result.current.timer.mode).toBe("work");
  });

  test("pauseTimer sets isActive to false", () => {
    const { result } = renderHook(() => useOverlay(), { wrapper });
    act(() => {
      result.current.startTimer(60, "work");
    });
    act(() => {
      result.current.pauseTimer();
    });
    expect(result.current.timer.isActive).toBe(false);
    expect(result.current.timer.endTime).toBeNull();
  });

  test("resumeTimer restores isActive", () => {
    const { result } = renderHook(() => useOverlay(), { wrapper });
    act(() => {
      result.current.startTimer(60, "work");
    });
    act(() => {
      result.current.pauseTimer();
    });
    act(() => {
      result.current.resumeTimer();
    });
    expect(result.current.timer.isActive).toBe(true);
  });

  test("stopTimer resets to initial state", () => {
    const { result } = renderHook(() => useOverlay(), { wrapper });
    act(() => {
      result.current.startTimer(120, "shortBreak");
    });
    act(() => {
      result.current.stopTimer();
    });
    expect(result.current.timer.isActive).toBe(false);
    expect(result.current.timer.timeLeft).toBe(25 * 60);
    expect(result.current.timer.mode).toBe("work");
  });

  test("startTimer supports shortBreak mode", () => {
    const { result } = renderHook(() => useOverlay(), { wrapper });
    act(() => {
      result.current.startTimer(5 * 60, "shortBreak");
    });
    expect(result.current.timer.mode).toBe("shortBreak");
  });

  test("startTimer supports longBreak mode", () => {
    const { result } = renderHook(() => useOverlay(), { wrapper });
    act(() => {
      result.current.startTimer(15 * 60, "longBreak");
    });
    expect(result.current.timer.mode).toBe("longBreak");
  });

  test("minimizeTimer defaults to false", () => {
    const { result } = renderHook(() => useOverlay(), { wrapper });
    expect(result.current.minimizeTimer).toBe(false);
  });

  test("setMinimizeTimer changes minimizeTimer state", () => {
    const { result } = renderHook(() => useOverlay(), { wrapper });
    act(() => {
      result.current.setMinimizeTimer(true);
    });
    expect(result.current.minimizeTimer).toBe(true);
  });
});

// ─── Video State ──────────────────────────────────────────────────────────────

describe("OverlayContext - Video", () => {
  test("initial video state is null", () => {
    const { result } = renderHook(() => useOverlay(), { wrapper });
    expect(result.current.video.videoId).toBeNull();
    expect(result.current.video.title).toBeNull();
    expect(result.current.minimizeVideo).toBe(false);
  });

  test("showVideo sets videoId and title", () => {
    const { result } = renderHook(() => useOverlay(), { wrapper });
    act(() => {
      result.current.showVideo("dQw4w9WgXcQ", "Rick Astley");
    });
    expect(result.current.video.videoId).toBe("dQw4w9WgXcQ");
    expect(result.current.video.title).toBe("Rick Astley");
    expect(result.current.minimizeVideo).toBe(true);
  });

  test("showVideo uses default title when not provided", () => {
    const { result } = renderHook(() => useOverlay(), { wrapper });
    act(() => {
      result.current.showVideo("some-id");
    });
    expect(result.current.video.title).toBe("Video Study");
  });

  test("closeVideo resets video state", () => {
    const { result } = renderHook(() => useOverlay(), { wrapper });
    act(() => {
      result.current.showVideo("abc123", "Test Video");
    });
    act(() => {
      result.current.closeVideo();
    });
    expect(result.current.video.videoId).toBeNull();
    expect(result.current.video.title).toBeNull();
    expect(result.current.minimizeVideo).toBe(false);
  });

  test("setMinimizeVideo updates minimizeVideo state", () => {
    const { result } = renderHook(() => useOverlay(), { wrapper });
    act(() => {
      result.current.setMinimizeVideo(true);
    });
    expect(result.current.minimizeVideo).toBe(true);
    act(() => {
      result.current.setMinimizeVideo(false);
    });
    expect(result.current.minimizeVideo).toBe(false);
  });
});

// ─── useOverlay guard ─────────────────────────────────────────────────────────

describe("useOverlay - guard", () => {
  test("throws when used outside OverlayProvider", () => {
    // Suppress console.error for this test
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      renderHook(() => useOverlay());
    }).toThrow("useOverlay must be used within OverlayProvider");
    spy.mockRestore();
  });
});
