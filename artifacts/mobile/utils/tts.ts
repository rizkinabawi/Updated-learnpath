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

// ─── Web-only helpers ────────────────────────────────────────────────────────
// The Web Speech API has a few well-known quirks we have to work around so
// TTS feels reliable in the browser:
//   1. Voices load asynchronously — we have to wait for `voiceschanged` on
//      the first call, otherwise `voice` is silently ignored.
//   2. Calling `cancel()` immediately followed by `speak()` is racy in Chrome
//      and frequently swallows the new utterance — add a small gap.
//   3. `onend` is not always fired (page hidden, voice mismatch, etc.) — we
//      need a timeout fallback so chunked playback doesn't hang.
//   4. Chrome cuts off utterances longer than ~15 s — split long text.

const isWeb = Platform.OS === "web";

const waitForWebVoices = async (timeoutMs = 1500): Promise<void> => {
  if (!isWeb || typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }
  const synth = window.speechSynthesis;
  if (synth.getVoices().length > 0) return;
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        synth.removeEventListener("voiceschanged", finish);
      } catch {}
      resolve();
    };
    synth.addEventListener("voiceschanged", finish, { once: true });
    setTimeout(finish, timeoutMs);
  });
};

/**
 * Estimated ms it takes to speak `text` at the given rate. Used as a safety
 * timeout so we don't hang forever if `onDone` never fires.
 */
const estimateSpeechMs = (text: string, rate: number): number => {
  const words = Math.max(1, text.trim().split(/\s+/).length);
  const wpm = 160 * Math.max(0.3, rate);
  return Math.ceil((words / wpm) * 60_000) + 1500;
};

/**
 * Split a long string at sentence/word boundaries so each chunk fits under
 * Chrome's ~15 s utterance limit.
 */
const splitLongText = (text: string, maxChars = 180): string[] => {
  if (text.length <= maxChars) return [text];
  const out: string[] = [];
  const sentences = text.split(/(?<=[.!?。！？])\s+/);
  let buffer = "";
  for (const s of sentences) {
    if ((buffer + " " + s).trim().length <= maxChars) {
      buffer = (buffer ? buffer + " " : "") + s;
      continue;
    }
    if (buffer) out.push(buffer);
    if (s.length <= maxChars) {
      buffer = s;
    } else {
      // Hard wrap on words
      const words = s.split(/\s+/);
      buffer = "";
      for (const w of words) {
        if ((buffer + " " + w).trim().length > maxChars) {
          if (buffer) out.push(buffer);
          buffer = w;
        } else {
          buffer = (buffer ? buffer + " " : "") + w;
        }
      }
    }
  }
  if (buffer) out.push(buffer);
  return out;
};

/**
 * Plays a TTS script, supporting multi-voice tags.
 */
export const speak = async (script: string, overrideConfig?: Partial<TTSConfig>) => {
  const config = await getTTSConfig();
  const finalConfig = { ...config, ...overrideConfig };

  const chunks = parseTTSScript(script);

  if (typeof Speech.stop === "function") {
    await Speech.stop();
  }
  // Web quirk: cancel() then speak() back-to-back is racy in Chrome.
  if (isWeb) {
    await waitForWebVoices();
    await new Promise((r) => setTimeout(r, 60));
  }

  if (typeof Speech.speak !== "function") {
    console.warn("Speech.speak is not a function");
    return;
  }

  for (const chunk of chunks) {
    const cleanText = chunk.text
      .replace(/<[^>]*>?/gm, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleanText) continue;

    let lang = "id-ID";
    const hasJapanese = /[\u3040-\u30ff\u4e00-\u9faf]/.test(cleanText);
    if (hasJapanese) lang = "ja-JP";

    // Select voice based on gender tag
    let voiceId = finalConfig.voiceIdentifier;
    if (chunk.gender === "F" && finalConfig.alternateVoiceIdentifier) {
      voiceId = finalConfig.alternateVoiceIdentifier;
    } else if (chunk.gender === "M" && finalConfig.voiceIdentifier) {
      voiceId = finalConfig.voiceIdentifier;
    }

    // On web, split long text into Chrome-friendly chunks.
    const subChunks = isWeb ? splitLongText(cleanText) : [cleanText];

    for (const piece of subChunks) {
      await new Promise<void>((resolve) => {
        let resolved = false;
        const done = () => {
          if (resolved) return;
          resolved = true;
          resolve();
        };
        const safetyTimeout = setTimeout(
          done,
          estimateSpeechMs(piece, finalConfig.rate) + 4000,
        );

        try {
          Speech.speak(piece, {
            language: lang,
            rate: finalConfig.rate,
            pitch: finalConfig.pitch,
            voice: voiceId,
            onDone: () => {
              clearTimeout(safetyTimeout);
              done();
            },
            onStopped: () => {
              clearTimeout(safetyTimeout);
              done();
            },
            onError: () => {
              clearTimeout(safetyTimeout);
              done();
            },
          });
        } catch (e) {
          console.warn("[tts] speak threw:", e);
          clearTimeout(safetyTimeout);
          done();
        }
      });
    }
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

export const playPlaylist = async (
  items: { question: string; answer: string }[], 
  onItemStart?: (idx: number) => void,
  isCancelled?: () => boolean
) => {
  for (let i = 0; i < items.length; i++) {
    if (isCancelled?.()) break;
    onItemStart?.(i);
    
    // Play Question
    await speak(items[i].question);
    if (isCancelled?.()) break;
    await new Promise(r => setTimeout(r, 800)); // Short gap
    
    // Play Answer
    if (isCancelled?.()) break;
    await speak(items[i].answer);
    
    if (i < items.length - 1) {
      if (isCancelled?.()) break;
      await new Promise(r => setTimeout(r, 1500)); // Gap before next card
    }
  }
};

export { Speech };
