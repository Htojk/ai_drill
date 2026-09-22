import type { AnswerRecord, MasteryState, Profile, Question, ReviewState } from "../types";
import { isDue, retention } from "./ebbinghaus";

export const DAILY_SIZE = 10;
const MIN_PRACTICE = 3;
const RECENT_DAYS = 14;
const WEAK_ACCURACY = 0.6;
const WEAK_MIN_ANSWERED = 3;
const DAY_MS = 86400000;

// 每日配额：复习优先（艾宾浩斯：忘得越狠越先做），新题固定占一小半。
// 复习不足时用新题顺延，新题不足时用旧题顺延，最后一定凑满 DAILY_SIZE。
const QUOTA = { due: 5, fresh: 3, weak: 1, challenge: 1 };

export interface RecommendInput {
  questions: Question[];
  records: AnswerRecord[];
  reviews: Record<string, ReviewState>;
  profile: Profile;
  mastery?: Record<string, MasteryState>;
  now?: number;
}

// 用日期做种子的确定性随机，保证同一天多次计算结果一致
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
 * 每日推荐：艾宾浩斯遗忘曲线驱动。
 *
 * 排序依据是「记忆保持率」R = e^(-Δt/S)，忘得最狠的排最前；
 * 配额为 复习 5 + 新题 3 + 薄弱分类 1 + 挑战 1，缺哪类就顺延给别的池子，
 * 保证凑满 DAILY_SIZE 且当日工程判断题不少于 MIN_PRACTICE。
 */
export function buildDailyTask(input: RecommendInput): string[] {
  const { questions, records, reviews, profile, mastery = {} } = input;
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

  // 新用户：先做一次均匀摸底，避免一上来就被同一分类淹没
  if (!profile.onboarded || records.length === 0) {
    const byCategory = new Map<string, Question[]>();
    questions.forEach((q) => {
      const cat = q.categories[0] ?? "未分类";
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(q);
    });
    const buckets = seededShuffle([...byCategory.values()], dayKey).map((list) =>
      seededShuffle(list, dayKey + (list[0]?.id ?? ""))
    );
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

  const byId = new Map(questions.map((q) => [q.id, q]));

  // 分类正确率 → 薄弱分类
  const stat = new Map<string, { answered: number; correct: number }>();
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

  // 复习池：到期 / 保持率跌破阈值的旧题，忘得最狠的排最前
  const dueList = Object.values(reviews)
    .filter((s) => isDue(s, now))
    .sort((a, b) => retention(a, now) - retention(b, now))
    .map((s) => byId.get(s.questionId))
    .filter((q): q is Question => !!q);

  // 未掌握/模糊的题优先回炉。
  // 注意：用户显式标了「未掌握」的题不受「14 天内不重复」限制 ——
  // 自评比时间窗更能说明「这题我还不会」。
  const shakyList = seededShuffle(
    questions.filter((q) => {
      const state = mastery[q.id];
      if (!state || state.level === "mastered" || !answeredIds.has(q.id)) return false;
      return state.level === "unknown" && state.explicit ? true : !isRecent(q.id);
    }),
    dayKey + "shaky"
  );

  const freshList = seededShuffle(
    questions.filter((q) => !answeredIds.has(q.id)),
    dayKey
  );

  const weakList = seededShuffle(
    questions.filter((q) => q.categories.some((c) => weakCategories.includes(c)) && !isRecent(q.id)),
    dayKey + "weak"
  );

  const challengeList = seededShuffle(
    questions.filter((q) => q.difficulty >= 4 && !isRecent(q.id)),
    dayKey + "challenge"
  );

  // 兜底池：任何还没选的题（含刚做过的，宁可比空着强）
  const fallbackList = seededShuffle(questions.filter((q) => !isRecent(q.id)), dayKey + "fallback");
  const anyList = seededShuffle(questions, dayKey + "any");

  chosen.push(...take(dueList, QUOTA.due, picked, (q) => q.id));
  chosen.push(...take(shakyList, QUOTA.due - chosen.length, picked, (q) => q.id));
  chosen.push(...take(freshList, QUOTA.fresh, picked, (q) => q.id));
  chosen.push(...take(weakList, QUOTA.weak, picked, (q) => q.id));
  chosen.push(...take(challengeList, QUOTA.challenge, picked, (q) => q.id));
  chosen.push(...take(fallbackList, DAILY_SIZE - chosen.length, picked, (q) => q.id));
  if (chosen.length < DAILY_SIZE) {
    chosen.push(...take(anyList, DAILY_SIZE - chosen.length, picked, (q) => q.id));
  }

  return enforcePractice(chosen.slice(0, DAILY_SIZE), questions, picked, dayKey);
}

/** 保证当日工程判断题不少于 MIN_PRACTICE 道 */
function enforcePractice(chosen: Question[], all: Question[], picked: Set<string>, seed: string): string[] {
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

export { QUOTA, MIN_PRACTICE, WEAK_ACCURACY };
