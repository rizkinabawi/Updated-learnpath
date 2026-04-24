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
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useColors } from "@/contexts/ThemeContext";
import {
  describeBundleError,
  parseBundleInput,
  unlockBundle,
  verifyBundleSignature,
  type BundleContent,
  type SignedBundle,
} from "@/utils/security/bundle";

type Stage = "input" | "password" | "unlocked";

export default function BundleOpenScreen() {
  const colors = useColors();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [bundleText, setBundleText] = useState("");
  const [bundle, setBundle] = useState<SignedBundle | null>(null);
  const [password, setPassword] = useState("");
  const [content, setContent] = useState<BundleContent | null>(null);
  const [stage, setStage] = useState<Stage>("input");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const verifyAndPromptPassword = useCallback(async () => {
    setErr(null);
    const parsed = parseBundleInput(bundleText);
    if (!parsed) {
      setErr("Format bundle tidak dikenali.");
      return;
    }
    setBusy(true);
    const sigErr = await verifyBundleSignature(parsed);
    setBusy(false);
    if (sigErr) {
      setErr(describeBundleError(sigErr));
      return;
    }
    setBundle(parsed);
    setStage("password");
  }, [bundleText]);

  const tryUnlock = useCallback(async () => {
    if (!bundle) return;
    setErr(null);
    setBusy(true);
    const res = await unlockBundle(bundle, password);
    setBusy(false);
    if (!res.ok) {
      setErr(describeBundleError(res.error));
      return;
    }
    setContent(res.result.content);
    setStage("unlocked");
  }, [bundle, password]);

  const reset = () => {
    setBundleText("");
    setBundle(null);
    setPassword("");
    setContent(null);
    setStage("input");
    setErr(null);
  };

  const pasteFromClipboard = async () => {
    try {
      const t = await Clipboard.getStringAsync();
      if (t) setBundleText(t);
    } catch {
      /* ignore */
    }
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

        <Text style={styles.title}>Buka Bundle</Text>

        {stage === "input" && (
          <>
            <Text style={styles.subtitle}>
              Tempel bundle JSON yang Anda terima dari creator. Bundle akan
              diverifikasi tanda tangannya, lalu Anda diminta memasukkan password.
            </Text>
            <TextInput
              value={bundleText}
              onChangeText={setBundleText}
              placeholder='{"bundleId":"...","creatorId":"...","creatorPublicKey":"...","contentHash":"...","signature":"...","passwordHash":"...","encryptedContent":"..."}'
              placeholderTextColor={colors.textSecondary}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              editable={!busy}
            />
            <View style={styles.row}>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={pasteFromClipboard}>
                <Feather name="clipboard" size={16} color={colors.text} />
                <Text style={styles.btnSecondaryText}>Tempel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, busy && { opacity: 0.6 }]}
                onPress={verifyAndPromptPassword}
                disabled={busy || bundleText.trim().length === 0}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Feather name="check" size={16} color="#fff" />
                    <Text style={styles.btnPrimaryText}>Verifikasi</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}

        {stage === "password" && bundle && (
          <>
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Bundle ID</Text>
              <Text style={styles.metaValue} selectable>{bundle.bundleId}</Text>
              <Text style={styles.metaLabel}>Creator ID</Text>
              <Text style={styles.metaValue} selectable>{bundle.creatorId}</Text>
              <Text style={styles.metaLabel}>Content Hash</Text>
              <Text style={styles.metaValue} selectable>{bundle.contentHash}</Text>
              <View style={styles.verifiedRow}>
                <Feather name="shield" size={14} color="#16a34a" />
                <Text style={styles.verifiedText}>Tanda tangan creator valid</Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Masukkan password bundle"
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
              editable={!busy}
            />
            <View style={styles.row}>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={reset}>
                <Text style={styles.btnSecondaryText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, busy && { opacity: 0.6 }]}
                onPress={tryUnlock}
                disabled={busy || password.length === 0}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Feather name="unlock" size={16} color="#fff" />
                    <Text style={styles.btnPrimaryText}>Unlock</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}

        {stage === "unlocked" && content && (
          <>
            <View style={styles.successBox}>
              <Feather name="check-circle" size={20} color="#16a34a" />
              <Text style={styles.successText}>
                Bundle terverifikasi & terdekripsi ({content.cards.length} kartu)
              </Text>
            </View>
            {content.cards.map((c: any, i: number) => (
              <View key={i} style={styles.cardPreview}>
                <Text style={styles.cardQ}>Q{i + 1}. {c.q ?? JSON.stringify(c)}</Text>
                {c.a !== undefined && <Text style={styles.cardA}>{c.a}</Text>}
              </View>
            ))}
            {Object.keys(content.media).length > 0 && (
              <View style={styles.mediaBox}>
                <Text style={styles.mediaTitle}>Media ({Object.keys(content.media).length})</Text>
                {Object.keys(content.media).map((name) => (
                  <Text key={name} style={styles.mediaName}>• {name}</Text>
                ))}
              </View>
            )}
            <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={reset}>
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

const makeStyles = (c: ReturnType<typeof useColors>) =>
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
      minHeight: 120,
      textAlignVertical: "top",
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
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
      backgroundColor: "#dcfce7",
      padding: 12,
      borderRadius: 10,
    },
    successText: { color: "#166534", fontWeight: "700", flex: 1 },
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
      backgroundColor: "#fee2e2",
      padding: 12,
      borderRadius: 10,
    },
    errText: { color: "#b91c1c", fontSize: 13, flex: 1, fontWeight: "600" },
  });
