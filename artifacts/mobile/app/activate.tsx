/**
 * activate.tsx
 *
 * App activation screen (Section 1, Section 11). Shown when no valid license
 * is stored. Blocks all other navigation until the user pastes a valid
 * activation key signed by the APP MASTER private key.
 */

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useColors } from "@/contexts/ThemeContext";
import {
  describeLicenseError,
  parseLicenseInput,
  storeLicense,
  verifyLicense,
} from "@/utils/security/app-license";
import { getDeviceId } from "@/utils/security/device";
import { APP_ID } from "@/utils/security/master-public-key";

export default function ActivateScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string>("");
  const [activated, setActivated] = useState(false);

  React.useEffect(() => {
    getDeviceId().then(setDeviceId).catch(() => {});
  }, []);

  // After successful activation we just have to leave this screen — root
  // layout's gate will re-evaluate and route to the main app.
  React.useEffect(() => {
    if (!activated) return;
    // Tiny grace period so the success state is visible.
    const t = setTimeout(() => {
      // Route reset: replacing with `/` makes the layout pick the next screen.
      // expo-router supports require to avoid pulling Router type in deps.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { router } = require("expo-router");
      try {
        router.replace("/");
      } catch {
        /* ignore */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [activated]);

  const handleActivate = async () => {
    setErr(null);
    const parsed = parseLicenseInput(input);
    if (!parsed) {
      setErr("Format kunci aktivasi tidak dikenali. Tempel JSON kunci yang lengkap.");
      return;
    }
    setBusy(true);
    const verifyErr = await verifyLicense(parsed);
    if (verifyErr) {
      setBusy(false);
      setErr(describeLicenseError(verifyErr));
      return;
    }
    await storeLicense(parsed);
    setBusy(false);
    setActivated(true);
  };

  const pasteFromClipboard = async () => {
    try {
      const t = await Clipboard.getStringAsync();
      if (t) setInput(t);
    } catch {
      /* ignore */
    }
  };

  const copyDeviceId = async () => {
    if (!deviceId) return;
    try {
      await Clipboard.setStringAsync(deviceId);
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
        <View style={styles.header}>
          <View style={styles.lockBadge}>
            <Feather name="shield" size={28} color="#fff" />
          </View>
          <Text style={styles.title}>Aplikasi Terkunci</Text>
          <Text style={styles.subtitle}>
            Aplikasi {APP_ID} memerlukan kunci aktivasi yang sah untuk dibuka.
            Tempel kunci yang Anda terima dari penerbit.
          </Text>
        </View>

        {activated ? (
          <View style={styles.successBox}>
            <Feather name="check-circle" size={32} color="#16a34a" />
            <Text style={styles.successText}>Aktivasi berhasil</Text>
            <Text style={styles.successSub}>Membuka aplikasi…</Text>
          </View>
        ) : (
          <>
            <Text style={styles.inputLabel}>Kunci Aktivasi (JSON atau Base64)</Text>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder='{"appId":"learningpath","issuedAt":...,"expiry":...,"deviceId":"...","signature":"..."}'
              placeholderTextColor={colors.textSecondary}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              editable={!busy}
            />

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary]}
                onPress={pasteFromClipboard}
                disabled={busy}
              >
                <Feather name="clipboard" size={16} color={colors.text} />
                <Text style={styles.btnSecondaryText}>Tempel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, busy && { opacity: 0.6 }]}
                onPress={handleActivate}
                disabled={busy || input.trim().length === 0}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Feather name="unlock" size={16} color="#fff" />
                    <Text style={styles.btnPrimaryText}>Aktivasi</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {err && (
              <View style={styles.errBox}>
                <Feather name="alert-circle" size={16} color="#b91c1c" />
                <Text style={styles.errText}>{err}</Text>
              </View>
            )}

            <View style={styles.deviceCard}>
              <Text style={styles.deviceLabel}>Device ID perangkat ini</Text>
              <Text style={styles.deviceValue} selectable>
                {deviceId || "…"}
              </Text>
              <TouchableOpacity onPress={copyDeviceId} style={styles.copyBtn}>
                <Feather name="copy" size={14} color={colors.primary} />
                <Text style={styles.copyText}>Salin Device ID</Text>
              </TouchableOpacity>
              <Text style={styles.deviceHint}>
                Berikan ke penerbit jika kunci Anda dibatasi per perangkat.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { padding: 20, paddingTop: 60, gap: 16 },
    header: { alignItems: "center", marginBottom: 8 },
    lockBadge: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    title: {
      fontSize: 22,
      fontWeight: "800",
      color: c.text,
      marginBottom: 6,
      textAlign: "center",
    },
    subtitle: {
      fontSize: 14,
      color: c.textSecondary,
      textAlign: "center",
      lineHeight: 20,
      maxWidth: 320,
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: c.text,
      marginTop: 8,
    },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 12,
      fontSize: 13,
      color: c.text,
      backgroundColor: c.surface,
      minHeight: 140,
      textAlignVertical: "top",
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    actionsRow: { flexDirection: "row", gap: 10 },
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
    errBox: {
      flexDirection: "row",
      gap: 8,
      alignItems: "center",
      backgroundColor: "#fee2e2",
      padding: 12,
      borderRadius: 10,
    },
    errText: { color: "#b91c1c", fontSize: 13, flex: 1, fontWeight: "600" },
    deviceCard: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 14,
      backgroundColor: c.surface,
      marginTop: 4,
    },
    deviceLabel: {
      fontSize: 12,
      color: c.textSecondary,
      fontWeight: "600",
      marginBottom: 4,
    },
    deviceValue: {
      fontSize: 13,
      color: c.text,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      marginBottom: 8,
    },
    copyBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
    },
    copyText: { color: c.primary, fontWeight: "700", fontSize: 12 },
    deviceHint: { fontSize: 11, color: c.textSecondary, marginTop: 8 },
    successBox: {
      alignItems: "center",
      gap: 6,
      padding: 32,
      backgroundColor: c.surface,
      borderRadius: 16,
    },
    successText: { fontSize: 18, fontWeight: "800", color: c.text },
    successSub: { fontSize: 13, color: c.textSecondary },
  });
