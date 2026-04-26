import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { X, Volume2, Settings2, Check } from "lucide-react-native";
import { useColors, useTheme } from "@/contexts/ThemeContext";
import { getTTSConfig, saveTTSConfig, getAvailableVoices, stop, DEFAULT_TTS_CONFIG, type TTSConfig } from "@/utils/tts";
import * as Speech from "expo-speech";

interface TTSConfigModalProps {
  visible: boolean;
  onClose: () => void;
}

export const TTSConfigModal: React.FC<TTSConfigModalProps> = ({ visible, onClose }) => {
  const colors = useColors();
  const { isDark } = useTheme();
  const [config, setConfig] = useState<TTSConfig>(DEFAULT_TTS_CONFIG);
  const [voices, setVoices] = useState<Speech.Voice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible]);

  const loadData = async () => {
    setLoading(true);
    const [savedConfig, availableVoices] = await Promise.all([
      getTTSConfig(),
      getAvailableVoices(),
    ]);
    setConfig(savedConfig);
    setVoices(availableVoices);
    setLoading(false);
  };

  const handleSave = async (newConfig: TTSConfig) => {
    setConfig(newConfig);
    await saveTTSConfig(newConfig);
  };

  const testVoice = (voiceId?: string) => {
    stop();
    if (typeof Speech.speak === 'function') {
      Speech.speak("こんにちは、お元気ですか？ Ini adalah tes suara.", {
        voice: voiceId,
        rate: config?.rate ?? 0.9,
        pitch: config?.pitch ?? 1.0,
      });
    }
  };

  // We don't return null anymore as we have a default config

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Settings2 size={24} color={colors.primary} />
              <Text style={[styles.title, { color: colors.text }]}>Pengaturan TTS</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Speed Control */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Kecepatan (Rate)</Text>
              <View style={styles.buttonRow}>
                {[0.5, 0.7, 0.9, 1.0, 1.2].map((rate) => (
                  <TouchableOpacity
                    key={rate}
                    style={[
                      styles.rateBtn,
                      { backgroundColor: config.rate === rate ? colors.primary : colors.background },
                    ]}
                    onPress={() => handleSave({ ...config, rate })}
                  >
                    <Text style={[styles.rateText, { color: config.rate === rate ? "#fff" : colors.text }]}>
                      {rate}x
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Pitch Control */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Nada (Pitch)</Text>
              <View style={styles.buttonRow}>
                {[0.5, 0.8, 1.0, 1.2, 1.5].map((pitch) => (
                  <TouchableOpacity
                    key={pitch}
                    style={[
                      styles.rateBtn,
                      { backgroundColor: config.pitch === pitch ? colors.primary : colors.background },
                    ]}
                    onPress={() => handleSave({ ...config, pitch })}
                  >
                    <Text style={[styles.rateText, { color: config.pitch === pitch ? "#fff" : colors.text }]}>
                      {pitch}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Voice Selection */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Pilih Suara Utama (Male/Default)</Text>
              {loading ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                voices.filter(v => v.language.startsWith('ja') || v.language.startsWith('id')).map((v) => (
                  <TouchableOpacity
                    key={v.identifier}
                    style={[
                      styles.voiceItem,
                      { backgroundColor: config.voiceIdentifier === v.identifier ? colors.primary + "10" : colors.background },
                      config.voiceIdentifier === v.identifier && { borderColor: colors.primary, borderWidth: 1 }
                    ]}
                    onPress={() => handleSave({ ...config, voiceIdentifier: v.identifier })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.voiceName, { color: colors.text }]}>{v.name}</Text>
                      <Text style={[styles.voiceLang, { color: colors.textMuted }]}>{v.language} - {v.quality}</Text>
                    </View>
                    <TouchableOpacity onPress={() => testVoice(v.identifier)} style={styles.playBtn}>
                      <Volume2 size={18} color={colors.primary} />
                    </TouchableOpacity>
                    {config.voiceIdentifier === v.identifier && <Check size={18} color={colors.primary} />}
                  </TouchableOpacity>
                ))
              )}
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Pilih Suara Alternatif (Female)</Text>
              <Text style={styles.hint}>Gunakan tag [M] dan [F] dalam script untuk berganti suara.</Text>
              {loading ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                voices.filter(v => v.language.startsWith('ja') || v.language.startsWith('id')).map((v) => (
                  <TouchableOpacity
                    key={`alt-${v.identifier}`}
                    style={[
                      styles.voiceItem,
                      { backgroundColor: config.alternateVoiceIdentifier === v.identifier ? colors.teal + "10" : colors.background },
                      config.alternateVoiceIdentifier === v.identifier && { borderColor: colors.teal, borderWidth: 1 }
                    ]}
                    onPress={() => handleSave({ ...config, alternateVoiceIdentifier: v.identifier })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.voiceName, { color: colors.text }]}>{v.name}</Text>
                      <Text style={[styles.voiceLang, { color: colors.textMuted }]}>{v.language} - {v.quality}</Text>
                    </View>
                    <TouchableOpacity onPress={() => testVoice(v.identifier)} style={styles.playBtn}>
                      <Volume2 size={18} color={colors.teal} />
                    </TouchableOpacity>
                    {config.alternateVoiceIdentifier === v.identifier && <Check size={18} color={colors.teal} />}
                  </TouchableOpacity>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  content: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    height: "80%",
    padding: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
  },
  closeBtn: {
    padding: 4,
  },
  scroll: {
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  rateBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 60,
    alignItems: "center",
  },
  rateText: {
    fontSize: 14,
    fontWeight: "800",
  },
  voiceItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    marginBottom: 8,
    gap: 12,
  },
  voiceName: {
    fontSize: 15,
    fontWeight: "700",
  },
  voiceLang: {
    fontSize: 12,
    fontWeight: "500",
  },
  playBtn: {
    padding: 8,
  },
  hint: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 10,
    fontStyle: "italic",
  }
});
