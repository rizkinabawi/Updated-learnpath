import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { auth } from "@/utils/firebase";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { useRouter } from "expo-router";
import { useColors, useTheme } from "@/contexts/ThemeContext";
import { toast } from "@/components/Toast";
import { shadow, type ColorScheme } from "@/constants/colors";
import { LinearGradient } from "expo-linear-gradient";

// Handle redirect back to app
WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen() {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  const router = useRouter();

  const [loading, setLoading] = useState(false);

  // ── CONFIG GOOGLE AUTH ──
  // TODO: Ganti Client ID ini dengan milikmu dari Google Cloud Console
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: "1033210283172-mock-web.apps.googleusercontent.com",
    iosClientId: "1033210283172-mock-ios.apps.googleusercontent.com",
    androidClientId: "1033210283172-mock-android.apps.googleusercontent.com",
  });

  useEffect(() => {
    if (response?.type === "success") {
      const { id_token } = response.params;
      handleLoginWithFirebase(id_token);
    } else if (response?.type === "error") {
      toast.error("Gagal terhubung ke Google.");
      setLoading(false);
    }
  }, [response]);

  const handleLoginWithFirebase = async (idToken: string) => {
    setLoading(true);
    try {
      const credential = GoogleAuthProvider.credential(idToken);
      const userCred = await signInWithCredential(auth, credential);
      
      // Sync user to Firestore
      const { doc, getDoc, setDoc, serverTimestamp } = await import("firebase/firestore");
      const { db } = await import("@/utils/firebase");
      
      const userRef = doc(db, "users", userCred.user.uid);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        await setDoc(userRef, {
          name: userCred.user.displayName,
          email: userCred.user.email,
          avatar: userCred.user.photoURL,
          isPremium: false,
          createdAt: serverTimestamp(),
        });
      }

      toast.success("Berhasil masuk!");
      router.replace("/(tabs)");
    } catch (e: any) {
      console.error(e);
      toast.error("Gagal sinkronisasi akun. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  const handlePressLogin = () => {
    setLoading(true);
    promptAsync().catch(() => {
      setLoading(false);
      toast.error("Tidak dapat membuka browser.");
    });
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={[colors.background, colors.surface]} style={styles.grad}>
        <View style={styles.content}>
          <View style={styles.logoWrap}>
            <Text style={styles.logoEmoji}>🎓</Text>
          </View>
          <Text style={styles.title}>Selamat Datang</Text>
          <Text style={styles.subtitle}>
            Gunakan akun Google untuk sinkronisasi progres belajar kamu di semua perangkat.
          </Text>

          <View style={styles.form}>
            <TouchableOpacity 
              style={[styles.googleBtn, shadow]} 
              onPress={handlePressLogin} 
              disabled={loading || !request}
            >
              {loading ? <ActivityIndicator color={colors.text} /> : (
                <>
                  <Image 
                    source={{ uri: "https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" }} 
                    style={styles.googleIcon} 
                  />
                  <Text style={styles.googleBtnText}>Masuk dengan Google</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.footerNote}>
              Aman & Cepat. Tidak perlu email / password tambahan.
            </Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const makeStyles = (c: ColorScheme, isDark: boolean, palette: string) => StyleSheet.create({
  container: { flex: 1 },
  grad: { flex: 1, justifyContent: "center", padding: 24 },
  content: { alignItems: "center" },
  logoWrap: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: c.primary, alignItems: "center", justifyContent: "center",
    marginBottom: 24,
  },
  logoEmoji: { fontSize: 40 },
  title: { fontSize: 28, fontWeight: "900", color: c.text, marginBottom: 8 },
  subtitle: { fontSize: 14, color: c.textMuted, textAlign: "center", marginBottom: 48, paddingHorizontal: 20 },
  
  form: { width: "100%", gap: 20 },
  googleBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: c.surface, height: 56, borderRadius: 16,
    borderWidth: 1.5, borderColor: c.border,
    gap: 12,
  },
  googleIcon: { width: 22, height: 22 },
  googleBtnText: { fontSize: 16, fontWeight: "800", color: c.text },
  
  footerNote: { fontSize: 12, color: c.textMuted, textAlign: "center", marginTop: 12 },
});
