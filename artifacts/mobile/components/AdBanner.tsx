/**
 * AdBanner — Google AdMob Banner Component
 * Supports: Banner, LargeBanner, AnchoredAdaptiveBanner
 *
 * • Di Expo Go → tampil MockBanner (native module tidak tersedia)
 * • Di EAS Build (dev/preview/production) → tampil iklan nyata
 *   - __DEV__ build → Google Test Ads (tidak melanggar kebijakan)
 *   - production build → Iklan nyata dari AdMob
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import Colors from "@/constants/colors";

// ─── Ad Unit IDs ──────────────────────────────────────────────────────────────
const REAL_BANNER_ANDROID = "ca-app-pub-9450003707454763/5034353375";
const REAL_BANNER_IOS     = "ca-app-pub-9450003707454763/5034353375"; // ganti saat ada iOS unit

// ─── Runtime detection ────────────────────────────────────────────────────────
// Expo Go tidak bisa jalankan native modules (react-native-google-mobile-ads)
const isExpoGo = Constants.appOwnership === "expo";

// ─── Lazy-load AdMob (hanya di native build, agar Expo Go tidak crash) ───────
let BannerAdComponent: any = null;
let BannerAdSize: any = null;
let TestIds: any = null;

if (!isExpoGo && Platform.OS !== "web") {
  try {
    const admob = require("react-native-google-mobile-ads");
    BannerAdComponent = admob.BannerAd;
    BannerAdSize      = admob.BannerAdSize;
    TestIds           = admob.TestIds;
  } catch {
    // Native module belum tersedia (custom dev build yang belum include admob)
  }
}

// ─── Real Banner Ad ───────────────────────────────────────────────────────────
function RealBannerAd({ size }: { size: "banner" | "largeBanner" | "adaptiveBanner" }) {
  if (!BannerAdComponent || !BannerAdSize || !TestIds) return null;

  const unitId = __DEV__
    ? TestIds.ADAPTIVE_BANNER
    : Platform.OS === "ios" ? REAL_BANNER_IOS : REAL_BANNER_ANDROID;

  const adSize = size === "largeBanner"
    ? BannerAdSize.LARGE_BANNER
    : BannerAdSize.ANCHORED_ADAPTIVE_BANNER;

  return (
    <BannerAdComponent
      unitId={unitId}
      size={adSize}
      requestOptions={{ requestNonPersonalizedAdsOnly: true }}
    />
  );
}

// ─── Mock Banner (Expo Go / Web / dev fallback) ───────────────────────────────
const MOCK_ADS = [
  { label: "Belajar lebih cepat dengan AI", cta: "Coba Gratis", color: "#4C6FFF" },
  { label: "Flashcard & Quiz tersedia 24/7", cta: "Mulai Sekarang", color: "#7C3AED" },
  { label: "Raih target belajarmu hari ini", cta: "Lihat Tips", color: "#059669" },
];

function MockBannerAd({ size = "banner" }: { size?: string }) {
  const [adIndex, setAdIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setAdIndex((i) => (i + 1) % MOCK_ADS.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  if (dismissed) return null;

  const ad = MOCK_ADS[adIndex];
  const bannerHeight = size === "largeBanner" ? 100 : 50;

  return (
    <View style={[s.mockContainer, { height: bannerHeight }]}>
      <View style={s.badge}><Text style={s.badgeText}>Ad</Text></View>
      <View style={s.content}>
        <Feather name="zap" size={14} color={ad.color} style={{ marginRight: 6 }} />
        <Text style={s.adText} numberOfLines={1}>{ad.label}</Text>
      </View>
      <TouchableOpacity style={[s.ctaBtn, { borderColor: ad.color }]} activeOpacity={0.75}>
        <Text style={[s.ctaText, { color: ad.color }]}>{ad.cta}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setDismissed(true)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={s.dismissBtn}
        activeOpacity={0.7}
      >
        <Feather name="x" size={12} color={Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────
interface AdBannerProps {
  size?: "banner" | "largeBanner" | "adaptiveBanner";
  style?: object;
}

export function AdBanner({ size = "adaptiveBanner", style }: AdBannerProps) {
  if (Platform.OS === "web") return null;

  const canShowRealAds = !isExpoGo && BannerAdComponent !== null;

  return (
    <View style={style}>
      {canShowRealAds
        ? <RealBannerAd size={size} />
        : <MockBannerAd size={size} />
      }
    </View>
  );
}

const s = StyleSheet.create({
  mockContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
    width: "100%",
  },
  badge: {
    backgroundColor: "#F0F4FF",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  adText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark,
    flex: 1,
  },
  ctaBtn: {
    borderRadius: 20,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  ctaText: {
    fontSize: 11,
    fontWeight: "700",
  },
  dismissBtn: {
    padding: 2,
    marginLeft: 2,
  },
});
