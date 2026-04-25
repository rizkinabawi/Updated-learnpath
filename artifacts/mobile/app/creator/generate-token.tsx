/**
 * creator/generate-token.tsx
 *
 * UI for creators to generate unique per-buyer access tokens for their bundles.
 *
 * Flow:
 *   1. Creator enters Bundle ID (the bundleId used when creating the bundle)
 *   2. Creator enters buyer info (name / email / ID)
 *   3. Creator selects validity period (days)
 *   4. Generator signs a BuyerLicenseToken with their creator private key
 *   5. Token JSON is shown — creator copies/shares it with the buyer
 *   6. History of issued tokens is shown (in-memory only, not persisted)
 *
 * Security: each token has a unique 12-byte nonce, so even two tokens for
 * the same buyer / bundle are different strings. Tokens are verifiable fully
 * offline using the creator public key embedded in the bundle.
 */

import React, { useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Share,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useColors } from "@/contexts/ThemeContext";
import { generateBuyerToken } from "@/utils/security/bundle-license";
import { getCreatorIdentityWithKey } from "@/utils/security/creator";

// ─── Types ────────────────────────────────────────────────────────────────────

interface IssuedTokenRecord {
  id: number;
  bundleId: string;
  buyerId: string;
  days: number;
  expiryIso: string;
  tokenJson: string;
  issuedAt: string;
}

const VALIDITY_OPTIONS = [
  { label: "7 hari", days: 7 },
  { label: "30 hari", days: 30 },
  { label: "90 hari", days: 90 },
  { label: "1 tahun", days: 365 },
  { label: "Selamanya", days: 36500 },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function GenerateTokenScreen() {
  const colors = useColors();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [bundleId, setBundleId] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [selectedDays, setSelectedDays] = useState(365);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<IssuedTokenRecord[]>([]);
  const counterRef = useRef(0);

  const handleGenerate = async () => {
    const bid = bundleId.trim();
    const buyer = buyerId.trim();
    if (!bid) return Alert.alert("Bundle ID wajib diisi.", "Masukkan bundleId yang sama dengan yang digunakan saat membuat bundle.");
    if (!buyer) return Alert.alert("Buyer ID wajib diisi.", "Masukkan nama, email, atau nomor HP pembeli.");

    setBusy(true);
    try {
      // Load creator identity once — same key used for all tokens
      const identity = await getCreatorIdentityWithKey();
      if (!identity) {
        Alert.alert(
          "Creator keypair belum ada",
          "Buka halaman Creator → Generated Creator Keypair terlebih dahulu.",
        );
        return;
      }

      const tokenJson = await generateBuyerToken(
        { bundleId: bid, buyerId: buyer, days: selectedDays },
        identity,
      );

      const expiry = new Date(Date.now() + selectedDays * 86_400_000);
      const record: IssuedTokenRecord = {
        id: ++counterRef.current,
        bundleId: bid,
        buyerId: buyer,
        days: selectedDays,
        expiryIso: expiry.toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" }),
        tokenJson,
        issuedAt: new Date().toLocaleTimeString("id-ID"),
      };

      setHistory((prev) => [record, ...prev]);
      setBuyerId(""); // Reset buyer field for next generation; keep bundleId
    } catch (e: any) {
      Alert.alert("Gagal generate token", String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const copyToken = async (json: string) => {
    try {
      await Clipboard.setStringAsync(json);
      Alert.alert("Tersalin", "Token berhasil disalin ke clipboard.");
    } catch {
      /* ignore */
    }
  };

  const shareToken = async (json: string, buyer: string) => {
    try {
      await Share.share({
        message: json,
        title: `Token Akses Bundle untuk ${buyer}`,
      });
    } catch {
      /* ignore */
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Feather name="arrow-left" size={20} color={colors.text} />
        <Text style={styles.backText}>Kembali</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Generate Token Pembeli</Text>
      <Text style={styles.subtitle}>
        Setiap token unik, ditandatangani oleh creator key Anda, dan dapat
        diverifikasi pembeli secara offline. Token berbeda untuk tiap pembeli
        mencegah distribusi ilegal yang mudah dilacak.
      </Text>

      {/* Security badge */}
      <View style={styles.badge}>
        <Feather name="shield" size={14} color="#16a34a" />
        <Text style={styles.badgeText}>
          Ed25519 · nonce unik · verifikasi offline · tanpa server
        </Text>
      </View>

      {/* Form */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Detail Bundle</Text>

        <Text style={styles.label}>Bundle ID *</Text>
        <TextInput
          value={bundleId}
          onChangeText={setBundleId}
          placeholder="Contoh: kursus-matematika-vol1"
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>
          Harus sama persis dengan bundleId yang digunakan saat membuat bundle.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data Pembeli</Text>

        <Text style={styles.label}>Identitas Pembeli *</Text>
        <TextInput
          value={buyerId}
          onChangeText={setBuyerId}
          placeholder="Nama, email, atau nomor HP"
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
          autoCapitalize="words"
        />
        <Text style={styles.hint}>
          Identitas ini tertanam di token dan tidak bisa diubah pasca-penerbitan.
          Ini membuat penyebaran ilegal mudah dilacak.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Masa Berlaku</Text>
        <View style={styles.pillRow}>
          {VALIDITY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.days}
              style={[
                styles.pill,
                selectedDays === opt.days && styles.pillActive,
              ]}
              onPress={() => setSelectedDays(opt.days)}
            >
              <Text
                style={[
                  styles.pillText,
                  selectedDays === opt.days && styles.pillTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Generate button */}
      <TouchableOpacity
        style={[styles.generateBtn, busy && { opacity: 0.6 }]}
        onPress={handleGenerate}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Feather name="key" size={18} color="#fff" />
            <Text style={styles.generateBtnText}>Generate Token Baru</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Token history */}
      {history.length > 0 && (
        <>
          <Text style={styles.historyTitle}>
            Token Diterbitkan ({history.length})
          </Text>
          <Text style={styles.historySubtitle}>
            Token disimpan di sesi ini saja. Salin atau bagikan sebelum menutup layar.
          </Text>

          {history.map((rec) => (
            <View key={rec.id} style={styles.tokenCard}>
              {/* Header */}
              <View style={styles.tokenHeader}>
                <View style={styles.tokenBadge}>
                  <Feather name="check-circle" size={13} color="#16a34a" />
                  <Text style={styles.tokenBadgeText}>Signed</Text>
                </View>
                <Text style={styles.tokenTime}>{rec.issuedAt}</Text>
              </View>

              {/* Meta */}
              <View style={styles.metaRow}>
                <MetaChip icon="package" label="Bundle" value={rec.bundleId} colors={colors} />
                <MetaChip icon="user" label="Pembeli" value={rec.buyerId} colors={colors} />
              </View>
              <View style={styles.metaRow}>
                <MetaChip icon="clock" label="Berlaku" value={`s.d. ${rec.expiryIso}`} colors={colors} />
              </View>

              {/* Token preview */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tokenPreviewScroll}
              >
                <Text style={styles.tokenPreviewText} selectable>
                  {rec.tokenJson}
                </Text>
              </ScrollView>

              {/* Actions */}
              <View style={styles.tokenActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnOutline]}
                  onPress={() => copyToken(rec.tokenJson)}
                >
                  <Feather name="copy" size={14} color={colors.primary} />
                  <Text style={styles.actionBtnOutlineText}>Salin</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnFill]}
                  onPress={() => shareToken(rec.tokenJson, rec.buyerId)}
                >
                  <Feather name="share-2" size={14} color="#fff" />
                  <Text style={styles.actionBtnFillText}>Bagikan</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}

      {/* Info box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>ℹ️  Cara kerja token</Text>
        <Text style={styles.infoText}>
          1. Creator membuat bundle dengan password tertentu.{"\n"}
          2. Creator generate token untuk setiap pembeli (layar ini).{"\n"}
          3. Pembeli menerima dua hal: <Text style={styles.infoEmph}>bundle JSON</Text> + <Text style={styles.infoEmph}>token JSON</Text> + <Text style={styles.infoEmph}>password</Text>.{"\n"}
          4. App pembeli verifikasi token (offline) → jika valid, decrypt bundle.{"\n"}
          5. Token tidak bisa dipalsukan tanpa private key creator.
        </Text>
      </View>
    </ScrollView>
  );
}

// ─── Helper sub-component ─────────────────────────────────────────────────────

function MetaChip({
  icon,
  label,
  value,
  colors,
}: {
  icon: string;
  label: string;
  value: string;
  colors: any;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flex: 1 }}>
      <Feather name={icon as any} size={12} color={colors.textSecondary} />
      <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: "600" }}>
        {label}:{" "}
      </Text>
      <Text style={{ fontSize: 12, color: colors.text, fontWeight: "700", flexShrink: 1 }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (c: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { padding: 20, paddingBottom: 48, gap: 14 },
    backBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 40,
      marginBottom: 4,
    },
    backText: { color: c.text, fontSize: 14, fontWeight: "600" },
    title: { fontSize: 22, fontWeight: "800", color: c.text },
    subtitle: { fontSize: 13, color: c.textSecondary, lineHeight: 20 },

    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      backgroundColor: "#dcfce7",
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      alignSelf: "flex-start",
    },
    badgeText: { fontSize: 11, fontWeight: "700", color: "#15803d" },

    section: {
      backgroundColor: c.surface,
      borderRadius: 14,
      padding: 16,
      gap: 6,
      borderWidth: 1,
      borderColor: c.border,
    },
    sectionTitle: { fontSize: 13, fontWeight: "800", color: c.text, marginBottom: 4 },
    label: { fontSize: 12, fontWeight: "700", color: c.textSecondary },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: c.text,
      backgroundColor: c.background,
    },
    hint: { fontSize: 11, color: c.textSecondary, lineHeight: 16 },

    pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
    pill: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.background,
    },
    pillActive: { borderColor: c.primary, backgroundColor: c.primaryLight ?? "#eff6ff" },
    pillText: { fontSize: 13, fontWeight: "600", color: c.textSecondary },
    pillTextActive: { color: c.primary, fontWeight: "700" },

    generateBtn: {
      backgroundColor: c.primary,
      borderRadius: 14,
      paddingVertical: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      marginTop: 4,
    },
    generateBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },

    historyTitle: { fontSize: 16, fontWeight: "800", color: c.text, marginTop: 10 },
    historySubtitle: { fontSize: 12, color: c.textSecondary, marginTop: -8 },

    tokenCard: {
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      gap: 10,
    },
    tokenHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    tokenBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: "#dcfce7",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
    },
    tokenBadgeText: { fontSize: 11, fontWeight: "700", color: "#166534" },
    tokenTime: { fontSize: 11, color: c.textSecondary },

    metaRow: { flexDirection: "row", gap: 10 },

    tokenPreviewScroll: {
      backgroundColor: c.background,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      maxHeight: 64,
    },
    tokenPreviewText: {
      padding: 10,
      fontSize: 10,
      color: c.textSecondary,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      lineHeight: 16,
    },

    tokenActions: { flexDirection: "row", gap: 10 },
    actionBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      paddingVertical: 10,
      borderRadius: 10,
    },
    actionBtnOutline: { borderWidth: 1.5, borderColor: c.primary },
    actionBtnFill: { backgroundColor: c.primary },
    actionBtnOutlineText: { color: c.primary, fontWeight: "700", fontSize: 13 },
    actionBtnFillText: { color: "#fff", fontWeight: "700", fontSize: 13 },

    infoBox: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      marginTop: 8,
      gap: 8,
    },
    infoTitle: { fontSize: 13, fontWeight: "800", color: c.text },
    infoText: { fontSize: 12, color: c.textSecondary, lineHeight: 20 },
    infoEmph: { fontWeight: "700", color: c.text },
  });
