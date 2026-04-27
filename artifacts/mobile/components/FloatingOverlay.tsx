import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  Animated,
  PanResponder,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useOverlay } from "@/contexts/OverlayContext";
import { useColors, useTheme } from "@/contexts/ThemeContext";
import { useRouter } from "expo-router";
import { type ColorScheme } from "@/constants/colors";

// react-native-webview has no web build. Load it lazily and only on native to
// avoid breaking the web bundle.
let WebView: any = null;
if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    WebView = require("react-native-webview").WebView;
  } catch {
    WebView = null;
  }
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const extractYoutubeId = (input: string): string | null => {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed.length === 11) return trimmed; // already an ID
  const m =
    trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) ||
    trimmed.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/) ||
    trimmed.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/) ||
    trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
};

export const FloatingOverlay: React.FC = () => {
  const { timer, stopTimer, video, closeVideo, minimizeTimer, setMinimizeTimer, setMinimizeVideo, minimizeVideo } = useOverlay();
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  const router = useRouter();

  const vId = useMemo(() => extractYoutubeId(video.videoId || ""), [video.videoId]);

  // Size cycling: 0=40%, 1=60%, 2=80%, 3=100%
  const [sizeIdx, setSizeIdx] = useState(1);
  const widths = [SCREEN_WIDTH * 0.4, SCREEN_WIDTH * 0.6, SCREEN_WIDTH * 0.8, SCREEN_WIDTH - 40];
  const currentWidth = widths[sizeIdx];

  const pan = useRef(new Animated.ValueXY({ x: SCREEN_WIDTH - 80, y: 120 })).current;
  const lastOffset = useRef({ x: SCREEN_WIDTH - 80, y: 120 });

  useEffect(() => {
    const id = pan.addListener((value) => {
      lastOffset.current = value;
    });
    return () => pan.removeListener(id);
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (e, g) => Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,
      onStartShouldSetPanResponder: () => false, // Don't steal initial taps
      onPanResponderGrant: () => {
        pan.setOffset({ x: lastOffset.current.x, y: lastOffset.current.y });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (e, gesture) => {
        pan.flattenOffset();
        const finalX = Math.max(20, Math.min(SCREEN_WIDTH - currentWidth - 20, lastOffset.current.x + gesture.dx));
        const finalY = Math.max(50, Math.min(SCREEN_HEIGHT - 220, lastOffset.current.y + gesture.dy));
        
        Animated.spring(pan, {
          toValue: { x: finalX, y: finalY },
          useNativeDriver: false,
          friction: 8,
          tension: 40,
        }).start();
      },
    })
  ).current;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const showTimer = timer.isActive && minimizeTimer;
  const showVideo = !!vId && minimizeVideo;
  
  const webViewRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMusicMode, setIsMusicMode] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const togglePlay = () => {
    const cmd = isPlaying ? "pauseVideo" : "playVideo";
    const message = `{"event":"command","func":"${cmd}","args":""}`;

    if (Platform.OS === "web") {
      try {
        iframeRef.current?.contentWindow?.postMessage(message, "*");
      } catch {}
    } else {
      if (!webViewRef.current) return;
      webViewRef.current.injectJavaScript(`
        (function() {
          const ifr = document.getElementsByTagName('iframe')[0];
          if (ifr && ifr.contentWindow) {
            ifr.contentWindow.postMessage('${message}', '*');
          }
        })()
      `);
    }
    setIsPlaying(!isPlaying);
  };

  if (!showTimer && !showVideo) return null;

  return (
    <Animated.View 
      style={[
        styles.container, 
        { 
          transform: [
            { translateX: pan.x },
            { translateY: pan.y }
          ] 
        }
      ]}
    >
        
        {/* --- Timer Badge --- */}
        {showTimer && (
          <TouchableOpacity 
            {...panResponder.panHandlers}
            activeOpacity={0.8}
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
          <View style={[
            styles.videoCard, 
            { 
              width: isMusicMode ? 180 : currentWidth, 
              backgroundColor: colors.surface, 
              borderColor: colors.border 
            }
          ]}>
            <View style={styles.videoHeader} {...panResponder.panHandlers}>
              <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 4 }}>
                <Feather name={isMusicMode ? "music" : "move"} size={12} color={colors.textSecondary} />
                <Text style={[styles.videoTitle, { color: colors.text }]} numberOfLines={1}>
                  {video.title || "Video Player"}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                 <TouchableOpacity onPress={togglePlay} style={{ padding: 4 }}>
                   <Feather name={isPlaying ? "pause" : "play"} size={16} color={colors.primary} />
                 </TouchableOpacity>
                 <TouchableOpacity onPress={() => setIsMusicMode(!isMusicMode)} style={{ padding: 4 }}>
                   <Feather name={isMusicMode ? "video" : "music"} size={16} color={colors.textSecondary} />
                 </TouchableOpacity>
                 {!isMusicMode && (
                   <TouchableOpacity onPress={() => setSizeIdx((sizeIdx + 1) % 4)} style={{ padding: 4 }}>
                     <Feather name="maximize-2" size={16} color={colors.textSecondary} />
                   </TouchableOpacity>
                 )}
                 <TouchableOpacity onPress={closeVideo} style={{ padding: 4 }}>
                   <Feather name="x" size={16} color={colors.textSecondary} />
                 </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.videoPlaceholder, isMusicMode && { height: 0, opacity: 0 }]}>
              {Platform.OS === "web" ? (
                // @ts-ignore — native iframe element on web
                <iframe
                  ref={iframeRef}
                  src={`https://www.youtube-nocookie.com/embed/${vId}?autoplay=1&playsinline=1&enablejsapi=1&modestbranding=1&rel=0`}
                  style={{
                    width: "100%",
                    height: "100%",
                    border: 0,
                    background: "#000",
                    display: "block",
                  }}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen={false}
                />
              ) : WebView ? (
                <WebView
                  ref={webViewRef}
                  source={{
                    html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;background:#000}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head><body><iframe src="https://www.youtube-nocookie.com/embed/${vId}?autoplay=1&playsinline=1&enablejsapi=1&modestbranding=1" allow="autoplay;encrypted-media;picture-in-picture" allowfullscreen="0"></iframe></body></html>`,
                    baseUrl: "https://www.youtube-nocookie.com",
                  }}
                  style={{ flex: 1 }}
                  scrollEnabled={false}
                  mediaPlaybackRequiresUserAction={false}
                  allowsInlineMediaPlayback={true}
                  allowsFullscreenVideo={false}
                />
              ) : null}
            </View>
            
            {!isMusicMode && (
              <TouchableOpacity 
                style={styles.expandBtn}
                onPress={() => {
                  setMinimizeVideo(false);
                  router.push(`/study-material/view/${video.videoId}`);
                }}
              >
                <Feather name="external-link" size={16} color={colors.text} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </Animated.View>
  );
};

const makeStyles = (c: ColorScheme, isDark: boolean, palette: string) => StyleSheet.create({
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
    backgroundColor: "rgba(0,0,0,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoCard: {
    borderRadius: 14,
    borderWidth: 1.2,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  videoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  videoTitle: {
    fontSize: 12,
    fontWeight: "800",
    flex: 1,
  },
  videoPlaceholder: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
  },
  expandBtn: {
    position: "absolute",
    top: 30,
    right: 8,
    backgroundColor: c.surface,
    borderRadius: 6,
    padding: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  }
});
