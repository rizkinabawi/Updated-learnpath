/**
 * Unit tests for utils/storage.ts
 *
 * Tests pure/logic functions: generateId, type guards, and the
 * interface shape contracts.
 */

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  multiGet: jest.fn().mockResolvedValue([]),
}));

// Mock react-native Platform
jest.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

// Mock fs-compat
jest.mock("../utils/fs-compat", () => ({
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  downloadAsync: jest.fn().mockResolvedValue({ uri: "file://downloaded" }),
  documentDirectory: "file://document/",
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  readAsStringAsync: jest.fn().mockResolvedValue(""),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  cacheDirectory: null,
}));

import {
  generateId,
  isStandaloneId,
  STANDALONE_LESSON_ID,
  STANDALONE_COLLECTION_PREFIX,
} from "../utils/storage";

import type { LearningPath, Quiz, Flashcard, User } from "../utils/storage";
import type { AppLicense } from "../utils/security/app-license";

// ─── generateId ───────────────────────────────────────────────────────────────

describe("generateId", () => {
  test("returns a non-empty string", () => {
    const id = generateId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  test("includes a timestamp prefix", () => {
    const before = Date.now();
    const id = generateId();
    const after = Date.now();
    const timestamp = parseInt(id.split("-")[0]);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  test("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  test("ID format is timestamp-randomhex", () => {
    const id = generateId();
    expect(id).toMatch(/^\d+-[a-z0-9]+$/);
  });
});

// ─── isStandaloneId ───────────────────────────────────────────────────────────

describe("isStandaloneId", () => {
  test("returns true for STANDALONE_LESSON_ID", () => {
    expect(isStandaloneId(STANDALONE_LESSON_ID)).toBe(true);
  });

  test("returns true for IDs starting with STANDALONE_COLLECTION_PREFIX", () => {
    expect(isStandaloneId(`${STANDALONE_COLLECTION_PREFIX}my-collection`)).toBe(true);
    expect(isStandaloneId(`${STANDALONE_COLLECTION_PREFIX}123`)).toBe(true);
  });

  test("returns false for regular lesson IDs", () => {
    expect(isStandaloneId("lesson-abc-123")).toBe(false);
    expect(isStandaloneId("1234567890-abcdef")).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(isStandaloneId("")).toBe(false);
  });

  test("returns false for partial prefix match", () => {
    // Must start with prefix, not just contain it
    expect(isStandaloneId(`lesson_${STANDALONE_COLLECTION_PREFIX}`)).toBe(false);
  });
});

// ─── LearningPath interface shape ─────────────────────────────────────────────

describe("LearningPath type contract", () => {
  test("minimal valid LearningPath compiles", () => {
    const path: LearningPath = {
      id: "path-1",
      name: "My Course",
      description: "A test course",
      userId: "user-1",
    };
    expect(path.id).toBe("path-1");
    expect(path.createdAt).toBeUndefined();
    expect(path.avatar).toBeUndefined();
  });

  test("full LearningPath with optional fields", () => {
    const path: LearningPath = {
      id: "path-2",
      name: "Full Course",
      description: "Complete course",
      userId: "user-1",
      tags: ["japanese", "n5"],
      icon: "book",
      avatar: "https://example.com/avatar.png",
      completedLessons: 3,
      totalLessons: 10,
      isFavorite: true,
      openCount: 5,
      targetDate: "2026-12-31",
      targetDailyMinutes: 30,
      createdAt: new Date().toISOString(),
    };
    expect(path.tags).toEqual(["japanese", "n5"]);
    expect(path.isFavorite).toBe(true);
    expect(path.createdAt).toBeTruthy();
  });
});

// ─── Quiz interface shape ─────────────────────────────────────────────────────

describe("Quiz type contract", () => {
  test("minimal valid Quiz compiles", () => {
    const quiz: Quiz = {
      id: "quiz-1",
      question: "What is 2+2?",
      options: ["2", "3", "4", "5"],
      answer: "4",
      type: "multiple-choice",
      lessonId: "lesson-1",
      createdAt: new Date().toISOString(),
    };
    expect(quiz.template).toBeUndefined();
    expect(quiz.type).toBe("multiple-choice");
  });

  test("Quiz with template field", () => {
    const quiz: Quiz = {
      id: "quiz-2",
      question: "Listen and answer",
      options: ["A", "B", "C", "D"],
      answer: "A",
      type: "multiple-choice",
      lessonId: "lesson-1",
      template: "listening",
      createdAt: new Date().toISOString(),
    };
    expect(quiz.template).toBe("listening");
  });

  test("true-false Quiz type is valid", () => {
    const quiz: Quiz = {
      id: "quiz-3",
      question: "The sky is blue",
      options: ["True", "False"],
      answer: "True",
      type: "true-false",
      lessonId: "lesson-1",
      createdAt: new Date().toISOString(),
    };
    expect(quiz.type).toBe("true-false");
  });
});

// ─── Flashcard type contract ──────────────────────────────────────────────────

describe("Flashcard type contract", () => {
  test("minimal Flashcard compiles with required fields", () => {
    const card: Flashcard = {
      id: "card-1",
      question: "Front of card",
      answer: "Back of card",
      tag: "vocabulary",
      lessonId: "lesson-1",
      createdAt: new Date().toISOString(),
    };
    expect(card.template).toBeUndefined();
    expect(card.images).toBeUndefined();
  });

  test("Flashcard with listening template", () => {
    const card: Flashcard = {
      id: "card-2",
      question: "Audio question",
      answer: "Answer",
      tag: "listening",
      lessonId: "lesson-1",
      template: "listening",
      ttsScript: "[M]Male voice [F]Female voice",
      createdAt: new Date().toISOString(),
    };
    expect(card.template).toBe("listening");
    expect(card.ttsScript).toContain("[M]");
  });

  test("Flashcard with media arrays", () => {
    const card: Flashcard = {
      id: "card-3",
      question: "Image question",
      answer: "Answer",
      tag: "visual",
      lessonId: "lesson-1",
      images: ["file://img1.png", "file://img2.png"],
      imagesBack: ["file://back1.png"],
      audios: ["file://audio1.mp3"],
      audiosBack: [],
      createdAt: new Date().toISOString(),
    };
    expect(card.images?.length).toBe(2);
    expect(card.audios?.length).toBe(1);
  });
});

// ─── STANDALONE constants ─────────────────────────────────────────────────────

describe("STANDALONE constants", () => {
  test("STANDALONE_LESSON_ID is a non-empty string", () => {
    expect(typeof STANDALONE_LESSON_ID).toBe("string");
    expect(STANDALONE_LESSON_ID.length).toBeGreaterThan(0);
  });

  test("STANDALONE_COLLECTION_PREFIX starts with __ (double underscore)", () => {
    expect(STANDALONE_COLLECTION_PREFIX.startsWith("__")).toBe(true);
  });

  test("STANDALONE_LESSON_ID is different from prefix", () => {
    expect(STANDALONE_LESSON_ID).not.toBe(STANDALONE_COLLECTION_PREFIX);
  });
});
