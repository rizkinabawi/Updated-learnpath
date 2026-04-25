import React, { useCallback, useState, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, Platform, Share,
  ActivityIndicator, Switch, useWindowDimensions, Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "@/utils/fs-compat";
import {
  getUser, getStats, getLearningPaths, clearAllData,
  importCourse, repairFlashcardStorage,
  type User as UserType, type Stats, type CoursePack,
} from "@/utils/storage";
import {
  getReminderSettings, saveReminderSettings, scheduleStudyReminder, cancelStudyReminder,
  type ReminderSettings,
} from "@/utils/notifications";
import { CourseBundleShareModal, CourseImportPreviewModal } from "@/components/CourseBundleModal";
import { BundleActivationModal } from "@/components/BundleActivationModal";
import { extractAssetsFromPack } from "@/utils/bundle-assets";
import { verifyBundleSignature, describeVerifyError } from "@/utils/bundle-crypto";
import { isBundleUnlocked } from "@/utils/bundle-activation";
import { shadow, shadowSm, type ColorScheme } from "@/constants/colors";
import { isCancellationError } from "@/utils/safe-share";
import { resolveAssetUri } from "@/utils/path-resolver";
import {
  shouldShowBackupReminder,
  snoozeBackupReminder,
  getDaysSinceLastBackup,
} from "@/utils/backup";
import { useTranslation } from "@/contexts/LanguageContext";
import { useTheme, useColors } from "@/contexts/ThemeContext";

export default function ProfileTab() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 720;
  const { t, language, setLanguage } = useTranslation();
  const { isDark, toggleTheme: toggleDark } = useTheme();
  const [user, setUser] = useState<UserType | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pathCount, setPathCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const [reminder, setReminder] = useState<ReminderSettings>({ enabled: false, hour: 19, minute: 0 });
  const [showShareModal, setShowShareModal] = useState(false);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [importPreviewPack, setImportPreviewPack] = useState<CoursePack | null>(null);
  const [pendingSignedBundle, setPendingSignedBundle] = useState<CoursePack | null>(null);
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  const [daysSinceBackup, setDaysSinceBackup] = useState<number | null>(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      const [u, s, paths, rem, shouldRemind, days] = await Promise.all([
        getUser(),
        getStats(),
        getLearningPaths(),
        getReminderSettings(),
        shouldShowBackupReminder(),
        getDaysSinceLastBackup(),
      ]);
      setUser(u); setStats(s); setPathCount(paths.length); setReminder(rem);
      setShowBackupReminder(shouldRemind);
      setDaysSinceBackup(days);
    })();
  }, []));

  const handleToggleReminder = async (val: boolean) => {
    const next = { ...reminder, enabled: val };
    setReminder(next);
    await saveReminderSettings(next);
    if (val) {
      await scheduleStudyReminder(next.hour, next.minute);
    } else {
      await cancelStudyReminder();
    }
  };

  const cycleHour = async (dir: 1 | -1) => {
    const next = { ...reminder, hour: (reminder.hour + dir + 24) % 24 };
    setReminder(next);
    await saveReminderSettings(next);
    if (next.enabled) await scheduleStudyReminder(next.hour, next.minute);
  };
  const cycleMinute = async (dir: 1 | -1) => {
    const options = [0, 15, 30, 45];
    const idx = options.indexOf(reminder.minute);
    const nextIdx = (idx + dir + options.length) % options.length;
    const next = { ...reminder, minute: options[nextIdx] };
    setReminder(next);
    await saveReminderSettings(next);
    if (next.enabled) await scheduleStudyReminder(next.hour, next.minute);
  };

  const proceedToPreview = async (pack: CoursePack) => {
    setImporting(true);
    try {
      const extractedPack = await extractAssetsFromPack(pack);
      setImportPreviewPack(extractedPack);
      setShowImportPreview(true);
    } finally {
      setImporting(false);
    }
  };

  const handleImportCourse = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "*/*"], copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const pack = JSON.parse(text) as CoursePack;
      if (!pack.version || !Array.isArray(pack.paths) || pack.paths.length === 0) {
        Alert.alert("Format Tidak Valid", "File bukan bundle kursus yang valid. Pastikan file dibuat dari fitur 'Bagikan Bundle Kursus'.");
        return;
      }

      // Signed bundle? → verify integrity, then check activation.
      const isSigned = !!(pack.bundleId && pack.creator && pack.contentHash && pack.signature);
      if (isSigned) {
        setImporting(true);
        const verifyErr = await verifyBundleSignature(pack);
        setImporting(false);
        if (verifyErr) {
          Alert.alert("Bundle Ditolak", `Verifikasi tanda tangan gagal: ${describeVerifyError(verifyErr)}`);
          return;
        }
        const unlocked = await isBundleUnlocked(pack.bundleId!);
        if (!unlocked) {
          setPendingSignedBundle(pack);
          setShowActivationModal(true);
          return;
        }
      }

      await proceedToPreview(pack);
    } catch {
      setImporting(false);
      Alert.alert("Gagal Membaca File", "Tidak dapat membaca file. Pastikan format JSON valid.");
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreviewPack) return;
    setImporting(true);
    try {
      const count = await importCourse(importPreviewPack);
      const paths = await getLearningPaths();
      setPathCount(paths.length);
      setShowImportPreview(false);
      setImportPreviewPack(null);
      Alert.alert(
        "🎉 Import Berhasil!",
        `${count} item berhasil diimport!\n\nKursus, modul, pelajaran, flashcard, dan quiz kini tersedia di akunmu. Selamat belajar!`,
        [{ text: "Mulai Belajar", style: "default" }]
      );
    } catch {
      Alert.alert("Import Gagal", "Terjadi kesalahan saat mengimport. Coba lagi.");
    } finally {
      setImporting(false);
    }
  };

  const accuracy = stats && stats.totalAnswers > 0
    ? Math.round((stats.correctAnswers / stats.totalAnswers) * 100) : 0;
  const wrong = (stats?.totalAnswers ?? 0) - (stats?.correctAnswers ?? 0);

  const MENU = [
    {
      icon: "user" as const, label: "Edit Profil",
      sub: "Ubah nama, foto, level & target belajar",
      color: colors.primary,
      onPress: () => router.push("/edit-profile"),
    },
    {
      icon: "key" as const, label: "AI Keys",
      sub: "Simpan API key OpenAI & Gemini untuk Ask Your AI",
      color: colors.success,
      onPress: () => router.push("/ai-keys"),
    },
    {
      icon: "package" as const, label: "Pack Manager",
      sub: "Kelola pack flashcard & quiz kamu",
      color: colors.purple,
      onPress: () => router.push("/pack-manager"),
    },
    {
      icon: "shield" as const, label: "Creator (Bundle Aman)",
      sub: "Generate creator key & buat bundle terenkripsi",
      color: colors.primary,
      onPress: () => router.push("/creator" as any),
    },
    {
      icon: "lock" as const, label: "Buka Bundle Terkunci",
      sub: "Verifikasi tanda tangan + dekripsi bundle",
      color: colors.teal,
      onPress: () => router.push("/bundle/open" as any),
    },
    {
      icon: "image" as const, label: "Image Manager",
      sub: "Lihat & hapus gambar tersimpan",
      color: colors.teal,
      onPress: () => router.push("/image-manager"),
    },
    {
      icon: "share-2" as const, label: t.profile.share_bundle,
      sub: t.profile.share_bundle_sub,
      color: colors.teal,
      onPress: () => setShowShareModal(true),
    },
    {
      icon: "download" as const, label: t.profile.import_bundle,
      sub: t.profile.import_bundle_sub,
      color: colors.primary,
      onPress: handleImportCourse,
    },
    {
      icon: "hard-drive" as const, label: "Backup & Pulih",
      sub: "Simpan / pulihkan semua data + media (offline)",
      color: colors.teal,
      onPress: () => router.push("/backup" as any),
    },
    {
      icon: "share-2" as const, label: t.profile.share_progress,
      sub: t.profile.share_progress_sub,
      color: colors.amber,
      onPress: async () => {
        try {
          await Share.share({ message: `Akurasi saya ${accuracy}% dengan ${stats?.totalAnswers ?? 0} jawaban di Mobile Learning! 🎓` });
        } catch (e) {
          if (!isCancellationError(e)) console.warn("[profile] share error", e);
        }
      },
    },
    {
      icon: "star" as const, label: "Tantangan Harian",
      sub: "Coba soal challenge hari ini",
      color: colors.warning,
      onPress: () => router.push("/daily-challenge"),
    },
    {
      icon: "clock" as const, label: "Timer Pomodoro",
      sub: "Sesi belajar terstruktur 25/5 menit",
      color: colors.danger,
      onPress: () => router.push("/pomodoro"),
    },
    {
      icon: "bookmark" as const, label: "Soal Tersimpan",
      sub: "Review flashcard & quiz yang di-bookmark",
      color: colors.purple,
      onPress: () => router.push("/bookmarks"),
    },
    {
      icon: "list" as const, label: "Riwayat Sesi",
      sub: "Lihat semua sesi belajar yang lalu",
      color: colors.teal,
      onPress: () => router.push("/session-history"),
    },
    {
      icon: "droplet" as const, label: "Tema",
      sub: "Pilih palet warna & mode terang/gelap",
      color: colors.dark,
      onPress: () => router.push("/theme-settings" as any),
    },
    {
      icon: "refresh-cw" as const, label: t.profile.reset_profile,
      sub: t.profile.reset_profile_sub,
      color: colors.amber,
      onPress: () => Alert.alert(t.profile.reset_profile, "Reset profil pengguna?", [
        { text: t.common.cancel, style: "cancel" },
        { text: "Reset", onPress: async () => { const AS = (await import("@react-native-async-storage/async-storage")).default; await AS.removeItem("user"); router.replace("/onboarding"); } },
      ]),
    },
    {
      icon: "tool" as const, label: "Perbaiki Penyimpanan",
      sub: "Pindai & susun ulang index flashcard jika ada crash sebelumnya",
      color: colors.teal,
      onPress: () => Alert.alert(
        "Perbaiki Penyimpanan Flashcard",
        "Akan memindai semua kartu, menyusun ulang index, dan mencoba memperbaiki sisa data lama dari sebelum pembaruan. Aman — tidak menghapus kartu apa pun.",
        [
          { text: t.common.cancel, style: "cancel" },
          {
            text: "Mulai", onPress: async () => {
              try {
                const r = await repairFlashcardStorage();
                const lines: string[] = [
                  `${r.lessonsScanned} pelajaran dipindai`,
                  `${r.totalCards} kartu ditemukan`,
                ];
                if (r.legacyBlobMigrated) lines.push("Data lama berhasil dipisah ke per-pelajaran");
                if (r.legacyBlobUnreadable) lines.push("⚠ Data lama belum bisa dibaca di perangkat ini");
                if (r.reindexedLessons > 0) lines.push(`${r.reindexedLessons} pelajaran ditambahkan ke index`);
                if (r.removedStaleIndexEntries > 0) lines.push(`${r.removedStaleIndexEntries} entri index basi dihapus`);
                if (r.corruptedLessons.length > 0) lines.push(`⚠ ${r.corruptedLessons.length} pelajaran rusak (tidak terbaca)`);
                Alert.alert("Selesai", lines.join("\n"));
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                Alert.alert("Gagal memperbaiki", msg);
              }
            },
          },
        ],
      ),
    },
    {
      icon: "trash-2" as const, label: t.profile.delete_all,
      sub: t.profile.delete_all_sub,
      color: colors.danger,
      onPress: () => Alert.alert(t.profile.delete_all, "Semua data akan dihapus permanen.", [
        { text: t.common.cancel, style: "cancel" },
        { text: t.common.delete, style: "destructive", onPress: async () => { await clearAllData(); router.replace("/onboarding"); } },
      ]),
    },
  ];

  const initial = (user?.name ?? "L").charAt(0).toUpperCase();

  return (
    <View style={{ flex: 1 }}>
    <ScrollView
      style={styles.root}
      contentContainerStyle={isTablet ? { maxWidth: 860, alignSelf: "center", width: "100%" } : undefined}
      showsVerticalScrollIndicator={false}
    >
      {/* ── HEADER ── */}
      <LinearGradient
        colors={[colors.primary, colors.purple]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: Platform.OS === "web" ? 56 : insets.top + 16 }]}
      >
        <View style={styles.blob1} /><View style={styles.blob2} />

        {/* Avatar + name */}
        <View style={styles.heroRow}>
          <TouchableOpacity style={styles.avatar} onPress={() => router.push("/edit-profile")} activeOpacity={0.85}>
            {user?.avatar ? (
              <Image source={{ uri: resolveAssetUri(user.avatar) }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{initial}</Text>
            )}
            <View style={styles.avatarEditBadge}>
              <Feather name="camera" size={9} color="#fff" />
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name ?? "Learner"}</Text>
            <View style={styles.badges}>
              <View style={styles.badge}>
                <Feather name="award" size={10} color="rgba(255,255,255,0.9)" />
                <Text style={styles.badgeText}>{user?.level ?? "beginner"}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: "rgba(10,211,193,0.3)" }]}>
                <Feather name="book" size={10} color="rgba(255,255,255,0.9)" />
                <Text style={styles.badgeText}>{user?.topic ?? "Umum"}</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={() => router.push("/edit-profile")}>
            <Feather name="edit-2" size={16} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>

        {/* Stats bar */}
        <View style={styles.statsBar}>
          {[
            { val: pathCount, lbl: t.common.courses, icon: "book-open" as const },
            { val: stats?.totalAnswers ?? 0, lbl: t.profile.total_answers, icon: "message-circle" as const },
            { val: `${accuracy}%`, lbl: t.profile.accuracy, icon: "target" as const },
            { val: stats?.streak ?? 0, lbl: "Streak", icon: "activity" as const },
          ].map((s, i) => (
            <View key={i} style={[styles.statItem, i < 3 && styles.statBorder]}>
              <Text style={styles.statVal}>{s.val}</Text>
              <Text style={styles.statLbl}>{s.lbl}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <View style={styles.body}>
        {showBackupReminder && (
          <View style={styles.backupBanner}>
            <View style={styles.backupBannerIcon}>
              <Feather name="hard-drive" size={18} color={colors.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.backupBannerTitle}>
                {daysSinceBackup === null
                  ? "Belum ada backup"
                  : `Backup terakhir ${daysSinceBackup} hari lalu`}
              </Text>
              <Text style={styles.backupBannerSub}>
                Simpan datamu agar aman jika ganti HP atau hapus aplikasi.
              </Text>
              <View style={styles.backupBannerBtns}>
                <TouchableOpacity
                  style={styles.backupBannerCta}
                  onPress={() => router.push("/backup" as any)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.backupBannerCtaText}>Backup sekarang</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.backupBannerSnooze}
                  onPress={async () => {
                    await snoozeBackupReminder(3);
                    setShowBackupReminder(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.backupBannerSnoozeText}>Nanti saja</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        {/* Goal */}
        {user?.goal && (
          <View style={[styles.goalCard, shadowSm]}>
            <LinearGradient colors={[colors.primary, colors.purple]} style={styles.goalIconWrap}>
              <Feather name="target" size={18} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.goalLabel}>Target Belajar</Text>
              <Text style={styles.goalText} numberOfLines={2}>{user.goal}</Text>
            </View>
          </View>
        )}

        {/* Progress summary */}
        <View style={[styles.progressCard, shadowSm]}>
          <Text style={styles.cardSectionLabel}>Ringkasan Progress</Text>
          <View style={styles.progressRow}>
            {[
              { val: stats?.correctAnswers ?? 0, lbl: t.profile.correct, color: colors.teal },
              { val: wrong, lbl: t.profile.wrong, color: colors.danger },
              { val: `${accuracy}%`, lbl: t.profile.accuracy, color: colors.primary },
            ].map((p, i) => (
              <View key={i} style={[styles.progressChip, { backgroundColor: p.color + "15" }]}>
                <Text style={[styles.progressChipVal, { color: p.color }]}>{p.val}</Text>
                <Text style={[styles.progressChipLbl, { color: p.color }]}>{p.lbl}</Text>
              </View>
            ))}
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, {
              width: `${accuracy}%` as any,
              backgroundColor: accuracy >= 70 ? colors.teal : accuracy >= 40 ? colors.amber : colors.danger,
            }]} />
          </View>
          <Text style={styles.barSub}>{stats?.totalAnswers ?? 0} total jawaban</Text>
        </View>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <TouchableOpacity
            style={[styles.quickCard, { backgroundColor: colors.primaryLight }, shadowSm]}
            onPress={() => router.push("/(tabs)/progress")}
          >
            <Feather name="bar-chart-2" size={20} color={colors.primary} />
            <Text style={[styles.quickLbl, { color: colors.primary }]}>Progress{"\n"}Detail</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickCard, { backgroundColor: colors.amberLight }, shadowSm]}
            onPress={() => router.push("/(tabs)/practice")}
          >
            <Feather name="zap" size={20} color={colors.amber} />
            <Text style={[styles.quickLbl, { color: colors.amber }]}>Mulai{"\n"}Latihan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickCard, { backgroundColor: colors.tealLight }, shadowSm]}
            onPress={() => router.push("/(tabs)/learn")}
          >
            <Feather name="book-open" size={20} color={colors.teal} />
            <Text style={[styles.quickLbl, { color: colors.teal }]}>Semua{"\n"}Kursus</Text>
          </TouchableOpacity>
        </View>

        {/* Bahasa / Language toggle */}
        <Text style={styles.menuLabel}>{t.profile.section_language}</Text>
        <View style={[styles.menuCard, shadowSm, { marginBottom: 4 }]}>
          <View style={{ flexDirection: "row", padding: 4, gap: 8 }}>
            {(["id", "en"] as const).map((lang) => {
              const active = language === lang;
              const label = lang === "id" ? `🇮🇩  ${t.profile.lang_id}` : `🇬🇧  ${t.profile.lang_en}`;
              return (
                <TouchableOpacity
                  key={lang}
                  onPress={() => setLanguage(lang)}
                  style={{
                    flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: "center",
                    backgroundColor: active ? colors.primary : colors.background,
                  }}
                >
                  <Text style={{
                    fontSize: 14, fontWeight: "800",
                    color: active ? "#fff" : colors.textMuted,
                  }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Dark Mode */}
        <Text style={styles.menuLabel}>Tampilan</Text>
        <View style={[styles.menuCard, shadowSm, { marginBottom: 4 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", padding: 16, gap: 14 }}>
            <View style={[styles.menuIconWrap, { backgroundColor: isDark ? colors.darkMed : colors.background }]}>
              <Feather name={isDark ? "moon" : "sun"} size={18} color={isDark ? colors.teal : colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuTitle]}>Dark Mode</Text>
              <Text style={styles.menuSub}>{isDark ? "Mode gelap aktif" : "Mode terang aktif"}</Text>
            </View>
            <Switch value={isDark} onValueChange={toggleDark} trackColor={{ true: colors.primary, false: colors.border }} thumbColor={colors.white} />
          </View>
        </View>

        {/* Pengingat Belajar */}
        <Text style={styles.menuLabel}>{t.profile.section_reminder}</Text>
        <View style={[styles.reminderCard, shadowSm]}>
          <View style={styles.reminderRow}>
            <View style={[styles.menuIconWrap, { backgroundColor: colors.primaryLight }]}>
              <Feather name="bell" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>{t.profile.reminder_toggle}</Text>
              <Text style={styles.menuSub}>
                {reminder.enabled
                  ? `Notifikasi setiap hari pukul ${String(reminder.hour).padStart(2, "0")}:${String(reminder.minute).padStart(2, "0")}`
                  : "Pengingat belajar harian dimatikan"}
              </Text>
            </View>
            <Switch
              value={reminder.enabled}
              onValueChange={handleToggleReminder}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={reminder.enabled ? colors.primary : colors.textMuted}
            />
          </View>

          {reminder.enabled && (
            <>
              <View style={styles.reminderDivider} />
              <View style={styles.timePickerRow}>
                <Text style={styles.timePickerLabel}>Jam Pengingat</Text>
                <View style={styles.timePicker}>
                  <TouchableOpacity style={styles.timeArrow} onPress={() => cycleHour(-1)}>
                    <Feather name="chevron-left" size={18} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.timeVal}>{String(reminder.hour).padStart(2, "0")}</Text>
                  <Text style={styles.timeSep}>:</Text>
                  <Text style={styles.timeVal}>{String(reminder.minute).padStart(2, "0")}</Text>
                  <TouchableOpacity style={styles.timeArrow} onPress={() => cycleHour(1)}>
                    <Feather name="chevron-right" size={18} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.minuteRow}>
                  {[0, 15, 30, 45].map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.minuteChip, reminder.minute === m && styles.minuteChipActive]}
                      onPress={() => cycleMinute(([0, 15, 30, 45].indexOf(m) - [0, 15, 30, 45].indexOf(reminder.minute)) as 1 | -1)}
                    >
                      <Text style={[styles.minuteChipText, reminder.minute === m && styles.minuteChipTextActive]}>
                        :{String(m).padStart(2, "0")}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={[styles.reminderHint, { backgroundColor: colors.primaryLight }]}>
                <Feather name="info" size={12} color={colors.primary} />
                <Text style={[styles.reminderHintText, { color: colors.primary }]}>
                  Notifikasi motivasi harian juga aktif setiap jam 08:00
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Settings menu */}
        <Text style={styles.menuLabel}>{t.profile.section_menu}</Text>
        {importing && (
          <View style={styles.importingBanner}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.importingText}>Mengimport kursus...</Text>
          </View>
        )}
        <View style={[styles.menuCard, shadowSm]}>
          {MENU.map((item, i) => (
            <React.Fragment key={item.label}>
              <TouchableOpacity onPress={item.onPress} style={styles.menuItem} activeOpacity={0.7}>
                <View style={[styles.menuIconWrap, { backgroundColor: item.color + "18" }]}>
                  <Feather name={item.icon} size={18} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuTitle, item.color === colors.danger && { color: colors.danger }]}>
                    {item.label}
                  </Text>
                  <Text style={styles.menuSub}>{item.sub}</Text>
                </View>
                <Feather name="chevron-right" size={15} color={colors.textMuted} />
              </TouchableOpacity>
              {i < MENU.length - 1 && <View style={styles.menuDivider} />}
            </React.Fragment>
          ))}
        </View>

        <Text style={styles.footer}>Mobile Learning · v1.0</Text>
        <Text style={styles.footerCredit}>Developed by rizkinabawi</Text>
      </View>
    </ScrollView>

    {/* ── SHARE BUNDLE MODAL ── */}
    <CourseBundleShareModal
      visible={showShareModal}
      onClose={() => setShowShareModal(false)}
    />

    {/* ── IMPORT PREVIEW MODAL ── */}
    <CourseImportPreviewModal
      visible={showImportPreview}
      pack={importPreviewPack}
      importing={importing}
      onConfirm={handleConfirmImport}
      onCancel={() => { setShowImportPreview(false); setImportPreviewPack(null); }}
    />

    {/* ── BUNDLE ACTIVATION MODAL (signed bundles) ── */}
    <BundleActivationModal
      visible={showActivationModal}
      bundle={
        pendingSignedBundle && pendingSignedBundle.bundleId && pendingSignedBundle.creator && pendingSignedBundle.contentHash
          ? {
              bundleId: pendingSignedBundle.bundleId,
              creator: pendingSignedBundle.creator,
              contentHash: pendingSignedBundle.contentHash,
            }
          : null
      }
      onUnlock={async () => {
        const pack = pendingSignedBundle;
        setShowActivationModal(false);
        setPendingSignedBundle(null);
        if (pack) await proceedToPreview(pack);
      }}
      onCancel={() => {
        setShowActivationModal(false);
        setPendingSignedBundle(null);
      }}
    />
    </View>
  );
}

const makeStyles = (c: ColorScheme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  header: { paddingHorizontal: 20, paddingBottom: 0, overflow: "hidden" },
  blob1: { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(255,255,255,0.08)", top: -50, right: -50 },
  blob2: { position: "absolute", width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(255,255,255,0.06)", bottom: 20, left: 20 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 22 },
  avatar: { width: 68, height: 68, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.35)", overflow: "hidden", position: "relative" },
  avatarImg: { width: 68, height: 68, borderRadius: 20 },
  avatarText: { fontSize: 28, fontWeight: "900", color: "#fff" },
  avatarEditBadge: {
    position: "absolute", bottom: 2, right: 2,
    width: 18, height: 18, borderRadius: 6,
    backgroundColor: "rgba(76,111,255,0.9)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.6)",
  },
  name: { fontSize: 22, fontWeight: "900", color: "#fff", marginBottom: 8 },
  badges: { flexDirection: "row", gap: 8 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(76,111,255,0.35)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#fff", textTransform: "capitalize" },
  editBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  statsBar: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.15)" },
  statItem: { flex: 1, paddingVertical: 16, alignItems: "center" },
  statBorder: { borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.12)" },
  statVal: { fontSize: 18, fontWeight: "900", color: "#fff" },
  statLbl: { fontSize: 9, color: "rgba(255,255,255,0.5)", fontWeight: "700", textTransform: "uppercase", marginTop: 2 },
  body: { padding: 16, gap: 12, paddingBottom: 40 },
  backupBanner: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: c.tealLight,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: c.border,
  },
  backupBannerIcon: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: c.white,
    alignItems: "center", justifyContent: "center",
  },
  backupBannerTitle: { fontSize: 14, fontWeight: "800", color: c.dark },
  backupBannerSub: { fontSize: 12, color: c.textSecondary, marginTop: 2, lineHeight: 17 },
  backupBannerBtns: { flexDirection: "row", gap: 10, marginTop: 10 },
  backupBannerCta: {
    backgroundColor: c.teal,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999,
  },
  backupBannerCtaText: { color: c.white, fontWeight: "800", fontSize: 12 },
  backupBannerSnooze: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999,
  },
  backupBannerSnoozeText: { color: c.textSecondary, fontWeight: "700", fontSize: 12 },
  goalCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: c.white, borderRadius: 20, padding: 16 },
  goalIconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  goalLabel: { fontSize: 10, fontWeight: "800", color: c.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  goalText: { fontSize: 14, fontWeight: "700", color: c.dark, lineHeight: 20 },
  progressCard: { backgroundColor: c.white, borderRadius: 20, padding: 18, gap: 12 },
  cardSectionLabel: { fontSize: 11, fontWeight: "800", color: c.textMuted, textTransform: "uppercase", letterSpacing: 1 },
  progressRow: { flexDirection: "row", gap: 8 },
  progressChip: { flex: 1, borderRadius: 14, padding: 12, alignItems: "center", gap: 3 },
  progressChipVal: { fontSize: 20, fontWeight: "900" },
  progressChipLbl: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  barTrack: { height: 7, backgroundColor: c.border, borderRadius: 999, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 999 },
  barSub: { fontSize: 12, color: c.textMuted, fontWeight: "600" },
  quickRow: { flexDirection: "row", gap: 10 },
  quickCard: { flex: 1, borderRadius: 18, padding: 14, alignItems: "center", gap: 8 },
  quickLbl: { fontSize: 12, fontWeight: "800", textAlign: "center", lineHeight: 17 },
  menuLabel: { fontSize: 11, fontWeight: "800", color: c.textMuted, textTransform: "uppercase", letterSpacing: 1 },
  menuCard: { backgroundColor: c.white, borderRadius: 20, overflow: "hidden" },
  menuItem: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14 },
  menuIconWrap: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  menuTitle: { fontSize: 14, fontWeight: "800", color: c.dark },
  menuSub: { fontSize: 11, color: c.textMuted, fontWeight: "500", marginTop: 2 },
  menuDivider: { height: 1, backgroundColor: c.borderLight, marginHorizontal: 16 },
  footer: { textAlign: "center", fontSize: 11, color: c.textMuted, fontWeight: "600", paddingTop: 8, paddingBottom: 2 },
  footerCredit: { textAlign: "center", fontSize: 11, color: c.textMuted, fontWeight: "700", paddingBottom: 12, opacity: 0.8 },
  importingBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: c.primaryLight, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  importingText: { fontSize: 14, fontWeight: "700", color: c.primary },

  // Reminder
  reminderCard: {
    backgroundColor: c.white, borderRadius: 20, overflow: "hidden",
    paddingTop: 4, paddingBottom: 4,
  },
  reminderRow: {
    flexDirection: "row", alignItems: "center", padding: 16, gap: 14,
  },
  reminderDivider: { height: 1, backgroundColor: c.borderLight, marginHorizontal: 16 },
  timePickerRow: { padding: 16, gap: 12 },
  timePickerLabel: {
    fontSize: 11, fontWeight: "800", color: c.textMuted,
    textTransform: "uppercase", letterSpacing: 1,
  },
  timePicker: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: c.background, borderRadius: 16, padding: 14,
  },
  timeVal: { fontSize: 32, fontWeight: "900", color: c.dark, minWidth: 52, textAlign: "center" },
  timeSep: { fontSize: 28, fontWeight: "900", color: c.textMuted },
  timeArrow: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: c.white, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: c.border,
  },
  minuteRow: { flexDirection: "row", gap: 8 },
  minuteChip: {
    flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: "center",
    borderWidth: 1.5, borderColor: c.border, backgroundColor: c.white,
  },
  minuteChipActive: { backgroundColor: c.primary, borderColor: c.primary },
  minuteChipText: { fontSize: 13, fontWeight: "700", color: c.textMuted },
  minuteChipTextActive: { color: c.white },
  reminderHint: {
    flexDirection: "row", alignItems: "center", gap: 6,
    margin: 12, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  reminderHintText: { fontSize: 12, fontWeight: "600", flex: 1, lineHeight: 17 },
});
