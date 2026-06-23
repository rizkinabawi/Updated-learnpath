import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
  ScrollView,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/contexts/ThemeContext";
import type { ColorScheme } from "@/constants/colors";

export const PWA_GUIDE_KEY = "pwa_guide_shown_v1";

const { width } = Dimensions.get("window");

type DeviceOS = "ios" | "android" | "desktop";

function detectDevice(): DeviceOS {
  if (Platform.OS !== "web") return "android";
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

type Step = { icon: React.ComponentProps<typeof Feather>["name"]; label: string; detail: string };

const IOS_STEPS: Step[] = [
  { icon: "share", label: "Ketuk ikon Share", detail: "Tombol berbagi di bagian bawah Safari" },
  { icon: "plus-square", label: 'Pilih "Tambahkan ke Layar Utama"', detail: "Gulir ke bawah pada menu Share dan ketuk opsi ini" },
  { icon: "check-circle", label: 'Ketuk "Tambahkan"', detail: "Konfirmasi nama lalu tekan Tambahkan di pojok kanan atas" },
];

const ANDROID_STEPS: Step[] = [
  { icon: "more-vertical", label: "Ketuk menu tiga titik di Chrome", detail: "Tiga titik di pojok kanan atas browser Chrome" },
  { icon: "download", label: 'Pilih "Instal Aplikasi"', detail: '"Tambahkan ke Layar Utama" jika Instal Aplikasi tidak muncul' },
  { icon: "check-circle", label: 'Ketuk "Instal"', detail: "Konfirmasi instalasi dan app muncul di home screen" },
];

const DESKTOP_STEPS: Step[] = [
  { icon: "monitor", label: "Buka di Chrome / Edge", detail: "Gunakan browser yang mendukung PWA install" },
  { icon: "download", label: "Klik ikon install di address bar", detail: "Ikon + atau tanda panah ke bawah di pojok kanan URL bar" },
  { icon: "check-circle", label: 'Klik "Instal"', detail: "Aplikasi akan terbuka sebagai jendela tersendiri di desktop" },
];

function StepCard({
  step,
  index,
  colors,
  styles,
  delay,
}: {
  step: Step;
  index: number;
  colors: ColorScheme;
  styles: ReturnType<typeof makeStyles>;
  delay: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 380,
      delay,
      useNativeDriver: false,
    }).start();
  }, []);

  const opacity = anim;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  return (
    <Animated.View style={[styles.stepCard, { opacity, transform: [{ translateY }] }]}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{index + 1}</Text>
      </View>
      <View style={styles.stepIconWrap}>
        <Feather name={step.icon} size={22} color={colors.primary} />
      </View>
      <View style={styles.stepText}>
        <Text style={styles.stepLabel}>{step.label}</Text>
        <Text style={styles.stepDetail}>{step.detail}</Text>
      </View>
    </Animated.View>
  );
}

export default function PwaGuideScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = makeStyles(colors);
  const device = detectDevice();
  const [tab, setTab] = useState<DeviceOS>(device);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: false }).start();
  }, []);

  const handleDone = async () => {
    await AsyncStorage.setItem(PWA_GUIDE_KEY, "1");
    router.replace("/(tabs)");
  };

  const steps = tab === "ios" ? IOS_STEPS : tab === "android" ? ANDROID_STEPS : DESKTOP_STEPS;

  const tabLabel: Record<DeviceOS, string> = {
    ios: "iOS Safari",
    android: "Android",
    desktop: "Desktop",
  };

  const tabIcon: Record<DeviceOS, React.ComponentProps<typeof Feather>["name"]> = {
    ios: "smartphone",
    android: "smartphone",
    desktop: "monitor",
  };

  const headerEmoji: Record<DeviceOS, string> = {
    ios: "📱",
    android: "📱",
    desktop: "🖥️",
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top || 20, paddingBottom: insets.bottom || 20 }]}>
      <Animated.View style={[styles.inner, { opacity: fadeAnim }]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          <View style={styles.heroWrap}>
            <View style={styles.heroIcon}>
              <Text style={styles.heroEmoji}>{headerEmoji[tab]}</Text>
            </View>
            <Text style={styles.heroTitle}>Install LearningPath</Text>
            <Text style={styles.heroSub}>
              Tambahkan app ke home screen untuk akses cepat kapan saja — tanpa buka browser terlebih dahulu.
            </Text>
          </View>

          <View style={styles.benefitRow}>
            {[
              { icon: "zap" as const, text: "Buka lebih cepat" },
              { icon: "wifi-off" as const, text: "Mode offline" },
              { icon: "maximize" as const, text: "Layar penuh" },
            ].map((b) => (
              <View key={b.text} style={styles.benefitItem}>
                <Feather name={b.icon} size={16} color={colors.primary} />
                <Text style={styles.benefitText}>{b.text}</Text>
              </View>
            ))}
          </View>

          <View style={styles.tabRow}>
            {(["ios", "android", "desktop"] as DeviceOS[]).map((os) => (
              <TouchableOpacity
                key={os}
                style={[styles.tabBtn, tab === os && styles.tabBtnActive]}
                onPress={() => setTab(os)}
              >
                <Feather name={tabIcon[os]} size={14} color={tab === os ? colors.primary : colors.textMuted} />
                <Text style={[styles.tabBtnText, tab === os && styles.tabBtnTextActive]}>
                  {tabLabel[os]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.stepsWrap}>
            {steps.map((step, i) => (
              <StepCard
                key={`${tab}-${i}`}
                step={step}
                index={i}
                colors={colors}
                styles={styles}
                delay={i * 80}
              />
            ))}
          </View>

          {tab === "ios" && (
            <View style={styles.tipBox}>
              <Feather name="info" size={15} color={colors.primary} />
              <Text style={styles.tipText}>
                Pastikan membuka LearningPath di browser <Text style={{ fontWeight: "700" }}>Safari</Text> bukan Chrome atau Firefox — hanya Safari yang mendukung install PWA di iOS.
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.skipBtn} onPress={handleDone}>
            <Text style={styles.skipText}>Lewati</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.doneBtn} onPress={handleDone}>
            <Text style={styles.doneBtnText}>Mulai Belajar</Text>
            <Feather name="arrow-right" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

function makeStyles(colors: ColorScheme) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    inner: {
      flex: 1,
    },
    scroll: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 20,
    },
    heroWrap: {
      alignItems: "center",
      marginBottom: 24,
    },
    heroIcon: {
      width: 80,
      height: 80,
      borderRadius: 24,
      backgroundColor: colors.primaryLight,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    heroEmoji: {
      fontSize: 38,
    },
    heroTitle: {
      fontSize: 26,
      fontWeight: "800",
      color: colors.text,
      marginBottom: 8,
      textAlign: "center",
      letterSpacing: -0.4,
    },
    heroSub: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 21,
      maxWidth: 320,
    },
    benefitRow: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 12,
      marginBottom: 24,
      flexWrap: "wrap",
    },
    benefitItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.primaryLight,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 20,
    },
    benefitText: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: "600",
    },
    tabRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 20,
      backgroundColor: colors.card,
      padding: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 8,
      borderRadius: 9,
    },
    tabBtnActive: {
      backgroundColor: colors.primaryLight,
    },
    tabBtnText: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: "600",
    },
    tabBtnTextActive: {
      color: colors.primary,
    },
    stepsWrap: {
      gap: 12,
      marginBottom: 16,
    },
    stepCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    stepNum: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    stepNumText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "800",
    },
    stepIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: colors.primaryLight,
      alignItems: "center",
      justifyContent: "center",
    },
    stepText: {
      flex: 1,
    },
    stepLabel: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 3,
    },
    stepDetail: {
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 17,
    },
    tipBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      backgroundColor: colors.primaryLight,
      borderRadius: 12,
      padding: 14,
      marginBottom: 4,
      borderWidth: 1,
      borderColor: colors.primary + "30",
    },
    tipText: {
      flex: 1,
      fontSize: 13,
      color: colors.primary,
      lineHeight: 19,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    skipBtn: {
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    skipText: {
      fontSize: 14,
      color: colors.textMuted,
      fontWeight: "600",
    },
    doneBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
    },
    doneBtnText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "700",
    },
  });
}
