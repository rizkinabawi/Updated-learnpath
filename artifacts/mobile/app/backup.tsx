import { useColors } from "@/contexts/ThemeContext";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";

import * as FileSystem from "@/utils/fs-compat";
import { shadow, type ColorScheme } from "@/constants/colors";
import {
  buildBackup,
  restoreBackup,
  writeBackupToFile,
  type BackupFile,
} from "@/utils/backup";
import { isCancellationError } from "@/utils/safe-share";

export default function BackupScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");

  const handleExport = async (mode: "share" | "download") => {
    if (busy) return;
    setBusy(true);
    setProgress("Mengumpulkan data...");
    try {
      const backup = await buildBackup((m) => setProgress(m));
      setProgress("Menulis file backup...");
      const { uri, filename } = await writeBackupToFile(backup);
      setProgress("");

      if (mode === "download") {
        const ok = await FileSystem.downloadToFile(uri, filename);
        if (ok) Alert.alert("Berhasil", "File backup telah disimpan.");
      } else {
        const canShare = await Sharing.isAvailableAsync().catch(() => false);
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: "application/json",
            dialogTitle: "Bagikan Backup LearningPath",
            UTI: "public.json",
          });
        } else {
          Alert.alert("Lokasi Backup", `File tersimpan di:\n${uri}`);
        }
      }
    } catch (e) {
      console.error("[backup] export failed", e);
      Alert.alert("Gagal", "Tidak dapat mengekspor backup.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const handleImport = async () => {
    if (busy) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];

      setBusy(true);
      setProgress("Membaca file...");
      const text = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      let parsed: BackupFile;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("File bukan JSON yang valid.");
      }
      if (parsed?.kind !== "learnpath-backup" || parsed?.version !== 1) {
        throw new Error("File ini bukan backup LearningPath yang valid.");
      }

      setBusy(false);
      setProgress("");

      Alert.alert(
        "Pulihkan Backup?",
        `Semua data saat ini akan ditimpa oleh backup tertanggal ${new Date(
          parsed.createdAt
        ).toLocaleString()}. Lanjutkan?`,
        [
          { text: "Batal", style: "cancel" },
          {
            text: "Pulihkan",
            style: "destructive",
            onPress: async () => {
              setBusy(true);
              setProgress("Memulihkan data & media...");
              try {
                const { keysRestored, mediaRestored } = await restoreBackup(
                  parsed,
                  (m) => setProgress(m)
                );
                Alert.alert(
                  "Pulih Berhasil",
                  `${keysRestored} kategori data & ${mediaRestored} file media dipulihkan.`,
                  [{ text: "Selesai", onPress: () => router.replace("/(tabs)") }]
                );
              } catch (err) {
                console.error("[backup] restore failed", err);
                Alert.alert("Pulih Gagal", "Gagal memulihkan backup.");
              } finally {
                setBusy(false);
                setProgress("");
              }
            },
          },
        ]
      );
    } catch (e) {
      setBusy(false);
      setProgress("");
      Alert.alert("Import Gagal", e instanceof Error ? e.message : "Terjadi kesalahan.");
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Backup & Pulih",
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { color: colors.text },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ paddingRight: 16 }}>
              <Feather name="chevron-left" size={24} color={colors.text} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={() => router.replace("/(tabs)")} style={{ paddingLeft: 16 }}>
              <Feather name="home" size={22} color={colors.text} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.intro}>
          <Feather name="hard-drive" size={28} color={colors.primary} />
          <Text style={styles.title}>Data & Recovery</Text>
          <Text style={styles.sub}>
            Amankan seluruh kursus, modul, flashcard, dan progres belajarmu dalam satu file.
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>EKSPOR DATA</Text>
        </View>

        <TouchableOpacity
          style={[styles.action, styles.actionPrimary]}
          onPress={() => handleExport("share")}
          disabled={busy}
          activeOpacity={0.85}
        >
          <Feather name="share-2" size={20} color={colors.white} />
          <View style={styles.actionTextWrap}>
            <Text style={styles.actionTitle}>Bagikan Backup</Text>
            <Text style={styles.actionSub}>Kirim file backup (.json) ke aplikasi lain</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.action, styles.actionSecondary]}
          onPress={() => handleExport("download")}
          disabled={busy}
          activeOpacity={0.85}
        >
          <Feather name="download-cloud" size={20} color={colors.primary} />
          <View style={styles.actionTextWrap}>
            <Text style={[styles.actionTitle, { color: colors.primary }]}>Simpan ke Perangkat</Text>
            <Text style={[styles.actionSub, { color: colors.textMuted }]}>Download langsung ke folder lokal</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>IMPOR DATA</Text>
        </View>

        <TouchableOpacity
          style={[styles.action, styles.actionSecondary]}
          onPress={handleImport}
          disabled={busy}
          activeOpacity={0.85}
        >
          <Feather name="refresh-cw" size={20} color={colors.text} />
          <View style={styles.actionTextWrap}>
            <Text style={[styles.actionTitle, { color: colors.text }]}>Pulihkan dari File</Text>
            <Text style={[styles.actionSub, { color: colors.textMuted }]}>Ganti data saat ini dengan file backup</Text>
          </View>
        </TouchableOpacity>

        {busy && (
          <View style={styles.progressBox}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.progressText}>{progress || "Memproses..."}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ColorScheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    scroll: { padding: 20, gap: 12 },
    intro: {
      backgroundColor: c.white,
      borderRadius: 16,
      padding: 18,
      gap: 6,
      ...shadow,
    },
    title: { fontSize: 20, fontWeight: "800", color: c.text },
    sub: { fontSize: 13, color: c.textMuted, lineHeight: 18 },
    sectionHeader: {
      marginTop: 10,
      paddingHorizontal: 4,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: "800",
      color: c.textMuted,
      letterSpacing: 0.5,
    },
    action: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      padding: 18,
      borderRadius: 16,
      ...shadow,
    },
    actionPrimary: { backgroundColor: c.primary },
    actionSecondary: {
      backgroundColor: c.white,
      borderWidth: 1,
      borderColor: c.border,
    },
    actionTextWrap: { flex: 1 },
    actionTitle: { fontSize: 15, fontWeight: "700", color: c.white },
    actionSub: {
      fontSize: 12,
      color: "rgba(255,255,255,0.85)",
      marginTop: 2,
    },
    progressBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: c.white,
      borderRadius: 12,
      padding: 14,
      ...shadow,
    },
    progressText: { fontSize: 13, color: c.text, flex: 1 },
  });
