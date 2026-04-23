import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, LogBox, Platform, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastContainer } from "@/components/Toast";
import { scheduleDailyMotivation, getReminderSettings, scheduleStudyReminder } from "@/utils/notifications";
import { isCancellationError } from "@/utils/safe-share";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

// Suppress share-cancellation noise in dev overlay
LogBox.ignoreLogs([
  "Abort due to cancellation of share",
  "User cancelled",
  "share was cancelled",
]);

// Global safety net for unhandled promise rejections from share cancellation
if (Platform.OS !== "web" && typeof (global as any).ErrorUtils !== "undefined") {
  const originalHandler = (global as any).ErrorUtils.getGlobalHandler();
  (global as any).ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    if (isCancellationError(error)) return;
    if (originalHandler) originalHandler(error, isFatal);
  });
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// ─── Animated loading dots ───────────────────────────────────────────────────
function LoadingDot({ delay, color }: { delay: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: 350,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 350,
          easing: Easing.in(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.delay(Math.max(0, 700 - delay)),
      ])
    ).start();
  }, []);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });

  return (
    <Animated.View
      style={[
        splashStyles.dot,
        { backgroundColor: color, transform: [{ translateY }], opacity },
      ]}
    />
  );
}

// ─── Splash screen progress bar ──────────────────────────────────────────────
function ProgressBar() {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, []);

  const marginLeft = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["-40%", "100%"],
  });

  return (
    <View style={splashStyles.barTrack}>
      <Animated.View style={[splashStyles.barFill, { marginLeft }]} />
    </View>
  );
}

// ─── Logo pulse ──────────────────────────────────────────────────────────────
function PulseLogo() {
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 100,
        useNativeDriver: false,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[splashStyles.logoWrap, { transform: [{ scale }], opacity }]}>
      <Text style={splashStyles.logoEmoji}>🎓</Text>
    </Animated.View>
  );
}

// ─── Full splash / loading screen ────────────────────────────────────────────
function AppLoadingScreen() {
  return (
    <View style={splashStyles.container}>
      <PulseLogo />
      <View style={{ alignItems: "center" }}>
        <Text style={splashStyles.appName}>LearningPath</Text>
        <Text style={splashStyles.tagline}>Belajar lebih cerdas setiap hari</Text>
      </View>
      <View style={splashStyles.dotsRow}>
        <LoadingDot delay={0} color="#4C6FFF" />
        <LoadingDot delay={180} color="#38BDF8" />
        <LoadingDot delay={360} color="#7C3AED" />
      </View>
      <ProgressBar />
    </View>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F7FF",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
  },
  logoWrap: {
    width: 88,
    height: 88,
    borderRadius: 26,
    backgroundColor: "#4C6FFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: "#4C6FFF",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 10,
  },
  logoEmoji: {
    fontSize: 42,
    lineHeight: 52,
  },
  appName: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0F1F3D",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 14,
    color: "#99AAC3",
    marginBottom: 40,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 48,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#4C6FFF",
  },
  barTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "#E6ECF8",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    width: "40%",
    backgroundColor: "#4C6FFF",
    borderRadius: 2,
  },
});

// ─── Navigation stack ─────────────────────────────────────────────────────────
function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen
        name="flashcard/[lessonId]"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="quiz/[lessonId]"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="create-flashcard/[lessonId]"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="create-quiz/[lessonId]"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="mistakes-review"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="course/[pathId]"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="about-developer"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="pomodoro"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="session-history"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="bookmarks"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="daily-challenge"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="search"
        options={{ headerShown: false, animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="anki-import"
        options={{ headerShown: true, title: "Import Anki Deck", animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="study-material/view/[matId]"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="notes/view/[noteId]"
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
      scheduleDailyMotivation().catch(() => {});
      getReminderSettings().then((s) => {
        if (s.enabled) scheduleStudyReminder(s.hour, s.minute).catch(() => {});
      });
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return <AppLoadingScreen />;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ThemeProvider>
        <LanguageProvider>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <RootLayoutNav />
              <ToastContainer />
            </GestureHandlerRootView>
          </QueryClientProvider>
        </LanguageProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
