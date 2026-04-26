import { useColors } from "@/contexts/ThemeContext";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  Linking,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { type ColorScheme } from "@/constants/colors";
import { ExternalScreen, getExternalScreen } from "@/utils/externalScreens";

export default function ExternalViewPage() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [screen, setScreen] = useState<ExternalScreen | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    (async () => {
      if (typeof id === "string") {
        const s = await getExternalScreen(id);
        setScreen(s);
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!screen) {
    return (
      <View style={[styles.loading, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Feather name="alert-circle" size={36} color={colors.textMuted} />
        <Text style={styles.errorText}>Halaman tidak ditemukan</Text>
        <TouchableOpacity style={styles.backCta} onPress={() => router.back()}>
          <Text style={styles.backCtaText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (Platform.OS === "web") {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header
          title={screen.title}
          url={screen.url}
          onBack={() => router.back()}
          onReload={() => {}}
          onForward={() => {}}
          canGoBack={false}
          colors={colors}
          styles={styles}
        />
        <View style={styles.webFallback}>
          <Feather name="external-link" size={36} color={colors.primary} />
          <Text style={styles.webFallbackTitle}>Buka di tab baru</Text>
          <Text style={styles.webFallbackText}>
            Preview website di mode web terbatas. Buka di tab baru untuk pengalaman penuh.
          </Text>
          <TouchableOpacity
            style={styles.openBtn}
            onPress={() => Linking.openURL(screen.url)}
          >
            <Text style={styles.openBtnText}>Buka {screen.url}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header
        title={screen.title}
        url={screen.url}
        onBack={() => router.back()}
        onReload={() => webRef.current?.reload()}
        onForward={() => webRef.current?.goForward()}
        canGoBack={canGoBack}
        onWebBack={() => webRef.current?.goBack()}
        colors={colors}
        styles={styles}
      />
      {progress > 0 && progress < 1 && (
        <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
      )}
      <WebView
        ref={webRef}
        source={{ uri: screen.url }}
        style={{ flex: 1 }}
        onLoadProgress={({ nativeEvent }) => setProgress(nativeEvent.progress)}
        onNavigationStateChange={(s) => setCanGoBack(s.canGoBack)}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.webLoading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
      />
    </View>
  );
}

function Header({
  title,
  url,
  onBack,
  onReload,
  onForward,
  canGoBack,
  onWebBack,
  colors,
  styles,
}: {
  title: string;
  url: string;
  onBack: () => void;
  onReload: () => void;
  onForward: () => void;
  canGoBack: boolean;
  onWebBack?: () => void;
  colors: ColorScheme;
  styles: any;
}) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.iconBtn} onPress={canGoBack && onWebBack ? onWebBack : onBack}>
        <Feather name="arrow-left" size={20} color={colors.text} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text style={styles.url} numberOfLines={1}>{url}</Text>
      </View>
      <TouchableOpacity style={styles.iconBtn} onPress={onReload}>
        <Feather name="refresh-cw" size={18} color={colors.text} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.iconBtn} onPress={onBack}>
        <Feather name="x" size={20} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (c: ColorScheme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.white },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: c.white },
  errorText: { marginTop: 12, color: c.text, fontWeight: "600" },
  backCta: {
    marginTop: 16,
    backgroundColor: c.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  backCtaText: { color: "#fff", fontWeight: "700" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    backgroundColor: c.white,
  },
  iconBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: c.background,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 14, fontWeight: "700", color: c.text },
  url: { fontSize: 11, color: c.textMuted, marginTop: 2 },
  progressBar: { height: 2, backgroundColor: c.primary },
  webLoading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: c.white },
  webFallback: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 12 },
  webFallbackTitle: { fontSize: 16, fontWeight: "700", color: c.text },
  webFallbackText: { fontSize: 13, color: c.textMuted, textAlign: "center", maxWidth: 320, lineHeight: 19 },
  openBtn: { marginTop: 8, backgroundColor: c.primary, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 },
  openBtnText: { color: "#fff", fontWeight: "700" },
});
