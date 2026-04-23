import React, { useState } from "react";
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
import Colors, { shadow } from "@/constants/colors";
import {
  buildBackup,
  restoreBackup,
  writeBackupToFile,
  type BackupFile,
} from "@/utils/backup";
import { isCancellationError } from "@/utils/safe-share";

export default function BackupScreen() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");

  const handleExport = async () => {
    if (busy) return;
    setBusy(true);
    setProgress("Mengumpulkan data...");
    try {
      const backup = await buildBackup((m) => setProgress(m));
      setProgress("Menulis file backup...");
      const { uri, filename, sizeBytes } = await writeBackupToFile(backup);
      const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(2);
      const mediaCount = Object.keys(backup.media).length;
      setProgress("");

      const canShare = await Sharing.isAvailableAsync().catch(() => false);
      if (canShare) {
        try {
          await Sharing.shareAsync(uri, {
            mimeType: "application/json",
            dialogTitle: "Simpan Backup LearningPath",
            UTI: "public.json",
          });
        } catch (e) {
          if (!isCancellationError(e)) {
            console.warn("[backup] share error", e);
          }
        }
      } else {
        Alert.alert(
          "Backup tersimpan",
          `File: ${filename}\nLokasi: ${uri}\nUkuran: ${sizeMb} MB\nMedia: ${mediaCount} file`
        );
      }
    } catch (e) {
      console.error("[backup] export failed", e);
      Alert.alert("Backup Gagal", "Tidak dapat membuat file backup.");
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
        throw new Error(
          "File ini bukan backup LearningPath yang valid."
        );
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
                  `${keysRestored} kategori data & ${mediaRestored} file media dipulihkan. Aplikasi akan dimuat ulang.`,
                  [
                    {
                      text: "OK",
                      onPress: () => router.replace("/(tabs)"),
                    },
                  ]
                );
              } catch (err) {
                console.error("[backup] restore failed", err);
                Alert.alert(
                  "Pulih Gagal",
                  err instanceof Error
                    ? err.message
                    : "Tidak dapat memulihkan backup."
                );
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
      const msg =
        e instanceof Error ? e.message : "Tidak dapat membaca file backup.";
      Alert.alert("Import Gagal", msg);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Backup & Pulih",
          headerStyle: { backgroundColor: Colors.background },
          headerTitleStyle: { color: Colors.text },
        }}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.intro}>
          <Feather name="hard-drive" size={28} color={Colors.primary} />
          <Text style={styles.title}>Backup Lengkap</Text>
          <Text style={styles.sub}>
            Simpan semua data belajarmu (kursus, modul, flashcard, quiz, catatan,
            materi, statistik) beserta gambar & audio yang menempel ke dalam
            satu file backup. File ini bisa kamu simpan, bagikan, dan pulihkan
            kapan saja — sepenuhnya offline.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.action, styles.actionPrimary]}
          onPress={handleExport}
          disabled={busy}
          activeOpacity={0.85}
        >
          <Feather name="upload" size={22} color={Colors.white} />
          <View style={styles.actionTextWrap}>
            <Text style={styles.actionTitle}>Buat & Bagikan Backup</Text>
            <Text style={styles.actionSub}>
              Hasilkan file .json berisi seluruh data + media
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.action, styles.actionSecondary]}
          onPress={handleImport}
          disabled={busy}
          activeOpacity={0.85}
        >
          <Feather name="download" size={22} color={Colors.primary} />
          <View style={styles.actionTextWrap}>
            <Text style={[styles.actionTitle, { color: Colors.primary }]}>
              Pulihkan dari File
            </Text>
            <Text style={[styles.actionSub, { color: Colors.textMuted }]}>
              Pilih file backup .json untuk memulihkan
            </Text>
          </View>
        </TouchableOpacity>

        {busy && (
          <View style={styles.progressBox}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.progressText}>
              {progress || "Memproses..."}
            </Text>
          </View>
        )}

        <View style={styles.note}>
          <Feather name="info" size={14} color={Colors.textMuted} />
          <Text style={styles.noteText}>
            Memulihkan akan menimpa data saat ini. Disarankan membuat backup
            terlebih dahulu sebelum memulihkan.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, gap: 16 },
  intro: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 18,
    gap: 8,
    ...shadow,
  },
  title: { fontSize: 20, fontWeight: "800", color: Colors.text },
  sub: { fontSize: 13, color: Colors.textMuted, lineHeight: 19 },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 14,
    ...shadow,
  },
  actionPrimary: { backgroundColor: Colors.primary },
  actionSecondary: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionTextWrap: { flex: 1 },
  actionTitle: { fontSize: 15, fontWeight: "700", color: Colors.white },
  actionSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.85)",
    marginTop: 2,
  },
  progressBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    ...shadow,
  },
  progressText: { fontSize: 13, color: Colors.text, flex: 1 },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 4,
  },
  noteText: { fontSize: 12, color: Colors.textMuted, flex: 1, lineHeight: 17 },
});
