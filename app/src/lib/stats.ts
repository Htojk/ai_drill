import type { AnswerRecord, CategoryStat, Question } from "../types";

export interface OverviewStat {
  total: number;
  correct: number;
  accuracy: number;
  byCategory: CategoryStat[];
}

export function computeOverview(records: AnswerRecord[], questions: Question[]): OverviewStat {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const map = new Map<string, { answered: number; correct: number }>();
  let correct = 0;

  records.forEach((r) => {
    if (r.isCorrect) correct += 1;
    const q = byId.get(r.questionId);
    const cats = q?.categories.length ? q.categories : ["未分类"];
    cats.forEach((cat) => {
      const cur = map.get(cat) ?? { answered: 0, correct: 0 };
      cur.answered += 1;
      if (r.isCorrect) cur.correct += 1;
      map.set(cat, cur);
    });
  });

  const byCategory: CategoryStat[] = [...map.entries()]
    .map(([category, s]) => ({
      category,
      answered: s.answered,
      correct: s.correct,
      accuracy: s.answered ? s.correct / s.answered : 0
    }))
    .sort((a, b) => b.answered - a.answered);

  return {
    total: records.length,
    correct,
    accuracy: records.length ? correct / records.length : 0,
    byCategory
  };
}

export function accuracyLevel(accuracy: number): "ok" | "warn" | "bad" {
  if (accuracy >= 0.8) return "ok";
  if (accuracy >= 0.6) return "warn";
  return "bad";
}
