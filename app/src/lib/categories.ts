import type { AnswerRecord, Question } from "../types";

/** 一次分类专项练习的默认题量。 */
export const CATEGORY_SESSION_SIZE = 10;

export interface CategoryProgress {
  category: string;
  /** 该分类题量 */
  total: number;
  /** 已练过的题数（按最近一次作答去重） */
  seen: number;
  /** 最近一次作答仍答错的题数 */
  wrong: number;
  /** 最近一次作答口径的正确率 */
  accuracy: number;
}

/** 每题只保留最近一次作答，避免同一题重复计数。 */
export function latestByQuestion(records: AnswerRecord[]): Map<string, AnswerRecord> {
  const latest = new Map<string, AnswerRecord>();
  records.forEach((r) => {
    const prev = latest.get(r.questionId);
    if (!prev || r.answeredAt >= prev.answeredAt) latest.set(r.questionId, r);
  });
  return latest;
}

/** 按题库顺序列出分类（不受答题记录影响）。 */
export function listCategories(questions: Question[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  questions.forEach((q) =>
    q.categories.forEach((c) => {
      if (!seen.has(c)) {
        seen.add(c);
        out.push(c);
      }
    })
  );
  return out;
}

export function questionsOfCategory(category: string, questions: Question[]): Question[] {
  return questions.filter((q) => q.categories.includes(category));
}

export function computeCategoryProgress(
  questions: Question[],
  records: AnswerRecord[]
): CategoryProgress[] {
  const latest = latestByQuestion(records);

  return listCategories(questions).map((category) => {
    const inCategory = questionsOfCategory(category, questions);
    let seen = 0;
    let correct = 0;
    inCategory.forEach((q) => {
      const r = latest.get(q.id);
      if (!r) return;
      seen += 1;
      if (r.isCorrect) correct += 1;
    });
    return {
      category,
      total: inCategory.length,
      seen,
      wrong: seen - correct,
      accuracy: seen ? correct / seen : 0
    };
  });
}

/**
 * 挑出一次分类练习的题目：没做过的排前面，其次最近做错的，最后是已经做对的。
 * 同一桶内保持题库原顺序，结果稳定可预期。
 */
export function pickCategoryQuestions(
  category: string,
  questions: Question[],
  records: AnswerRecord[],
  size: number = CATEGORY_SESSION_SIZE
): string[] {
  const latest = latestByQuestion(records);
  const buckets: { unseen: string[]; wrong: string[]; right: string[] } = {
    unseen: [],
    wrong: [],
    right: []
  };

  questionsOfCategory(category, questions).forEach((q) => {
    const r = latest.get(q.id);
    if (!r) buckets.unseen.push(q.id);
    else if (r.isCorrect) buckets.right.push(q.id);
    else buckets.wrong.push(q.id);
  });

  return [...buckets.unseen, ...buckets.wrong, ...buckets.right].slice(0, size);
}
