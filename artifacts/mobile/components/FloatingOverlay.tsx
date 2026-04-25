import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
} from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { useOverlay } from "@/contexts/OverlayContext";
import { useColors } from "@/contexts/ThemeContext";
import { useRouter } from "expo-router";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export const FloatingOverlay: React.FC = () => {
  const { timer, stopTimer, video, closeVideo, minimizeTimer, setMinimizeTimer, setMinimizeVideo, minimizeVideo } = useOverlay();
  const colors = useColors();
  const router = useRouter();

  const translateX = useSharedValue(SCREEN_WIDTH - 100);
  const translateY = useSharedValue(120);
  const context = useSharedValue({ x: 0, y: 0 });

  const panGesture = Gesture.Pan()
    .onStart(() => {
      context.value = { x: translateX.value, y: translateY.value };
    })
    .onUpdate((event) => {
      translateX.value = event.translationX + context.value.x;
      translateY.value = event.translationY + context.value.y;
    })
    .onEnd(() => {
      // Snap to edges
      if (translateX.value > SCREEN_WIDTH / 2) {
        translateX.value = withSpring(SCREEN_WIDTH - (video.videoId && minimizeVideo ? 170 : 80));
      } else {
        translateX.value = withSpring(20);
      }
      
      if (translateY.value < 50) translateY.value = withSpring(50);
      if (translateY.value > SCREEN_HEIGHT - 100) translateY.value = withSpring(SCREEN_HEIGHT - 150);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const showTimer = timer.isActive && minimizeTimer;
  const showVideo = video.videoId && minimizeVideo;

  if (!showTimer && !showVideo) return null;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.container, animatedStyle]}>
        
        {/* --- Timer Badge --- */}
        {showTimer && (
          <TouchableOpacity 
            style={[styles.timerBadge, { backgroundColor: colors.primary }]}
            onPress={() => {
              setMinimizeTimer(false);
              router.push("/pomodoro");
            }}
          >
            <View style={styles.timerContent}>
              <Feather name="clock" size={12} color="#fff" />
              <Text style={styles.timerText}>{formatTime(timer.timeLeft)}</Text>
            </View>
            <TouchableOpacity style={styles.miniBtn} onPress={stopTimer}>
              <Feather name="x" size={10} color="#fff" />
            </TouchableOpacity>
          </TouchableOpacity>
        )}

        {/* --- Video Card --- */}
        {showVideo && (
          <View style={[styles.videoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.videoHeader}>
              <Text style={[styles.videoTitle, { color: colors.text }]} numberOfLines={1}>
                {video.title}
              </Text>
              <TouchableOpacity onPress={closeVideo}>
                <Feather name="x" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.videoPlaceholder}>
              <WebView
                source={{ uri: `https://www.youtube-nocookie.com/embed/${video.videoId}?playsinline=1&modestbranding=1` }}
                style={{ flex: 1 }}
                scrollEnabled={false}
                allowsFullscreenVideo={false}
              />
            </View>
            <TouchableOpacity 
              style={styles.expandBtn}
              onPress={() => setMinimizeVideo(false)}
            >
              <Feather name="maximize" size={12} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 9999,
    gap: 10,
  },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 8,
    gap: 6,
  },
  timerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  timerText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  miniBtn: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoCard: {
    width: 160,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  videoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  videoTitle: {
    fontSize: 10,
    fontWeight: "700",
    flex: 1,
  },
  videoPlaceholder: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
  },
  expandBtn: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(255,255,255,0.8)",
    borderRadius: 4,
    padding: 2,
  }
});
