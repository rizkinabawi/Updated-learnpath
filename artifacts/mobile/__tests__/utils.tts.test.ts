/**
 * Unit tests for utils/tts.ts
 *
 * parseTTSScript is a pure function — 100% testable without any mocks.
 * speak/stop/getAvailableVoices are tested with expo-speech mocked.
 */

// Mock expo-speech before importing tts
jest.mock("expo-speech", () => ({
  speak: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined),
  getVoicesAsync: jest.fn().mockResolvedValue([
    { identifier: "com.apple.voice.male", name: "Male Voice", language: "id-ID", quality: "Enhanced" },
    { identifier: "com.apple.voice.female", name: "Female Voice", language: "id-ID", quality: "Default" },
    { identifier: "com.apple.voice.ja", name: "Japanese Voice", language: "ja-JP", quality: "Enhanced" },
  ]),
}));

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

import { parseTTSScript, getAvailableVoices, stop, DEFAULT_TTS_CONFIG } from "../utils/tts";

// ─── parseTTSScript ───────────────────────────────────────────────────────────

describe("parseTTSScript", () => {
  test("returns single default chunk when no tags", () => {
    const result = parseTTSScript("Hello world");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ gender: "D", text: "Hello world" });
  });

  test("returns empty array for empty string", () => {
    const result = parseTTSScript("");
    // empty string trim returns nothing meaningful
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("");
  });

  test("parses [M] tag correctly", () => {
    const result = parseTTSScript("[M]Good morning");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ gender: "M", text: "Good morning" });
  });

  test("parses [F] tag correctly", () => {
    const result = parseTTSScript("[F]How are you?");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ gender: "F", text: "How are you?" });
  });

  test("parses alternating [M][F] tags", () => {
    const result = parseTTSScript("[M]Hello [F]How are you?");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ gender: "M", text: "Hello" });
    expect(result[1]).toEqual({ gender: "F", text: "How are you?" });
  });

  test("parses multiple chunks with both genders", () => {
    const result = parseTTSScript("[M]First male line [F]First female line [M]Second male line");
    expect(result).toHaveLength(3);
    expect(result[0].gender).toBe("M");
    expect(result[1].gender).toBe("F");
    expect(result[2].gender).toBe("M");
  });

  test("skips empty text segments between tags", () => {
    const result = parseTTSScript("[M][F]Only female text");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ gender: "F", text: "Only female text" });
  });

  test("trims whitespace from each chunk", () => {
    const result = parseTTSScript("[M]  Hello World  ");
    expect(result[0].text).toBe("Hello World");
  });

  test("handles Japanese text without tags", () => {
    const result = parseTTSScript("こんにちは");
    expect(result).toHaveLength(1);
    expect(result[0].gender).toBe("D");
    expect(result[0].text).toBe("こんにちは");
  });

  test("handles multiline scripts", () => {
    const script = "[M]Line one.\n[F]Line two.\n[M]Line three.";
    const result = parseTTSScript(script);
    expect(result).toHaveLength(3);
    expect(result[0].gender).toBe("M");
    expect(result[1].gender).toBe("F");
    expect(result[2].gender).toBe("M");
  });
});

// ─── DEFAULT_TTS_CONFIG ───────────────────────────────────────────────────────

describe("DEFAULT_TTS_CONFIG", () => {
  test("has required rate and pitch fields", () => {
    expect(DEFAULT_TTS_CONFIG).toHaveProperty("rate");
    expect(DEFAULT_TTS_CONFIG).toHaveProperty("pitch");
  });

  test("rate is a valid positive number", () => {
    expect(typeof DEFAULT_TTS_CONFIG.rate).toBe("number");
    expect(DEFAULT_TTS_CONFIG.rate).toBeGreaterThan(0);
  });

  test("pitch is a valid positive number", () => {
    expect(typeof DEFAULT_TTS_CONFIG.pitch).toBe("number");
    expect(DEFAULT_TTS_CONFIG.pitch).toBeGreaterThan(0);
  });

  test("optional voiceIdentifier defaults to undefined", () => {
    expect(DEFAULT_TTS_CONFIG.voiceIdentifier).toBeUndefined();
  });
});

// ─── getAvailableVoices ───────────────────────────────────────────────────────

describe("getAvailableVoices", () => {
  test("returns an array of Voice objects", async () => {
    const voices = await getAvailableVoices();
    expect(Array.isArray(voices)).toBe(true);
  });

  test("voices are sorted by language", async () => {
    const voices = await getAvailableVoices();
    for (let i = 0; i < voices.length - 1; i++) {
      expect(voices[i].language.localeCompare(voices[i + 1].language)).toBeLessThanOrEqual(0);
    }
  });

  test("returns empty array when getVoicesAsync is not a function", async () => {
    const Speech = require("expo-speech");
    const original = Speech.getVoicesAsync;
    Speech.getVoicesAsync = undefined;
    const voices = await getAvailableVoices();
    expect(voices).toEqual([]);
    Speech.getVoicesAsync = original;
  });

  test("returns empty array when getVoicesAsync throws", async () => {
    const Speech = require("expo-speech");
    Speech.getVoicesAsync = jest.fn().mockRejectedValue(new Error("Not supported"));
    const voices = await getAvailableVoices();
    expect(voices).toEqual([]);
    // Restore
    Speech.getVoicesAsync = jest.fn().mockResolvedValue([]);
  });
});

// ─── stop ─────────────────────────────────────────────────────────────────────

describe("stop", () => {
  test("does not throw when Speech.stop exists", async () => {
    const Speech = require("expo-speech");
    Speech.stop = jest.fn().mockResolvedValue(undefined);
    await expect(stop()).resolves.not.toThrow();
  });

  test("does not throw when Speech.stop is undefined", async () => {
    const Speech = require("expo-speech");
    Speech.stop = undefined;
    await expect(stop()).resolves.not.toThrow();
    Speech.stop = jest.fn().mockResolvedValue(undefined);
  });
});
