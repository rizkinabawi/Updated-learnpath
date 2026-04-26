/**
 * bundle/open.tsx
 *
 * Section 8 + 11 — Locked bundle screen. Paste a SignedBundle JSON, the screen
 * verifies the creator signature, asks for the password, runs the dynamic
 * unlock token check, decrypts, and previews the cards. The decrypted content
 * is held in component state only — Section 9 forbids persisting it.
 */

import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "@/utils/fs-compat";
import { useColors, useTheme } from "@/contexts/ThemeContext";
import { type ColorScheme } from "@/constants/colors";
import {
  describeBundleError,
  parseBundleInput,
  unlockBundle,
  verifyBundleSignature,
  type BundleContent,
  type SignedBundle,
} from "@/utils/security/bundle";
import { importCourse } from "@/utils/storage";

type Stage = "input" | "password" | "unlocked";

export default function BundleOpenScreen() {
  const router = useRouter();
  const { isDark, palette } = useTheme();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);

  const [bundleText, setBundleText] = useState("");
  const [tokenText, setTokenText] = useState("");
  const [password, setPassword] = useState("");
  const [content, setContent] = useState<BundleContent | null>(null);
  const [stage, setStage] = useState<Stage>("input");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "*/*"],
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      setBusy(true);
      const text = await FileSystem.readAsStringAsync(res.assets[0].uri, { encoding: "utf8" });
      setBundleText(text);
      
      const parsed = parseBundleInput(text);
      if (!parsed) {
        Alert.alert("Format Tidak Valid", "File yang Anda pilih bukan merupakan format Bundle JSON yang sah.");
      } else {
        // Success feedback
      }
    } catch (e: any) {
      setErr(`Gagal membaca file: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const tryUnlockAndSave = useCallback(async () => {
    if (!bundleText.trim()) return Alert.alert("Bundle JSON wajib diisi.");
    if (!tokenText.trim()) return Alert.alert("Token Akses wajib diisi.");
    if (!password.trim()) return Alert.alert("Password wajib diisi.");

    setErr(null);
    setBusy(true);

    try {
      // 1. Detect if inputs are swapped
      if (bundleText.includes('"buyerId"') && !bundleText.includes('"signature"')) {
         throw new Error("Sepertinya Anda menempelkan 'Token' di kolom 'Bundle'. Mohon cek kembali.");
      }
      if (tokenText.includes('"encryptedContent"')) {
         throw new Error("Sepertinya Anda menempelkan 'Bundle' di kolom 'Token'. Mohon cek kembali.");
      }

      // 2. Parse Bundle
      const parsedBundle = parseBundleInput(bundleText);
      if (!parsedBundle) throw new Error("Format bundle tidak valid. Pastikan Anda menyalin seluruh teks JSON bundle.");

      // 2. Parse & Verify Token
      const { parseBuyerToken, verifyBuyerToken } = await import("@/utils/security/bundle-license");
      const parsedToken = parseBuyerToken(tokenText);
      if (!parsedToken) throw new Error("Format token tidak valid.");

      const tokenErr = await verifyBuyerToken(parsedToken, parsedBundle.bundleId, parsedBundle.creatorPublicKey);
      if (tokenErr) {
        const { describeTokenError } = await import("@/utils/security/bundle-license");
        throw new Error(describeTokenError(tokenErr));
      }

      // 3. Unlock with Password
      const res = await unlockBundle(parsedBundle, password);
      if (!res.ok) throw new Error(describeBundleError(res.error));

      const unlockedContent = res.result.content;
      setContent(unlockedContent);

      // 4. Auto-save if it's a course pack
      if (unlockedContent.coursePack) {
        const count = await importCourse(unlockedContent.coursePack);
        Alert.alert("Berhasil!", `Kursus "${unlockedContent.coursePack.paths?.[0]?.name ?? 'Untitled'}" telah disimpan ke perpustakaan Anda (${count} item).`);
        router.replace("/(tabs)");
      } else {
        setStage("unlocked");
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }, [bundleText, tokenText, password]);

  const reset = () => {
    setBundleText("");
    setTokenText("");
    setPassword("");
    setContent(null);
    setStage("input");
    setErr(null);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.text} />
          <Text style={styles.backText}>Kembali</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Buka Bundle Aman</Text>
        <Text style={styles.subtitle}>
          Masukkan file bundle dan token akses yang Anda terima untuk membuka
          konten secara offline.
        </Text>

        <View style={styles.form}>
          <Text style={styles.fieldLabel}>1. Bundle JSON / File</Text>
          <TextInput
            value={bundleText}
            onChangeText={setBundleText}
            placeholder="Tempel Bundle JSON di sini..."
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={4}
            style={[styles.input, { minHeight: 80 }]}
          />
          <TouchableOpacity style={styles.pickerBtn} onPress={pickFile}>
            <Feather name="file" size={14} color={colors.primary} />
            <Text style={styles.pickerBtnText}>Pilih File .json</Text>
          </TouchableOpacity>

          <Text style={styles.fieldLabel}>2. Token Akses (Diberikan oleh Seller)</Text>
          <TextInput
            value={tokenText}
            onChangeText={setTokenText}
            placeholder='{"v":1,"bundleId":"...","buyerId":"...","signature":"..."}'
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={4}
            style={[styles.input, { minHeight: 80 }]}
          />

          <Text style={styles.fieldLabel}>3. Password Bundle</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Masukkan password enkripsi"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { minHeight: 50, textAlignVertical: 'center' }]}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, busy && { opacity: 0.6 }, { marginTop: 10 }]}
            onPress={tryUnlockAndSave}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Feather name="unlock" size={18} color="#fff" />
                <Text style={styles.btnPrimaryText}>Verifikasi & Unlock</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {stage === "unlocked" && content && (
          <>
            <View style={styles.successBox}>
              <Feather name="check-circle" size={20} color="#16a34a" />
              <Text style={styles.successText}>
                Bundle terverifikasi & terdekripsi
              </Text>
            </View>

            {content.coursePack ? (
              <View style={styles.coursePackCard}>
                <View style={styles.cpHeader}>
                  <Feather name="book-open" size={24} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cpTitle}>{content.coursePack.paths?.[0]?.name ?? "Kursus Tanpa Nama"}</Text>
                    <Text style={styles.cpSub}>Shared Course Bundle</Text>
                  </View>
                </View>
                
                <View style={styles.cpStats}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{content.coursePack.lessons?.length ?? 0}</Text>
                    <Text style={styles.statLabel}>Materi</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{content.coursePack.flashcards?.length ?? 0}</Text>
                    <Text style={styles.statLabel}>Kartu</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{content.coursePack.quizzes?.length ?? 0}</Text>
                    <Text style={styles.statLabel}>Quiz</Text>
                  </View>
                </View>

                <TouchableOpacity 
                  style={[styles.btn, styles.btnPrimary, busy && { opacity: 0.6 }]}
                  onPress={async () => {
                    setBusy(true);
                    try {
                      const count = await importCourse(content.coursePack);
                      Alert.alert("Import Berhasil", `${count} item telah ditambahkan ke library Anda.`);
                      router.replace("/(tabs)");
                    } catch (e: any) {
                      Alert.alert("Gagal Import", e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={busy}
                >
                  {busy ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Feather name="download" size={18} color="#fff" />
                      <Text style={styles.btnPrimaryText}>Simpan ke Kursus Saya</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.previewTitle}>Preview Kartu ({content.cards.length})</Text>
                {content.cards.slice(0, 5).map((c: any, i: number) => (
                  <View key={i} style={styles.cardPreview}>
                    <Text style={styles.cardQ}>Q{i + 1}. {c.q ?? JSON.stringify(c)}</Text>
                    {c.a !== undefined && <Text style={styles.cardA}>{c.a}</Text>}
                  </View>
                ))}
                {content.cards.length > 5 && (
                  <Text style={styles.moreText}>+ {content.cards.length - 5} kartu lainnya...</Text>
                )}
                
                {Object.keys(content.media).length > 0 && (
                  <View style={styles.mediaBox}>
                    <Text style={styles.mediaTitle}>Media ({Object.keys(content.media).length})</Text>
                    {Object.keys(content.media).map((name) => (
                      <Text key={name} style={styles.mediaName}>• {name}</Text>
                    ))}
                  </View>
                )}
              </>
            )}

            <TouchableOpacity style={[styles.btn, styles.btnSecondary, { marginTop: 10 }]} onPress={reset}>
              <Feather name="refresh-cw" size={16} color={colors.text} />
              <Text style={styles.btnSecondaryText}>Buka Bundle Lain</Text>
            </TouchableOpacity>
          </>
        )}

        {err && (
          <View style={styles.errBox}>
            <Feather name="alert-circle" size={16} color="#b91c1c" />
            <Text style={styles.errText}>{err}</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: ColorScheme, isDark: boolean, palette: string) =>
  StyleSheet.create({
    container: { padding: 20, gap: 12 },
    backBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 40, marginBottom: 4 },
    backText: { color: c.text, fontSize: 14, fontWeight: "600" },
    title: { fontSize: 22, fontWeight: "800", color: c.text },
    subtitle: { fontSize: 13, color: c.textSecondary, lineHeight: 19 },
    fieldLabel: { fontSize: 12, fontWeight: "700", color: c.text, marginTop: 6 },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 10,
      fontSize: 13,
      color: c.text,
      backgroundColor: c.surface,
      textAlignVertical: "top",
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    form: { gap: 10, marginBottom: 10 },
    pickerBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-end",
      marginTop: -4,
      padding: 4,
    },
    pickerBtnText: {
      fontSize: 12,
      color: c.primary,
      fontWeight: "700",
    },
    row: { flexDirection: "row", gap: 10 },
    btn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    btnPrimary: { backgroundColor: c.primary },
    btnSecondary: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    btnPrimaryText: { color: "#fff", fontWeight: "700" },
    btnSecondaryText: { color: c.text, fontWeight: "700" },
    metaCard: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 12,
      gap: 4,
    },
    metaLabel: { fontSize: 11, color: c.textSecondary, fontWeight: "700", marginTop: 4 },
    metaValue: {
      fontSize: 12,
      color: c.text,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    verifiedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 6,
      paddingTop: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    verifiedText: { color: "#16a34a", fontWeight: "700", fontSize: 12 },
    successBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: c.successLight,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? c.success + "30" : "transparent",
    },
    successText: { color: c.success, fontWeight: "700", flex: 1 },
    cardPreview: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 12,
      gap: 4,
      backgroundColor: c.background,
    },
    cardQ: { color: c.text, fontWeight: "700" },
    cardA: { color: c.textSecondary, fontSize: 13 },
    mediaBox: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 12,
      backgroundColor: c.surface,
    },
    mediaTitle: { color: c.text, fontWeight: "700", marginBottom: 4 },
    mediaName: { color: c.textSecondary, fontSize: 12 },
    errBox: {
      flexDirection: "row",
      gap: 8,
      alignItems: "center",
      backgroundColor: c.dangerLight,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? c.danger + "30" : "transparent",
    },
    errText: { color: c.danger, fontSize: 13, flex: 1, fontWeight: "600" },
    coursePackCard: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 16,
      gap: 16,
      borderWidth: 1,
      borderColor: c.border,
    },
    cpHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    cpTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: c.text,
    },
    cpSub: {
      fontSize: 12,
      color: c.textSecondary,
    },
    cpStats: {
      flexDirection: "row",
      backgroundColor: c.background,
      borderRadius: 12,
      padding: 12,
      justifyContent: "space-around",
    },
    statItem: {
      alignItems: "center",
    },
    statValue: {
      fontSize: 16,
      fontWeight: "800",
      color: c.primary,
    },
    statLabel: {
      fontSize: 10,
      color: c.textSecondary,
      textTransform: "uppercase",
      fontWeight: "700",
    },
    previewTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: c.text,
      marginTop: 8,
    },
    moreText: {
      fontSize: 12,
      color: c.textSecondary,
      textAlign: "center",
      fontStyle: "italic",
    },
  });
