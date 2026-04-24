/**
 * creator/create-bundle.tsx
 *
 * Section 11 (creator UI). Build a content bundle from cards + media,
 * encrypt with a user-chosen password (Section 5), self-sign with the
 * creator's Ed25519 key (Section 3), and export the resulting JSON.
 */

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  Share,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useColors } from "@/contexts/ThemeContext";
import {
  createSignedBundle,
  type BundleContent,
} from "@/utils/security/bundle";
import {
  ensureCreatorIdentity,
  getCreatorIdentity,
  type CreatorIdentity,
} from "@/utils/security/creator";

interface DraftCard {
  q: string;
  a: string;
}

export default function CreateBundleScreen() {
  const colors = useColors();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [identity, setIdentity] = useState<CreatorIdentity | null>(null);
  const [bundleId, setBundleId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [cards, setCards] = useState<DraftCard[]>([{ q: "", a: "" }]);
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState<string | null>(null);

  useEffect(() => {
    getCreatorIdentity().then(setIdentity);
  }, []);

  const updateCard = (i: number, key: keyof DraftCard, value: string) => {
    setCards((prev) => prev.map((c, idx) => (idx === i ? { ...c, [key]: value } : c)));
  };

  const addCard = () => setCards((p) => [...p, { q: "", a: "" }]);
  const removeCard = (i: number) =>
    setCards((p) => (p.length === 1 ? p : p.filter((_, idx) => idx !== i)));

  const handleExport = useCallback(async () => {
    if (!bundleId.trim()) return Alert.alert("Bundle ID wajib diisi.");
    if (password.length < 4) return Alert.alert("Password minimal 4 karakter.");
    if (password !== confirmPw) return Alert.alert("Konfirmasi password tidak cocok.");
    const trimmed = cards.filter((c) => c.q.trim() && c.a.trim());
    if (trimmed.length === 0) return Alert.alert("Tambahkan minimal 1 kartu.");

    setBusy(true);
    try {
      // Ensure we have a creator identity before signing.
      const id = identity ?? (await ensureCreatorIdentity());
      setIdentity(id);

      const content: BundleContent = {
        cards: trimmed.map((c) => ({ q: c.q.trim(), a: c.a.trim() })),
        media: {},
      };

      const bundle = await createSignedBundle({
        bundleId: bundleId.trim(),
        password,
        content,
      });

      const json = JSON.stringify(bundle, null, 2);
      setOutput(json);
    } catch (e: any) {
      Alert.alert("Gagal membuat bundle", String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [bundleId, password, confirmPw, cards, identity]);

  const copy = async () => {
    if (!output) return;
    try {
      await Clipboard.setStringAsync(output);
      Alert.alert("Tersalin", "Bundle JSON disalin ke clipboard.");
    } catch {
      /* ignore */
    }
  };

  const share = async () => {
    if (!output) return;
    try {
      await Share.share({ message: output });
    } catch {
      /* ignore */
    }
  };

  const reset = () => {
    setOutput(null);
    setBundleId("");
    setPassword("");
    setConfirmPw("");
    setCards([{ q: "", a: "" }]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Feather name="arrow-left" size={20} color={colors.text} />
        <Text style={styles.backText}>Kembali</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Buat Bundle</Text>
      <Text style={styles.subtitle}>
        Bundle akan ditandatangani oleh creator key Anda, terenkripsi dengan
        password, dan dapat diverifikasi sepenuhnya secara offline.
      </Text>

      {output ? (
        <>
          <View style={styles.successBox}>
            <Feather name="check-circle" size={24} color="#16a34a" />
            <Text style={styles.successText}>Bundle berhasil dibuat</Text>
          </View>

          <Text style={styles.fieldLabel}>Bundle JSON (signed + encrypted)</Text>
          <ScrollView
            horizontal
            style={styles.outputBox}
            contentContainerStyle={{ padding: 12 }}
          >
            <Text style={styles.outputText} selectable>
              {output}
            </Text>
          </ScrollView>

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={copy}>
              <Feather name="copy" size={16} color={colors.text} />
              <Text style={styles.btnSecondaryText}>Salin</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={share}>
              <Feather name="share-2" size={16} color="#fff" />
              <Text style={styles.btnPrimaryText}>Bagikan</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.resetBtn} onPress={reset}>
            <Feather name="plus" size={16} color={colors.primary} />
            <Text style={styles.resetText}>Buat Bundle Baru</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.fieldLabel}>Bundle ID</Text>
          <TextInput
            value={bundleId}
            onChangeText={setBundleId}
            placeholder="contoh: kursus-fisika-vol1"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            autoCapitalize="none"
          />

          <Text style={styles.fieldLabel}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password untuk enkripsi"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            secureTextEntry
            autoCapitalize="none"
          />

          <Text style={styles.fieldLabel}>Konfirmasi Password</Text>
          <TextInput
            value={confirmPw}
            onChangeText={setConfirmPw}
            placeholder="Ulangi password"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            secureTextEntry
            autoCapitalize="none"
          />

          <Text style={styles.sectionLabel}>Kartu</Text>
          {cards.map((c, i) => (
            <View key={i} style={styles.cardBox}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardIndex}>#{i + 1}</Text>
                {cards.length > 1 && (
                  <TouchableOpacity onPress={() => removeCard(i)}>
                    <Feather name="trash-2" size={16} color="#b91c1c" />
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                value={c.q}
                onChangeText={(v) => updateCard(i, "q", v)}
                placeholder="Pertanyaan"
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
                multiline
              />
              <TextInput
                value={c.a}
                onChangeText={(v) => updateCard(i, "a", v)}
                placeholder="Jawaban"
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
                multiline
              />
            </View>
          ))}

          <TouchableOpacity style={styles.addBtn} onPress={addCard}>
            <Feather name="plus" size={16} color={colors.primary} />
            <Text style={styles.addText}>Tambah Kartu</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, busy && { opacity: 0.6 }]}
            onPress={handleExport}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Feather name="lock" size={16} color="#fff" />
                <Text style={styles.btnPrimaryText}>Sign + Enkripsi + Export</Text>
              </>
            )}
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (c: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { padding: 20, gap: 12 },
    backBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 40, marginBottom: 4 },
    backText: { color: c.text, fontSize: 14, fontWeight: "600" },
    title: { fontSize: 22, fontWeight: "800", color: c.text },
    subtitle: { fontSize: 13, color: c.textSecondary, marginBottom: 8 },
    fieldLabel: { fontSize: 12, fontWeight: "700", color: c.text, marginTop: 6 },
    sectionLabel: { fontSize: 14, fontWeight: "800", color: c.text, marginTop: 14 },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 10,
      fontSize: 14,
      color: c.text,
      backgroundColor: c.surface,
    },
    cardBox: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 12,
      gap: 8,
      backgroundColor: c.background,
    },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    cardIndex: { fontSize: 12, fontWeight: "700", color: c.textSecondary },
    addBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: c.border,
      borderRadius: 10,
    },
    addText: { color: c.primary, fontWeight: "700", fontSize: 13 },
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
    successBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "#dcfce7",
      padding: 12,
      borderRadius: 10,
    },
    successText: { color: "#166534", fontWeight: "700" },
    outputBox: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      backgroundColor: c.surface,
      maxHeight: 240,
    },
    outputText: {
      fontSize: 11,
      color: c.text,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },
    resetBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      marginTop: 4,
    },
    resetText: { color: c.primary, fontWeight: "700" },
  });
