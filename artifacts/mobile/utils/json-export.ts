import { Share, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "@/utils/fs-compat";
import * as Sharing from "expo-sharing";
import { isCancellationError } from "./safe-share";

// ─── Canonical AI output types (these match the format AI is asked to produce) ─

/**
 * QuizItem — format yang diminta ke AI dan yang ditampilkan sebagai contoh ke user.
 * Gunakan `correct_answer` (bukan `answer`) sesuai spesifikasi output.
 * Field `explanation` wajib ada agar AI memberikan penjelasan jawaban.
 */
export interface QuizItem {
  question: string;
  options: string[];
  correct_answer: string;
  explanation?: string;
  image?: string;
}

/**
 * FlashcardItem — format standar flashcard.
 */
export interface FlashcardItem {
  question: string;
  answer: string;
  tag?: string;
  image?: string;
}

export interface QuizJsonOutput {
  type: "quiz";
  topic: string;
  difficulty: string;
  items: QuizItem[];
}

export interface FlashcardJsonOutput {
  type: "flashcard";
  topic: string;
  difficulty: string;
  items: FlashcardItem[];
}

export type LearningJsonOutput = QuizJsonOutput | FlashcardJsonOutput;

// ─── Normalisasi item quiz dari AI output ke storage format ─────────────────
/**
 * Normalisasi satu item quiz dari format AI (correct_answer) ke storage (answer).
 * Mendukung kedua format untuk backward-compatibility.
 */
export function normalizeQuizAnswer(item: any): string {
  return String(item.correct_answer ?? item.answer ?? "").trim();
}

// ─── Utilities ───────────────────────────────────────────────────────────────
export async function copyJsonToClipboard(data: LearningJsonOutput): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  await Clipboard.setStringAsync(json);
}

export async function shareJson(data: LearningJsonOutput): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  const filename = `${data.type}_${data.topic.replace(/\s+/g, "_").toLowerCase()}.json`;

  if (Platform.OS === "web") {
    await Clipboard.setStringAsync(json);
    return;
  }

  try {
    const isAvailable = await Sharing.isAvailableAsync();

    if (isAvailable) {
      const path = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(path, json, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(path, {
        mimeType: "application/json",
        dialogTitle: `Bagikan ${data.type} — ${data.topic}`,
      });
    } else {
      await Share.share({ message: json, title: filename });
    }
  } catch (e) {
    if (!isCancellationError(e)) {
      await Clipboard.setStringAsync(json);
    }
  }
}

export async function downloadJson(data: LearningJsonOutput): Promise<string> {
  const json = JSON.stringify(data, null, 2);
  const filename = `${data.type}_${data.topic.replace(/\s+/g, "_").toLowerCase()}_${Date.now()}.json`;
  const path = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return path;
}
