import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";

// ─────────────────────────────────────────────────────────────────────────────
// PERSONALISASI — Ubah bagian ini sesuai data kamu!
// ─────────────────────────────────────────────────────────────────────────────
const DEV = {
  name: "Rizki Nabawi",
  title: "Mobile Developer · React Native Enthusiast",
  bio: "Halo! Aku Rizki, developer di balik aplikasi LearningPath. Aku passionate dalam membangun aplikasi mobile yang bermanfaat dan user-friendly. Selalu semangat belajar hal baru dan berbagi ilmu! 🚀",
  avatar: "👨‍💻",
  location: "Indonesia",
  skills: ["React Native", "Expo", "TypeScript", "JavaScript", "Node.js", "UI/UX"],
  socials: [
    {
      icon: "github" as const,
      label: "GitHub",
      url: "https://github.com/rizkinabawi",
      color: "#24292F",
      bg: "#24292F18",
    },
    {
      icon: "linkedin" as const,
      label: "LinkedIn",
      url: "https://linkedin.com/in/rizkinabawi",
      color: "#0A66C2",
      bg: "#0A66C218",
    },
    {
      icon: "instagram" as const,
      label: "Instagram",
      url: "https://instagram.com/rizkinabawi",
      color: "#E1306C",
      bg: "#E1306C18",
    },
    {
      icon: "twitter" as const,
      label: "Twitter / X",
      url: "https://twitter.com/rizkinabawi",
      color: "#1DA1F2",
      bg: "#1DA1F218",
    },
    {
      icon: "globe" as const,
      label: "kipotraits.com",
      url: "https://www.kipotraits.com",
      color: Colors.teal,
      bg: Colors.teal + "18",
    },
  ],
};

const APP_INFO = {
  name: "LearningPath",
  version: "v1.0.0",
  year: "2025",
  tagline: "Belajar lebih cerdas setiap hari 📚",
};
// ─────────────────────────────────────────────────────────────────────────────

export default function AboutDeveloper() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const open = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 16 }}
      >
        {/* ── HEADER ── */}
        <LinearGradient
          colors={["#4C6FFF", "#7C47FF"]}
          style={[
            styles.header,
            { paddingTop: Platform.OS === "web" ? 60 : insets.top + 16 },
          ]}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerLabel}>DEVELOPER</Text>

          {/* Avatar */}
          <View style={styles.avatarRing}>
            <LinearGradient
              colors={["#FFD700", "#FF6B6B"]}
              style={styles.avatarGrad}
            >
              <Text style={styles.avatarEmoji}>{DEV.avatar}</Text>
            </LinearGradient>
          </View>

          <Text style={styles.devName}>{DEV.name}</Text>
          <Text style={styles.devTitle}>{DEV.title}</Text>
          <View style={styles.locationRow}>
            <Feather name="map-pin" size={12} color="rgba(255,255,255,0.75)" />
            <Text style={styles.locationText}>{DEV.location}</Text>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {/* ── BIO ── */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Feather name="user" size={15} color={Colors.primary} />
              <Text style={styles.cardTitle}>Tentang Saya</Text>
            </View>
            <Text style={styles.bioText}>{DEV.bio}</Text>
          </View>

          {/* ── SKILLS ── */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Feather name="zap" size={15} color={Colors.amber} />
              <Text style={styles.cardTitle}>Tech Stack & Skills</Text>
            </View>
            <View style={styles.skillsWrap}>
              {DEV.skills.map((skill) => (
                <View key={skill} style={styles.skillChip}>
                  <Text style={styles.skillText}>{skill}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── SOCIAL MEDIA ── */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Feather name="share-2" size={15} color={Colors.teal} />
              <Text style={styles.cardTitle}>Temukan Saya Di</Text>
            </View>
            <View style={styles.socialsGrid}>
              {DEV.socials.map((s) => (
                <TouchableOpacity
                  key={s.label}
                  style={[styles.socialBtn, { backgroundColor: s.bg, borderColor: s.color + "30" }]}
                  onPress={() => open(s.url)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.socialIcon, { backgroundColor: s.color + "22" }]}>
                    <Feather name={s.icon} size={18} color={s.color} />
                  </View>
                  <Text style={[styles.socialLabel, { color: s.color }]}>{s.label}</Text>
                  <Feather name="external-link" size={11} color={s.color + "80"} />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── APP INFO ── */}
          <View style={[styles.card, styles.appInfoCard]}>
            <LinearGradient
              colors={["#4C6FFF18", "#7C47FF18"]}
              style={styles.appInfoGrad}
            >
              <Text style={styles.appInfoEmoji}>📱</Text>
              <Text style={styles.appInfoName}>{APP_INFO.name}</Text>
              <Text style={styles.appInfoVersion}>{APP_INFO.version}</Text>
              <Text style={styles.appInfoTagline}>{APP_INFO.tagline}</Text>
              <View style={styles.appInfoDivider} />
              <Text style={styles.appInfoMade}>
                Made with <Text style={{ color: "#FF6B6B" }}>♥</Text> by {DEV.name} · {APP_INFO.year}
              </Text>
            </LinearGradient>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    paddingBottom: 36,
    paddingHorizontal: 24,
    position: "relative",
  },
  backBtn: {
    position: "absolute",
    top: Platform.OS === "web" ? 60 : 52,
    left: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 2,
    marginBottom: 20,
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(255,255,255,0.2)",
    padding: 3,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  avatarGrad: {
    flex: 1,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEmoji: {
    fontSize: 44,
  },
  devName: {
    fontSize: 24,
    fontWeight: "900",
    color: "#fff",
    marginBottom: 4,
    textAlign: "center",
  },
  devTitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  locationText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "500",
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.dark,
    letterSpacing: 0.3,
  },
  bioText: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 22,
    fontWeight: "500",
  },
  skillsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  skillChip: {
    backgroundColor: Colors.primary + "12",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.primary + "25",
  },
  skillText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: "700",
  },
  socialsGrid: {
    gap: 10,
  },
  socialBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  socialIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  socialLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
  },
  appInfoCard: {
    padding: 0,
    overflow: "hidden",
  },
  appInfoGrad: {
    alignItems: "center",
    padding: 24,
    borderRadius: 18,
    gap: 4,
  },
  appInfoEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  appInfoName: {
    fontSize: 20,
    fontWeight: "900",
    color: Colors.dark,
  },
  appInfoVersion: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: "600",
  },
  appInfoTagline: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: "500",
    marginTop: 4,
    textAlign: "center",
  },
  appInfoDivider: {
    width: 40,
    height: 1.5,
    backgroundColor: Colors.border ?? "#E2E8F0",
    borderRadius: 1,
    marginVertical: 12,
  },
  appInfoMade: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: "600",
  },
});
