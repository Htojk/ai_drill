import type {
  AnswerRecord,
  DailyTask,
  MasteryState,
  ProgressPayload,
  Profile,
  QuestionReport,
  ReviewState
} from "../types";

/**
 * 两份进度的合并规则（纯函数，不碰存储也不碰网络）。
 *
 * 目标是「不丢用户的学习痕迹」而不是「精确复原某个时刻的状态」：
 * 答题记录、收藏、反馈取并集；复习节奏与熟练度取更新的那一份；
 * 只在一边发生的事一定保留下来。
 */

const recordKey = (r: AnswerRecord) => `${r.questionId}@${r.answeredAt}`;
const reportKey = (r: QuestionReport) => `${r.questionId}@${r.createdAt}`;

function unionBy<T>(a: T[], b: T[], key: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of a) map.set(key(item), item);
  for (const item of b) map.set(key(item), item);
  return [...map.values()];
}

/** 复习节奏：谁「更晚被复习过」就采信谁；同时刻则取推进更远的那份。 */
function laterReview(a?: ReviewState, b?: ReviewState): ReviewState | undefined {
  if (!a) return b;
  if (!b) return a;
  const at = a.lastReviewedAt ?? 0;
  const bt = b.lastReviewedAt ?? 0;
  if (at !== bt) return at > bt ? a : b;
  return (a.stage ?? 0) >= (b.stage ?? 0) ? a : b;
}

/** 熟练度：取更新时间更晚的；同一时刻优先用户手动选的那个。 */
function newerMastery(a?: MasteryState, b?: MasteryState): MasteryState | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return a.explicit ? a : b;
}

function mergeMaps<T>(
  a: Record<string, T>,
  b: Record<string, T>,
  pick: (left: T | undefined, right: T | undefined) => T | undefined
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const picked = pick(a[id], b[id]);
    if (picked !== undefined) out[id] = picked;
  }
  return out;
}

function mergeTasks(a: Record<string, DailyTask>, b: Record<string, DailyTask>): Record<string, DailyTask> {
  const out: Record<string, DailyTask> = {};
  for (const date of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const left = a[date];
    const right = b[date];
    if (!left || !right) {
      const only = left ?? right;
      if (only) out[date] = only;
      continue;
    }
    out[date] = {
      date,
      questionIds: [...new Set([...left.questionIds, ...right.questionIds])],
      completed: [...new Set([...left.completed, ...right.completed])]
    };
  }
  return out;
}

/** 画像：以答得更多的那份为底，再用另一份里「更靠前」的事实补齐。 */
function mergeProfile(a: Profile, b: Profile): Profile {
  const base = (a.totalAnswered ?? 0) >= (b.totalAnswered ?? 0) ? a : b;
  return {
    ...base,
    streak: Math.max(a.streak ?? 0, b.streak ?? 0),
    totalAnswered: Math.max(a.totalAnswered ?? 0, b.totalAnswered ?? 0),
    totalCorrect: Math.max(a.totalCorrect ?? 0, b.totalCorrect ?? 0),
    lastActiveDate: (a.lastActiveDate ?? "") >= (b.lastActiveDate ?? "") ? a.lastActiveDate : b.lastActiveDate,
    onboarded: Boolean(a.onboarded || b.onboarded)
  };
}

export function mergePayload(local: ProgressPayload, remote: ProgressPayload): ProgressPayload {
  return {
    records: unionBy(local.records, remote.records, recordKey).sort((x, y) => x.answeredAt - y.answeredAt),
    reports: unionBy(local.reports, remote.reports, reportKey).sort((x, y) => x.createdAt - y.createdAt),
    bookmarks: [...new Set([...local.bookmarks, ...remote.bookmarks])],
    reviews: mergeMaps(local.reviews, remote.reviews, laterReview),
    mastery: mergeMaps(local.mastery, remote.mastery, newerMastery),
    tasks: mergeTasks(local.tasks ?? {}, remote.tasks ?? {}),
    profile: mergeProfile(local.profile, remote.profile)
  };
}

/** 键顺序无关的规范化 JSON：对象键递归排序后再序列化。 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (!val || typeof val !== "object" || Array.isArray(val)) return val;
    return Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)));
  });
}

/** 两份进度是否等价（只看内容，不看字段书写顺序）。 */
export function isSamePayload(a: ProgressPayload, b: ProgressPayload): boolean {
  return canonical(a) === canonical(b);
}
