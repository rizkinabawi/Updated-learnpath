/**
 * creator/index.tsx
 *
 * Section 2 + 11 — Creator hub. Lets the user become a creator (generate an
 * Ed25519 keypair on-device), inspect their public key / creatorId, and
 * navigate to the bundle creation flow. Private key NEVER leaves the device.
 */

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useColors, useTheme } from "@/contexts/ThemeContext";
import { type ColorScheme } from "@/constants/colors";
import {
  ensureCreatorIdentity,
  getCreatorIdentity,
  regenerateCreatorIdentity,
  type CreatorIdentity,
} from "@/utils/security/creator";

export default function CreatorHubScreen() {
  const router = useRouter();
  const { isDark, palette } = useTheme();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  const [identity, setIdentity] = useState<CreatorIdentity | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCreatorIdentity().then(setIdentity);
  }, []);

  const onCreate = useCallback(async () => {
    setBusy(true);
    try {
      const id = await ensureCreatorIdentity();
      setIdentity(id);
    } finally {
      setBusy(false);
    }
  }, []);

  const onRegenerate = useCallback(() => {
    Alert.alert(
      "Regenerate keypair?",
      "Bundle yang sudah Anda terbitkan tetap dapat diverifikasi konsumen, tetapi perangkat ini tidak akan bisa lagi menandatangani sebagai creator yang lama. Lanjutkan?",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Regenerate",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              const id = await regenerateCreatorIdentity();
              setIdentity(id);
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }, []);

  const copy = async (text: string, label: string) => {
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert("Tersalin", label);
    } catch {
      /* ignore */
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Feather name="arrow-left" size={20} color={colors.text} />
        <Text style={styles.backText}>Kembali</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Creator</Text>
      <Text style={styles.subtitle}>
        Jadi creator dan terbitkan bundle terenkripsi yang bisa diverifikasi
        offline oleh siapa pun. Kunci privat Anda tidak pernah meninggalkan
        perangkat ini.
      </Text>

      {!identity ? (
        <TouchableOpacity
          style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
          onPress={onCreate}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name="key" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Generate Creator Keypair</Text>
            </>
          )}
        </TouchableOpacity>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Creator ID</Text>
            <Text style={styles.cardValue} selectable>{identity.creatorId}</Text>
            <TouchableOpacity onPress={() => copy(identity.creatorId, "Creator ID disalin.")} style={styles.copyRow}>
              <Feather name="copy" size={14} color={colors.primary} />
              <Text style={styles.copyText}>Salin</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Public Key (base64)</Text>
            <Text style={styles.cardValue} selectable>{identity.publicKeyBase64}</Text>
            <TouchableOpacity onPress={() => copy(identity.publicKeyBase64, "Public key disalin.")} style={styles.copyRow}>
              <Feather name="copy" size={14} color={colors.primary} />
              <Text style={styles.copyText}>Salin</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Public Key (hex)</Text>
            <Text style={styles.cardValue} selectable>{identity.publicKeyHex}</Text>
          </View>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push("/creator/create-bundle")}
          >
            <Feather name="package" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Buat Bundle Baru</Text>
          </TouchableOpacity>

          {/* NEW: Token generation — main anti-piracy action */}
          <TouchableOpacity
            style={styles.tokenBtn}
            onPress={() => router.push("/creator/generate-token")}
          >
            <Feather name="key" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Generate Token Pembeli</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.dangerBtn}
            onPress={onRegenerate}
            disabled={busy}
          >
            <Feather name="refresh-cw" size={16} color="#b91c1c" />
            <Text style={styles.dangerBtnText}>Regenerate Keypair</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (c: ColorScheme, isDark: boolean, palette: string) =>
  StyleSheet.create({
    container: { padding: 20, gap: 14 },
    backBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 40, marginBottom: 8 },
    backText: { color: c.text, fontSize: 14, fontWeight: "600" },
    title: { fontSize: 24, fontWeight: "800", color: c.text },
    subtitle: { fontSize: 13, color: c.textSecondary, lineHeight: 19 },
    primaryBtn: {
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 8,
    },
    primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    dangerBtn: {
      borderWidth: 1,
      borderColor: "#fecaca",
      borderRadius: 12,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    dangerBtnText: { color: "#b91c1c", fontWeight: "700", fontSize: 14 },
    tokenBtn: {
      backgroundColor: "#16a34a",
      borderRadius: 12,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    divider: {
      height: 1,
      backgroundColor: c.border,
      marginVertical: 4,
    },
    card: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 14,
    },
    cardLabel: { fontSize: 12, color: c.textSecondary, fontWeight: "700", marginBottom: 6 },
    cardValue: {
      fontSize: 13,
      color: c.text,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    copyRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
    copyText: { color: c.primary, fontWeight: "700", fontSize: 12 },
  });
