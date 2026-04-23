import { getProgress, getFlashcards, getQuizzes, type Progress, type Flashcard, type Quiz } from "./storage";

export type DifficultyLevel = "mudah" | "sedang" | "susah";

export interface ClassifiedItem {
  id: string;
  question: string;
  type: "flashcard" | "quiz";
  attempts: number;
  correctAttempts: number;
  accuracy: number;
  difficulty: DifficultyLevel;
  lastAttempt: string;
}

export interface DifficultyStats {
  mudah: ClassifiedItem[];
  sedang: ClassifiedItem[];
  susah: ClassifiedItem[];
  total: number;
}

export function classifyByAccuracy(accuracy: number, attempts: number): DifficultyLevel {
  if (attempts < 2) return "sedang";
  if (accuracy >= 70) return "mudah";
  if (accuracy >= 40) return "sedang";
  return "susah";
}

export async function classifyAllItems(): Promise<DifficultyStats> {
  const [allProgress, flashcards, quizzes] = await Promise.all([
    getProgress(),
    getFlashcards(),
    getQuizzes(),
  ]);

  const itemMap = new Map<string, { correct: number; total: number; last: string }>();

  for (const p of allProgress) {
    const key = p.flashcardId ?? p.quizId;
    if (!key) continue;
    const existing = itemMap.get(key) ?? { correct: 0, total: 0, last: "" };
    existing.total += 1;
    if (p.isCorrect) existing.correct += 1;
    if (!existing.last || p.timestamp > existing.last) existing.last = p.timestamp;
    itemMap.set(key, existing);
  }

  const classified: ClassifiedItem[] = [];

  for (const card of flashcards) {
    const stats = itemMap.get(card.id);
    if (!stats || stats.total < 1) continue;
    const accuracy = Math.round((stats.correct / stats.total) * 100);
    classified.push({
      id: card.id,
      question: card.question,
      type: "flashcard",
      attempts: stats.total,
      correctAttempts: stats.correct,
      accuracy,
      difficulty: classifyByAccuracy(accuracy, stats.total),
      lastAttempt: stats.last,
    });
  }

  for (const quiz of quizzes) {
    const stats = itemMap.get(quiz.id);
    if (!stats || stats.total < 1) continue;
    const accuracy = Math.round((stats.correct / stats.total) * 100);
    classified.push({
      id: quiz.id,
      question: quiz.question,
      type: "quiz",
      attempts: stats.total,
      correctAttempts: stats.correct,
      accuracy,
      difficulty: classifyByAccuracy(accuracy, stats.total),
      lastAttempt: stats.last,
    });
  }

  return {
    mudah: classified.filter((c) => c.difficulty === "mudah").sort((a, b) => b.attempts - a.attempts),
    sedang: classified.filter((c) => c.difficulty === "sedang").sort((a, b) => a.accuracy - b.accuracy),
    susah: classified.filter((c) => c.difficulty === "susah").sort((a, b) => a.accuracy - b.accuracy),
    total: classified.length,
  };
}
