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
import * as FileSystem from "@/utils/fs-compat";
import { useColors } from "@/contexts/ThemeContext";
import {
  getLearningPaths,
  getIssuedTokens,
  saveIssuedToken,
  deleteIssuedToken,
  type IssuedTokenRecord,
} from "@/utils/storage";

// ─── Constants ────────────────────────────────────────────────────────────────

const VALIDITY_OPTIONS = [
  { label: "10 menit", ms: 600_000 },
  { label: "7 hari", ms: 7 * 86_400_000 },
  { label: "30 hari", ms: 30 * 86_400_000 },
  { label: "90 hari", ms: 90 * 86_400_000 },
  { label: "1 tahun", ms: 365 * 86_400_000 },
  { label: "Selamanya", ms: 36500 * 86_400_000 },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function GenerateTokenScreen() {
  const colors = useColors();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [bundleId, setBundleId] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [selectedDurationMs, setSelectedDurationMs] = useState(365 * 86_400_000);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<IssuedTokenRecord[]>([]);

  useEffect(() => {
    getIssuedTokens().then(setHistory);
  }, []);

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
        { bundleId: bid, buyerId: buyer, durationMs: selectedDurationMs },
        identity,
      );

      const expiry = new Date(Date.now() + selectedDurationMs);
      const record: IssuedTokenRecord = {
        id: Date.now().toString(),
        bundleId: bid,
        buyerId: buyer,
        durationMs: selectedDurationMs,
        expiryIso: expiry.toLocaleString("id-ID", { 
          year: "numeric", month: "long", day: "numeric", 
          hour: "2-digit", minute: "2-digit" 
        }),
        tokenJson,
        issuedAt: new Date().toLocaleTimeString("id-ID"),
      };

      await saveIssuedToken(record);
      setHistory((prev) => [record, ...prev]);
      setBuyerId(""); // Reset buyer field for next generation; keep bundleId
    } catch (e: any) {
      Alert.alert("Gagal generate token", String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const removeRecord = async (id: string) => {
    Alert.alert("Hapus Riwayat", "Hapus catatan token ini?", [
      { text: "Batal", style: "cancel" },
      { 
        text: "Hapus", 
        style: "destructive", 
        onPress: async () => {
          await deleteIssuedToken(id);
          setHistory(prev => prev.filter(t => t.id !== id));
        }
      }
    ]);
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
        Bundle yang Anda buat akan terkunci dan membutuhkan token akses.
        Satu token unik dibuat untuk satu pembeli spesifik agar bundle Anda aman dari pembajakan.
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
          💡 Masukkan Bundle ID yang Anda buat di menu "Buat Bundle Baru" sebelumnya. Token ini **hanya** akan bisa membuka file bundle tersebut.
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
          💡 Nama/Email pembeli agar Anda mudah melacak kepada siapa token ini diberikan. Identitas ini akan terpatri di dalam token selamanya.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Masa Berlaku</Text>
        <View style={styles.pillRow}>
          {VALIDITY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.ms}
              style={[
                styles.pill,
                selectedDurationMs === opt.ms && styles.pillActive,
              ]}
              onPress={() => setSelectedDurationMs(opt.ms)}
            >
              <Text
                style={[
                  styles.pillText,
                  selectedDurationMs === opt.ms && styles.pillTextActive,
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
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text style={styles.tokenTime}>{rec.issuedAt}</Text>
                  <TouchableOpacity onPress={() => removeRecord(rec.id)}>
                    <Feather name="trash-2" size={14} color="#b91c1c" />
                  </TouchableOpacity>
                </View>
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
                  style={[styles.actionBtn, styles.actionBtnOutline]}
                  onPress={async () => {
                    try {
                      const stamp = Date.now();
                      const tmp = `${FileSystem.cacheDirectory}token-${stamp}.json`;
                      await FileSystem.writeAsStringAsync(tmp, rec.tokenJson);
                      const ok = await FileSystem.downloadToFile(tmp, `token-${rec.buyerId}-${rec.bundleId}.json`);
                      if (ok) Alert.alert("Tersimpan", "Token telah disimpan ke perangkat.");
                    } catch (e: any) {
                      Alert.alert("Gagal menyimpan", e.message);
                    }
                  }}
                >
                  <Feather name="download" size={14} color={colors.primary} />
                  <Text style={styles.actionBtnOutlineText}>Simpan</Text>
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
        <Text style={styles.infoTitle}>💡 Cara Kerja Kunci & Bundle</Text>
        <Text style={styles.infoText}>
          <Text style={styles.infoEmph}>1. Kunci Bundle (Locking)</Text>: Saat Anda membuat bundle melalui menu "Buat Bundle Baru", file otomatis dienkripsi (dikunci).{"\n\n"}
          <Text style={styles.infoEmph}>2. Mengikat Token ke Bundle</Text>: Dengan memasukkan Bundle ID yang sama di halaman ini, Anda membuatkan kunci duplikat khusus untuk 1 pelanggan saja.{"\n\n"}
          <Text style={styles.infoEmph}>3. Yang Harus Dikirimkan ke Pembeli</Text> (ada 3 hal):{"\n"}
          • File <Text style={styles.infoEmph}>Bundle JSON</Text> (didapat saat buat bundle){"\n"}
          • Teks <Text style={styles.infoEmph}>Token Akses</Text> (didapat dari halaman ini){"\n"}
          • <Text style={styles.infoEmph}>Password</Text> yang Anda buat untuk bundle tersebut.
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
