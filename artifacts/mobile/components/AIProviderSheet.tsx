import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getApiKeys, PROVIDER_META, type AIKey, type AIProvider } from "@/utils/ai-keys";
import Colors from "@/constants/colors";

interface Props {
  visible: boolean;
  loading: boolean;
  onClose: () => void;
  onSelect: (provider: AIProvider, key: AIKey) => void;
}

export function AIProviderSheet({ visible, loading, onClose, onSelect }: Props) {
  const router = useRouter();
  const [keys, setKeys] = useState<AIKey[]>([]);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (visible) {
      setFetching(true);
      getApiKeys()
        .then(setKeys)
        .finally(() => setFetching(false));
    }
  }, [visible]);

  const providers: AIProvider[] = ["openai", "gemini"];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.handle} />

          <View style={s.header}>
            <Text style={s.title}>Pilih AI Provider</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Feather name="x" size={18} color={Colors.dark} />
            </TouchableOpacity>
          </View>

          {fetching ? (
            <View style={s.center}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : loading ? (
            <View style={s.center}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={s.loadingText}>Mengirim ke AI…</Text>
            </View>
          ) : (
            <>
              <Text style={s.hint}>
                {keys.length === 0
                  ? "Belum ada API key. Tambahkan dulu di Pengaturan AI Keys."
                  : "Pilih provider yang ingin digunakan untuk generate konten."}
              </Text>

              <View style={s.providerList}>
                {providers.map((prov) => {
                  const meta = PROVIDER_META[prov];
                  const key = keys.find((k) => k.provider === prov) ?? null;
                  const hasKey = !!key;

                  return (
                    <TouchableOpacity
                      key={prov}
                      style={[
                        s.providerCard,
                        { borderColor: hasKey ? meta.color + "50" : Colors.border },
                        !hasKey && s.providerCardDisabled,
                      ]}
                      activeOpacity={hasKey ? 0.75 : 1}
                      onPress={() => {
                        if (hasKey && key) onSelect(prov, key);
                      }}
                    >
                      <View style={[s.providerIcon, { backgroundColor: meta.bg }]}>
                        <Text style={[s.providerEmoji]}>
                          {prov === "openai" ? "⚡" : "✨"}
                        </Text>
                      </View>
                      <View style={s.providerInfo}>
                        <Text style={[s.providerLabel, !hasKey && s.textMuted]}>
                          {meta.label}
                        </Text>
                        <Text style={s.providerModel}>
                          {key?.model ?? meta.model}
                        </Text>
                        {hasKey ? (
                          <View style={[s.keyBadge, { backgroundColor: meta.bg }]}>
                            <Feather name="check" size={10} color={meta.color} />
                            <Text style={[s.keyBadgeText, { color: meta.color }]}>
                              Key tersimpan
                            </Text>
                          </View>
                        ) : (
                          <View style={s.noKeyBadge}>
                            <Feather name="lock" size={10} color={Colors.textMuted} />
                            <Text style={s.noKeyBadgeText}>Belum ada key</Text>
                          </View>
                        )}
                      </View>
                      {hasKey && (
                        <Feather name="chevron-right" size={18} color={meta.color} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={s.manageBtn}
                onPress={() => {
                  onClose();
                  router.push("/ai-keys" as any);
                }}
                activeOpacity={0.8}
              >
                <Feather name="key" size={14} color={Colors.primary} />
                <Text style={s.manageBtnText}>Kelola API Keys</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "transparent",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: "900",
    color: Colors.dark,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: "500",
    marginBottom: 16,
    lineHeight: 19,
  },
  center: {
    paddingVertical: 32,
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: "600",
  },
  providerList: {
    gap: 10,
    marginBottom: 16,
  },
  providerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: Colors.white,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  providerCardDisabled: {
    opacity: 0.5,
  },
  providerIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  providerEmoji: {
    fontSize: 22,
  },
  providerInfo: {
    flex: 1,
    gap: 2,
  },
  providerLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.dark,
  },
  providerModel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: "500",
  },
  keyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  keyBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  noKeyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: "flex-start",
    backgroundColor: Colors.background,
  },
  noKeyBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.textMuted,
  },
  textMuted: {
    color: Colors.textMuted,
  },
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  manageBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.primary,
  },
});
