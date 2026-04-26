import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

export type TimerMode = "work" | "shortBreak" | "longBreak";

interface TimerState {
  isActive: boolean;
  timeLeft: number;
  mode: TimerMode;
  endTime: number | null; // Used for background continuity
}

interface VideoState {
  videoId: string | null;
  title: string | null;
}

interface OverlayContextType {
  // Timer
  timer: TimerState;
  startTimer: (seconds: number, mode: TimerMode) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  stopTimer: () => void;
  minimizeTimer: boolean;
  setMinimizeTimer: (v: boolean) => void;

  // Video
  video: VideoState;
  showVideo: (videoId: string, title?: string) => void;
  closeVideo: () => void;
  minimizeVideo: boolean;
  setMinimizeVideo: (v: boolean) => void;
}

const OverlayContext = createContext<OverlayContextType | undefined>(undefined);

export const OverlayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // --- Timer State ---
  const [timer, setTimer] = useState<TimerState>({
    isActive: false,
    timeLeft: 25 * 60,
    mode: "work",
    endTime: null,
  });
  const [minimizeTimer, setMinimizeTimer] = useState(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Video State ---
  const [video, setVideo] = useState<VideoState>({ videoId: null, title: null });
  const [minimizeVideo, setMinimizeVideo] = useState(false);

  // Logic to handle background/foreground transitions for Timer
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active" && timer.isActive && timer.endTime) {
        const now = Date.now();
        const diff = Math.floor((timer.endTime - now) / 1000);
        if (diff <= 0) {
          setTimer((prev) => ({ ...prev, timeLeft: 0, isActive: false, endTime: null }));
          // Note: In a real app, you'd trigger a native notification here if it finished while backgrounded
        } else {
          setTimer((prev) => ({ ...prev, timeLeft: diff }));
        }
      }
    };

    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, [timer.isActive, timer.endTime]);

  // Main tick logic
  useEffect(() => {
    if (timer.isActive && timer.timeLeft > 0) {
      timerIntervalRef.current = setInterval(() => {
        setTimer((prev) => {
          if (prev.timeLeft <= 1) {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            return { ...prev, timeLeft: 0, isActive: false, endTime: null };
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [timer.isActive, timer.timeLeft === 0]);

  const startTimer = (seconds: number, mode: TimerMode) => {
    const endTime = Date.now() + seconds * 1000;
    setTimer({ isActive: true, timeLeft: seconds, mode, endTime });
  };

  const pauseTimer = () => {
    setTimer((prev) => ({ ...prev, isActive: false, endTime: null }));
  };

  const resumeTimer = () => {
    const endTime = Date.now() + timer.timeLeft * 1000;
    setTimer((prev) => ({ ...prev, isActive: true, endTime }));
  };

  const stopTimer = () => {
    setTimer({ isActive: false, timeLeft: 25 * 60, mode: "work", endTime: null });
    setMinimizeTimer(false);
  };

  const showVideo = (videoId: string, title?: string) => {
    setVideo({ videoId, title: title ?? "Video Study" });
    setMinimizeVideo(true);
  };

  const closeVideo = () => {
    setVideo({ videoId: null, title: null });
    setMinimizeVideo(false);
  };

  return (
    <OverlayContext.Provider
      value={{
        timer,
        startTimer,
        pauseTimer,
        resumeTimer,
        stopTimer,
        minimizeTimer,
        setMinimizeTimer,
        video,
        showVideo,
        closeVideo,
        minimizeVideo,
        setMinimizeVideo,
      }}
    >
      {children}
    </OverlayContext.Provider>
  );
};

export const useOverlay = () => {
  const context = useContext(OverlayContext);
  if (!context) throw new Error("useOverlay must be used within OverlayProvider");
  return context;
};
