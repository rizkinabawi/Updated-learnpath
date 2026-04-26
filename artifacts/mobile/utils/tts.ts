import * as Speech from "expo-speech";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface TTSConfig {
  rate: number;
  pitch: number;
  voiceIdentifier?: string;
  alternateVoiceIdentifier?: string; // For [M]/[F] type scripts
}
const STORAGE_KEY = "tts_config";

export const DEFAULT_TTS_CONFIG: TTSConfig = {
  rate: 0.9,
  pitch: 1.0,
};

export const getTTSConfig = async (): Promise<TTSConfig> => {
  const data = await AsyncStorage.getItem(STORAGE_KEY);
  if (data) return JSON.parse(data);
  return DEFAULT_TTS_CONFIG;
};

export const saveTTSConfig = async (config: TTSConfig) => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
};

/**
 * Splits a script into chunks based on [M] and [F] tags.
 * Example: "[M]Hello [F]How are you?" -> [{gender: 'M', text: 'Hello'}, {gender: 'F', text: 'How are you?'}]
 */
export const parseTTSScript = (script: string) => {
  const regex = /\[([MF])\]/g;
  const parts = script.split(regex);
  
  // If no tags found, return as a single default chunk
  if (parts.length === 1) {
    return [{ gender: 'D', text: script.trim() }];
  }

  const chunks: { gender: string; text: string }[] = [];
  let currentGender = 'D'; // Default

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === 'M' || part === 'F') {
      currentGender = part;
    } else if (part.trim()) {
      chunks.push({ gender: currentGender, text: part.trim() });
    }
  }

  return chunks;
};

/**
 * Plays a TTS script, supporting multi-voice tags.
 */
export const speak = async (script: string, overrideConfig?: Partial<TTSConfig>) => {
  const config = await getTTSConfig();
  const finalConfig = { ...config, ...overrideConfig };
  
  const chunks = parseTTSScript(script);
  if (typeof Speech.stop === 'function') {
    await Speech.stop();
  }

  for (const chunk of chunks) {
    const cleanText = chunk.text.replace(/<[^>]*>?/gm, "").replace(/\s+/g, " ").trim();
    if (!cleanText) continue;

    let lang = "id-ID";
    const hasJapanese = /[\u3040-\u30ff\u4e00-\u9faf]/.test(cleanText);
    if (hasJapanese) lang = "ja-JP";

    // Select voice based on gender tag
    let voiceId = finalConfig.voiceIdentifier;
    if (chunk.gender === 'F' && finalConfig.alternateVoiceIdentifier) {
      voiceId = finalConfig.alternateVoiceIdentifier;
    } else if (chunk.gender === 'M' && finalConfig.voiceIdentifier) {
      voiceId = finalConfig.voiceIdentifier;
    }

    if (typeof Speech.speak !== 'function') {
      console.warn("Speech.speak is not a function");
      return;
    }

    await new Promise<void>((resolve) => {
      Speech.speak(cleanText, {
        language: lang,
        rate: finalConfig.rate,
        pitch: finalConfig.pitch,
        voice: voiceId,
        onDone: () => resolve(),
        onError: () => resolve(), // Continue on error
      });
    });
  }
};

export const getAvailableVoices = async (): Promise<Speech.Voice[]> => {
  try {
    const SpeechAny = Speech as any;
    if (typeof SpeechAny.getVoicesAsync === 'function') {
      const voices: Speech.Voice[] = await SpeechAny.getVoicesAsync();
      return voices.sort((a: Speech.Voice, b: Speech.Voice) => a.language.localeCompare(b.language));
    }
    console.warn("Speech.getVoicesAsync is not available on this platform");
    return [];
  } catch (error) {
    console.error("Error fetching voices:", error);
    return [];
  }
};

export const stop = async () => {
  try {
    if (typeof Speech.stop === 'function') {
      await Speech.stop();
    }
  } catch {}
};

export { Speech };
