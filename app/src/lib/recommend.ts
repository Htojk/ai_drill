import type { AnswerRecord, Profile, Question, ReviewState } from "../types";
import { dayStart } from "./storage";

const DAILY_SIZE = 10;
const MIN_PRACTICE = 3;
const RECENT_DAYS = 14;
const WEAK_ACCURACY = 0.6;
const WEAK_MIN_ANSWERED = 3;
const DAY_MS = 86400000;

export interface RecommendInput {
  questions: Question[];
  records: AnswerRecord[];
  reviews: Record<string, ReviewState>;
  profile: Profile;
  now?: number;
}

/** 用日期做种子的确定性随机，保证同一天多次计算结果一致 */
function seededShuffle<T>(items: T[], seedText: string): T[] {
  let seed = 0;
  for (let i = 0; i < seedText.length; i++) seed = (seed * 31 + seedText.charCodeAt(i)) >>> 0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function take<T>(pool: T[], count: number, picked: Set<string>, idOf: (x: T) => string): T[] {
  const out: T[] = [];
  for (const item of pool) {
    if (out.length >= count) break;
    const id = idOf(item);
    if (picked.has(id)) continue;
    picked.add(id);
    out.push(item);
  }
  return out;
}

/**
 * 每日推荐（MVP 规则版，纯前端计算）
 * 4 题薄弱分类 + 3 题到期复习 + 2 题新题 + 1 题挑战，不足互相顺延，必须凑满 10 题。
 * 全局约束：当日工程判断题 >= 3 题。
 */
export function buildDailyTask(input: RecommendInput): string[] {
  const { questions, records, reviews, profile } = input;
  const now = input.now ?? Date.now();
  const dayKey = new Date(now).toISOString().slice(0, 10);

  const answeredIds = new Set(records.map((r) => r.questionId));
  const lastAnsweredAt = new Map<string, number>();
  records.forEach((r) => {
    lastAnsweredAt.set(r.questionId, Math.max(lastAnsweredAt.get(r.questionId) ?? 0, r.answeredAt));
  });
  const recentCutoff = now - RECENT_DAYS * DAY_MS;
  const isRecent = (id: string) => (lastAnsweredAt.get(id) ?? 0) > recentCutoff;

  const picked = new Set<string>();
  const chosen: Question[] = [];

  // 新用户：先做一次均匀摸底
  if (!profile.onboarded || records.length === 0) {
    const byCategory = new Map<string, Question[]>();
    questions.forEach((q) => {
      const cat = q.categories[0] ?? "未分类";
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(q);
    });
    const buckets = seededShuffle([...byCategory.values()], dayKey).map((list) => seededShuffle(list, dayKey + (list[0]?.id ?? "")));
    let idx = 0;
    while (chosen.length < DAILY_SIZE && buckets.some((b) => b.length > 0)) {
      const bucket = buckets[idx % buckets.length];
      idx++;
      const next = bucket.shift();
      if (next && !picked.has(next.id)) {
        picked.add(next.id);
        chosen.push(next);
      }
      if (idx > 500) break;
    }
    return enforcePractice(chosen, questions, picked, dayKey);
  }

  // 分类正确率
  const stat = new Map<string, { answered: number; correct: number }>();
  const byId = new Map(questions.map((q) => [q.id, q]));
  records.forEach((r) => {
    const q = byId.get(r.questionId);
    if (!q) return;
    (q.categories.length ? q.categories : ["未分类"]).forEach((cat) => {
      const cur = stat.get(cat) ?? { answered: 0, correct: 0 };
      cur.answered += 1;
      if (r.isCorrect) cur.correct += 1;
      stat.set(cat, cur);
    });
  });
  const weakCategories = [...stat.entries()]
    .filter(([, s]) => s.answered >= WEAK_MIN_ANSWERED && s.correct / s.answered < WEAK_ACCURACY)
    .sort((a, b) => a[1].correct / a[1].answered - b[1].correct / b[1].answered)
    .map(([cat]) => cat);

  // 各候选池
  const dueList = Object.values(reviews)
    .filter((s) => s.nextReviewAt <= now)
    .sort((a, b) => a.nextReviewAt - b.nextReviewAt)
    .map((s) => byId.get(s.questionId))
    .filter((q): q is Question => !!q);

  const freshList = seededShuffle(
    questions.filter((q) => !answeredIds.has(q.id)),
    dayKey
  );

  const weakList = seededShuffle(
    questions.filter((q) => q.categories.some((c) => weakCategories.includes(c)) && !isRecent(q.id) && !answeredIds.has(q.id)),
    dayKey + "weak"
  ).concat(
    seededShuffle(
      questions.filter((q) => q.categories.some((c) => weakCategories.includes(c)) && !isRecent(q.id)),
      dayKey + "weak2"
    )
  );

  const challengeList = seededShuffle(
    questions.filter((q) => q.difficulty >= 4 && !isRecent(q.id)),
    dayKey + "challenge"
  );

  const fallbackList = seededShuffle(
    questions.filter((q) => !isRecent(q.id)),
    dayKey + "fallback"
  );

  chosen.push(...take(dueList, 3, picked, (q) => q.id));
  chosen.push(...take(weakList, 4, picked, (q) => q.id));
  chosen.push(...take(freshList, 2, picked, (q) => q.id));
  chosen.push(...take(challengeList, 1, picked, (q) => q.id));
  chosen.push(...take(fallbackList, DAILY_SIZE - chosen.length, picked, (q) => q.id));
  if (chosen.length < DAILY_SIZE) {
    chosen.push(...take(seededShuffle(questions, dayKey + "any"), DAILY_SIZE - chosen.length, picked, (q) => q.id));
  }

  return enforcePractice(chosen.slice(0, DAILY_SIZE), questions, picked, dayKey);
}

/** 保证当日工程判断题不少于 MIN_PRACTICE 道 */
function enforcePractice(
  chosen: Question[],
  all: Question[],
  picked: Set<string>,
  seed: string
): string[] {
  const result = [...chosen];
  let practiceCount = result.filter((q) => q.isPractice).length;
  if (practiceCount >= MIN_PRACTICE) return result.map((q) => q.id);

  const candidates = seededShuffle(
    all.filter((q) => q.isPractice && !result.some((r) => r.id === q.id) && !picked.has(q.id)),
    seed + "practice"
  );
  for (const cand of candidates) {
    if (practiceCount >= MIN_PRACTICE) break;
    const swapIndex = result.findIndex((q) => !q.isPractice);
    if (swapIndex === -1) break;
    result[swapIndex] = cand;
    picked.add(cand.id);
    practiceCount++;
  }
  return result.map((q) => q.id);
}

export { DAILY_SIZE, MIN_PRACTICE, WEAK_ACCURACY };
