import { useColors, useTheme } from "@/contexts/ThemeContext";
import React, { useCallback, useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import {
  getApiKeys,
  saveApiKey,
  updateModel,
  deleteApiKey,
  maskKey,
  PROVIDER_META,
  PROVIDER_MODELS,
  type AIKey,
  type AIProvider,
} from "@/utils/ai-keys";
import { type ColorScheme } from "@/constants/colors";
import { toast } from "@/components/Toast";

const PROVIDERS: AIProvider[] = ["openai", "gemini"];

export default function AIKeysScreen() {
  const { isDark, palette } = useTheme();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);

  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [keys, setKeys] = useState<AIKey[]>([]);
  const [saving, setSaving] = useState(false);
  const [inputs, setInputs] = useState<Record<AIProvider, string>>({
    openai: "",
    gemini: "",
  });
  const [selectedModel, setSelectedModel] = useState<Record<AIProvider, string>>({
    openai: "gpt-4o-mini",
    gemini: "gemini-2.0-flash",
  });
  const [showInput, setShowInput] = useState<Record<AIProvider, boolean>>({
    openai: false,
    gemini: false,
  });
  const [reveal, setReveal] = useState<Record<string, boolean>>({});

  useFocusEffect(
    useCallback(() => {
      getApiKeys().then((loaded) => {
        setKeys(loaded);
        const modelMap: Record<AIProvider, string> = {
          openai: "gpt-4o-mini",
          gemini: "gemini-2.0-flash",
        };
        loaded.forEach((k) => {
          modelMap[k.provider] = k.model;
        });
        setSelectedModel(modelMap);
      });
    }, [])
  );

  const handleModelChange = async (provider: AIProvider, model: string) => {
    setSelectedModel((p) => ({ ...p, [provider]: model }));
    const existing = keys.find((k) => k.provider === provider);
    if (existing) {
      try {
        await updateModel(provider, model);
        setKeys((prev) =>
          prev.map((k) => (k.provider === provider ? { ...k, model } : k))
        );
        toast.success("Model diperbarui!");
      } catch {
        toast.error("Gagal memperbarui model.");
      }
    }
  };

  const handleSave = async (provider: AIProvider) => {
    const raw = inputs[provider].trim();
    if (!raw) {
      toast.error("Masukkan API key terlebih dahulu");
      return;
    }
    if (provider === "openai" && !raw.startsWith("sk-")) {
      Alert.alert(
        "Format Key",
        "OpenAI API key biasanya dimulai dengan 'sk-'. Tetap simpan?",
        [
          { text: "Batal", style: "cancel" },
          { text: "Simpan", onPress: () => doSave(provider, raw) },
        ]
      );
      return;
    }
    await doSave(provider, raw);
  };

  const doSave = async (provider: AIProvider, raw: string) => {
    setSaving(true);
    try {
      await saveApiKey({ provider, apiKey: raw, model: selectedModel[provider] });
      const updated = await getApiKeys();
      setKeys(updated);
      setInputs((p) => ({ ...p, [provider]: "" }));
      setShowInput((p) => ({ ...p, [provider]: false }));
      toast.success(`${PROVIDER_META[provider].label} key disimpan!`);
    } catch (e: any) {
      toast.error("Gagal menyimpan: " + (e?.message ?? ""));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (key: AIKey) => {
    Alert.alert(
      "Hapus API Key",
      `Hapus key ${PROVIDER_META[key.provider].label}?\nData yang tersimpan aman.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            await deleteApiKey(key.id);
            setKeys((prev) => prev.filter((k) => k.id !== key.id));
            toast.success("Key dihapus.");
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── HEADER ── */}
        <LinearGradient
          colors={[colors.primary, colors.purple]}
          style={[
            styles.header,
            { paddingTop: Platform.OS === "web" ? 60 : insets.top + 16 },
          ]}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerIcon}>
            <Feather name="key" size={20} color="#fff" />
          </View>
          <Text style={styles.headerTitle}>AI Keys</Text>
          <Text style={styles.headerSub}>
            Simpan API key OpenAI &amp; Gemini untuk generate konten langsung dari app
          </Text>
        </LinearGradient>

        {/* ── SECURITY NOTICE ── */}
        <View style={styles.securityCard}>
          <Feather name="shield" size={16} color={colors.success} />
          <Text style={styles.securityText}>
            API key dienkripsi dengan{" "}
            {Platform.OS === "ios" ? "iOS Keychain (AES-256)" : "Android Keystore (AES-256)"}
            {" "}dan hanya dapat diakses saat perangkat terbuka.
          </Text>
        </View>

        {/* ── PROVIDER CARDS ── */}
        <View style={styles.body}>
          {PROVIDERS.map((prov) => {
            const meta = PROVIDER_META[prov];
            const existing = keys.find((k) => k.provider === prov) ?? null;
            const inputOpen = showInput[prov];
            const models = PROVIDER_MODELS[prov];
            const activeModel = selectedModel[prov];

            return (
              <View key={prov} style={styles.card}>
                {/* Card Header */}
                <View style={styles.cardRow}>
                  <View style={[styles.provIcon, { backgroundColor: meta.bg }]}>
                    <Text style={{ fontSize: 20 }}>
                      {prov === "openai" ? "⚡" : "✨"}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{meta.label}</Text>
                    <Text style={styles.cardModel}>Model aktif: {activeModel}</Text>
                  </View>
                  {existing ? (
                    <View style={[styles.badge, { backgroundColor: colors.successLight }]}>
                      <Feather name="check" size={11} color={colors.success} />
                      <Text style={[styles.badgeText, { color: colors.success }]}>Aktif</Text>
                    </View>
                  ) : (
                    <View style={[styles.badge, { backgroundColor: colors.background }]}>
                      <Feather name="minus-circle" size={11} color={colors.textMuted} />
                      <Text style={[styles.badgeText, { color: colors.textMuted }]}>Belum ada</Text>
                    </View>
                  )}
                </View>

                {/* ── MODEL SELECTOR ── */}
                <View style={styles.modelSection}>
                  <Text style={styles.modelSectionLabel}>Pilih Model:</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.modelChips}
                    keyboardShouldPersistTaps="handled"
                  >
                    {models.map((m) => {
                      const isActive = activeModel === m.id;
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[
                            styles.modelChip,
                            isActive && { backgroundColor: meta.color, borderColor: meta.color },
                          ]}
                          onPress={() => handleModelChange(prov, m.id)}
                          activeOpacity={0.8}
                        >
                          {isActive && (
                            <Feather name="check" size={10} color="#fff" />
                          )}
                          <Text style={[styles.modelChipText, isActive && styles.modelChipTextActive]}>
                            {m.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  {/* Model description */}
                  {(() => {
                    const desc = models.find((m) => m.id === activeModel)?.desc;
                    return desc ? (
                      <Text style={[styles.modelDesc, { color: meta.color }]}>{desc}</Text>
                    ) : null;
                  })()}
                </View>

                {/* Existing Key Display */}
                {existing && (
                  <View style={styles.existingRow}>
                    <View style={styles.maskedBox}>
                      <Feather name="lock" size={13} color={colors.textMuted} />
                      <Text style={styles.maskedText}>
                        {reveal[existing.id]
                          ? existing.apiKey
                          : maskKey(existing.apiKey)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() =>
                        setReveal((p) => ({ ...p, [existing.id]: !p[existing.id] }))
                      }
                      style={styles.iconBtn}
                    >
                      <Feather
                        name={reveal[existing.id] ? "eye-off" : "eye"}
                        size={15}
                        color={colors.textMuted}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(existing)}
                      style={styles.iconBtn}
                    >
                      <Feather name="trash-2" size={15} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                )}

                {/* Input Toggle */}
                {!inputOpen ? (
                  <TouchableOpacity
                    style={[styles.toggleBtn, { borderColor: meta.color + "50" }]}
                    onPress={() =>
                      setShowInput((p) => ({ ...p, [prov]: true }))
                    }
                    activeOpacity={0.8}
                  >
                    <Feather
                      name={existing ? "refresh-cw" : "plus"}
                      size={14}
                      color={meta.color}
                    />
                    <Text style={[styles.toggleBtnText, { color: meta.color }]}>
                      {existing ? "Ganti API Key" : "Tambah API Key"}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.inputWrap}>
                    <TextInput
                      placeholder={
                        prov === "openai"
                          ? "sk-..."
                          : "AIza..."
                      }
                      value={inputs[prov]}
                      onChangeText={(v) =>
                        setInputs((p) => ({ ...p, [prov]: v }))
                      }
                      style={styles.input}
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry
                    />
                    <View style={styles.inputActions}>
                      <TouchableOpacity
                        style={styles.cancelBtn}
                        onPress={() => {
                          setShowInput((p) => ({ ...p, [prov]: false }));
                          setInputs((p) => ({ ...p, [prov]: "" }));
                        }}
                      >
                        <Text style={styles.cancelBtnText}>Batal</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.saveBtn,
                          { backgroundColor: meta.color },
                          saving && { opacity: 0.6 },
                        ]}
                        onPress={() => handleSave(prov)}
                        disabled={saving}
                      >
                        {saving ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.saveBtnText}>Simpan</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* ── HOW TO GET KEYS ── */}
        <View style={styles.helpCard}>
          <Text style={styles.helpTitle}>Cara Mendapatkan API Key</Text>
          <View style={styles.helpItem}>
            <Text style={[styles.helpLabel, { color: colors.success }]}>⚡ OpenAI</Text>
            <Text style={styles.helpDesc}>
              platform.openai.com → API Keys → Create new secret key
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.helpItem}>
            <Text style={[styles.helpLabel, { color: colors.primary }]}>✨ Gemini</Text>
            <Text style={styles.helpDesc}>
              aistudio.google.com → Get API key → Create API key
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ColorScheme, isDark: boolean, palette: string) => StyleSheet.create({
  header: {
    alignItems: "center",
    paddingBottom: 32,
    paddingHorizontal: 24,
    position: "relative",
  },
  backBtn: {
    position: "absolute",
    top: Platform.OS === "web" ? 60 : 52,
    left: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#fff",
    marginBottom: 6,
  },
  headerSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    lineHeight: 19,
    fontWeight: "500",
  },
  securityCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: c.successLight,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: c.success + "30",
  },
  securityText: {
    flex: 1,
    fontSize: 12,
    color: c.success,
    fontWeight: "600",
    lineHeight: 18,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: 18,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  provIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: c.text,
  },
  cardModel: {
    fontSize: 11,
    color: c.textMuted,
    fontWeight: "500",
    marginTop: 2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
  },

  // ── MODEL SELECTOR ──
  modelSection: {
    gap: 6,
  },
  modelSectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: c.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  modelChips: {
    gap: 6,
    flexDirection: "row",
  },
  modelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.background,
  },
  modelChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: c.text,
  },
  modelChipTextActive: {
    color: "#fff",
  },
  modelDesc: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },

  existingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  maskedBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  maskedText: {
    flex: 1,
    fontSize: 12,
    color: c.text,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  iconBtn: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: "transparent",
  },
  toggleBtnText: {
    fontSize: 13,
    fontWeight: "800",
  },
  inputWrap: {
    gap: 10,
  },
  input: {
    backgroundColor: c.background,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    fontWeight: "600",
    color: c.text,
    borderWidth: 1.5,
    borderColor: c.border,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  inputActions: {
    flexDirection: "row",
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.border,
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: c.textMuted,
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#fff",
  },
  helpCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: isDark ? c.surface : c.dark,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  helpTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#fff",
    marginBottom: 2,
  },
  helpItem: {
    gap: 3,
  },
  helpLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  helpDesc: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "500",
    lineHeight: 17,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
});
