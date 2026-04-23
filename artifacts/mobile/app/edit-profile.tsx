import React, { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Platform, Alert, Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "@/utils/fs-compat";
import { getUser, saveUser, type User } from "@/utils/storage";
import Colors from "@/constants/colors";
import { toast } from "@/components/Toast";

const AVATAR_DIR = ((FileSystem as any).documentDirectory ?? "") + "avatars/";

const ensureAvatarDir = async () => {
  if (Platform.OS === "web") return;
  const info = await FileSystem.getInfoAsync(AVATAR_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(AVATAR_DIR, { intermediates: true });
};

const LEVELS = [
  { key: "beginner" as const, label: "Pemula", emoji: "🌱", color: Colors.teal },
  { key: "intermediate" as const, label: "Menengah", emoji: "⚡", color: Colors.amber },
  { key: "advanced" as const, label: "Mahir", emoji: "🔥", color: Colors.danger },
];

export default function EditProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<User["level"]>("beginner");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const u = await getUser();
      if (u) {
        setUser(u);
        setName(u.name ?? "");
        setGoal(u.goal ?? "");
        setTopic(u.topic ?? "");
        setLevel(u.level ?? "beginner");
        setAvatarUri(u.avatar ?? null);
      }
    })();
  }, []);

  const pickAvatar = async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Izin Diperlukan", "Izinkan akses galeri untuk ganti foto profil.");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Nama Kosong", "Nama tidak boleh kosong.");
      return;
    }
    if (!user) return;
    setSaving(true);
    let finalAvatar = avatarUri;
    if (avatarUri && avatarUri !== user.avatar && Platform.OS !== "web") {
      try {
        await ensureAvatarDir();
        const ext = avatarUri.split(".").pop()?.split("?")[0] ?? "jpg";
        const dest = AVATAR_DIR + user.id + "." + ext;
        await FileSystem.copyAsync({ from: avatarUri, to: dest });
        finalAvatar = dest;
      } catch {
        finalAvatar = avatarUri;
      }
    }
    const updated: User = {
      ...user,
      name: name.trim(),
      goal: goal.trim(),
      topic: topic.trim(),
      level,
      avatar: finalAvatar ?? undefined,
    };
    await saveUser(updated);
    setSaving(false);
    toast.success("Profil diperbarui!");
    router.back();
  };

  const initial = (name || "L").charAt(0).toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 24 }}
      >
        {/* Header */}
        <LinearGradient
          colors={["#4C6FFF", "#7C47FF"]}
          style={[styles.header, { paddingTop: Platform.OS === "web" ? 60 : insets.top + 16 }]}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profil</Text>

          {/* Avatar picker */}
          <TouchableOpacity style={styles.avatarWrap} onPress={pickAvatar} activeOpacity={0.85}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
            ) : (
              <LinearGradient colors={["#7C47FF", "#4C6FFF"]} style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </LinearGradient>
            )}
            <View style={styles.avatarBadge}>
              <Feather name="camera" size={12} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={styles.changePhotoHint}>Tap untuk ganti foto</Text>
        </LinearGradient>

        <View style={styles.body}>
          {/* Name */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Nama</Text>
            <View style={styles.inputWrap}>
              <Feather name="user" size={16} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Nama kamu"
                style={styles.input}
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
              />
            </View>
          </View>

          {/* Topic */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Topik Belajar</Text>
            <View style={styles.inputWrap}>
              <Feather name="book-open" size={16} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput
                value={topic}
                onChangeText={setTopic}
                placeholder="Contoh: React Native, Matematika"
                style={styles.input}
                placeholderTextColor={Colors.textMuted}
              />
            </View>
          </View>

          {/* Goal */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Target Belajar</Text>
            <View style={[styles.inputWrap, { alignItems: "flex-start" }]}>
              <Feather name="target" size={16} color={Colors.textMuted} style={[styles.inputIcon, { marginTop: 14 }]} />
              <TextInput
                value={goal}
                onChangeText={setGoal}
                placeholder="Apa yang ingin kamu capai?"
                style={[styles.input, { minHeight: 90, textAlignVertical: "top", paddingTop: 12 }]}
                placeholderTextColor={Colors.textMuted}
                multiline
              />
            </View>
          </View>

          {/* Level */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Level</Text>
            <View style={styles.levelRow}>
              {LEVELS.map((l) => {
                const active = level === l.key;
                return (
                  <TouchableOpacity
                    key={l.key}
                    style={[styles.levelCard, active && { borderColor: l.color, backgroundColor: l.color + "12" }]}
                    onPress={() => setLevel(l.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.levelEmoji}>{l.emoji}</Text>
                    <Text style={[styles.levelLabel, active && { color: l.color, fontWeight: "900" }]}>{l.label}</Text>
                    {active && (
                      <View style={[styles.levelCheck, { backgroundColor: l.color }]}>
                        <Feather name="check" size={9} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Save */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            <LinearGradient colors={["#4C6FFF", "#7C47FF"]} style={styles.saveBtnGrad}>
              <Feather name="check" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>{saving ? "Menyimpan..." : "Simpan Perubahan"}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  backBtn: {
    position: "absolute",
    top: Platform.OS === "web" ? 60 : 52,
    left: 20,
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 24,
  },
  avatarWrap: {
    width: 96,
    height: 96,
    borderRadius: 32,
    marginBottom: 10,
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  avatarImg: {
    width: 96,
    height: 96,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.4)",
  },
  avatarFallback: {
    width: 96,
    height: 96,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.3)",
  },
  avatarInitial: {
    fontSize: 40,
    fontWeight: "900",
    color: "#fff",
  },
  avatarBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  changePhotoHint: {
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
    fontWeight: "600",
  },
  body: { padding: 20, gap: 16 },
  field: { gap: 8 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    gap: 10,
  },
  inputIcon: { flexShrink: 0 },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark,
    paddingVertical: 13,
  },
  levelRow: { flexDirection: "row", gap: 10 },
  levelCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    alignItems: "center",
    paddingVertical: 14,
    gap: 6,
    position: "relative",
  },
  levelEmoji: { fontSize: 22 },
  levelLabel: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary },
  levelCheck: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtn: { marginTop: 8 },
  saveBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 18,
    paddingVertical: 15,
  },
  saveBtnText: { fontSize: 16, fontWeight: "900", color: "#fff" },
});
