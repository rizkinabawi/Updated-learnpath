/**
 * BundleActivationModal.tsx
 *
 * Locked-bundle screen: shown when a signed bundle is opened but no valid
 * activation has been recorded for the current device.
 *
 * Props:
 *   - visible:  whether the modal is open
 *   - bundle:   the bundle envelope (already passed signature verification)
 *   - onUnlock: called after successful activation, with (bundleId, expiry)
 *   - onCancel: user dismissed without activating
 */

import React, { useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/contexts/ThemeContext";
import {
  parseActivationKeyInput,
  verifyActivationKey,
  describeVerifyError,
  type ActivationKey,
} from "@/utils/bundle-crypto";
import { recordUnlock } from "@/utils/bundle-activation";

interface Props {
  visible: boolean;
  bundle: {
    bundleId: string;
    creator: string;
    contentHash: string;
  } | null;
  onUnlock: (bundleId: string, expiry: number) => void;
  onCancel: () => void;
}

export function BundleActivationModal({ visible, bundle, onUnlock, onCancel }: Props) {
  const colors = useColors();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          justifyContent: "center",
          padding: 16,
        },
        card: {
          backgroundColor: colors.background,
          borderRadius: 20,
          padding: 20,
          maxHeight: "85%",
        },
        header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
        lockBadge: {
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.primary + "22",
          alignItems: "center",
          justifyContent: "center",
        },
        title: { fontSize: 18, fontWeight: "800", color: colors.text, flex: 1 },
        subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 14, lineHeight: 19 },
        infoRow: {
          flexDirection: "row",
          gap: 8,
          paddingVertical: 6,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        infoLabel: { fontSize: 12, color: colors.textSecondary, width: 90, fontWeight: "600" },
        infoValue: { fontSize: 12, color: colors.text, flex: 1, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
        inputWrap: { marginTop: 16 },
        inputLabel: { fontSize: 13, color: colors.text, fontWeight: "700", marginBottom: 6 },
        input: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          padding: 12,
          fontSize: 13,
          color: colors.text,
          backgroundColor: colors.surface,
          minHeight: 110,
          textAlignVertical: "top",
          fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
        },
        errBox: {
          flexDirection: "row",
          gap: 8,
          alignItems: "center",
          backgroundColor: "#fee2e2",
          padding: 10,
          borderRadius: 10,
          marginTop: 10,
        },
        errText: { color: "#b91c1c", fontSize: 13, flex: 1, fontWeight: "600" },
        actions: { flexDirection: "row", gap: 10, marginTop: 18 },
        btn: {
          flex: 1,
          paddingVertical: 13,
          borderRadius: 12,
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "center",
          gap: 8,
        },
        btnSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
        btnPrimary: { backgroundColor: colors.primary },
        btnSecondaryText: { color: colors.text, fontWeight: "700" },
        btnPrimaryText: { color: "#fff", fontWeight: "700" },
      }),
    [colors]
  );

  if (!bundle) return null;

  const handleActivate = async () => {
    setErr(null);
    const parsed: ActivationKey | null = parseActivationKeyInput(input);
    if (!parsed) {
      setErr("Format kunci aktivasi tidak dikenali. Tempel JSON kunci yang lengkap.");
      return;
    }
    setBusy(true);
    const verifyErr = await verifyActivationKey(parsed, bundle.bundleId);
    setBusy(false);
    if (verifyErr) {
      setErr(describeVerifyError(verifyErr));
      return;
    }
    await recordUnlock(parsed.bundleId, parsed.expiry);
    setInput("");
    onUnlock(parsed.bundleId, parsed.expiry);
  };

  const shortHash =
    bundle.contentHash.slice(0, 12) + "…" + bundle.contentHash.slice(-8);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.header}>
              <View style={styles.lockBadge}>
                <Feather name="lock" size={20} color={colors.primary} />
              </View>
              <Text style={styles.title} numberOfLines={2}>
                Bundle Terkunci
              </Text>
              <TouchableOpacity onPress={onCancel} hitSlop={10}>
                <Feather name="x" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.subtitle}>
                Bundle ini ditandatangani secara digital dan memerlukan kunci aktivasi
                untuk dibuka di perangkat ini.
              </Text>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Bundle ID</Text>
                <Text style={styles.infoValue} selectable>{bundle.bundleId}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Pembuat</Text>
                <Text style={styles.infoValue} selectable>{bundle.creator}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Hash Konten</Text>
                <Text style={styles.infoValue} selectable>{shortHash}</Text>
              </View>

              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>Kunci Aktivasi (JSON atau base64)</Text>
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  placeholder='{"bundleId":"...","issuedAt":...,"expiry":...,"signature":"..."}'
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  editable={!busy}
                />
              </View>

              {err && (
                <View style={styles.errBox}>
                  <Feather name="alert-circle" size={16} color="#b91c1c" />
                  <Text style={styles.errText}>{err}</Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary]}
                onPress={onCancel}
                disabled={busy}
              >
                <Text style={styles.btnSecondaryText}>Batal</Text>
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
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
