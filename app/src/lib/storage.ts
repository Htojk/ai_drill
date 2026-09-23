import type {
  AnswerRecord,
  DailyTask,
  MasteryState,
  Profile,
  ProgressPayload,
  QuestionReport,
  ReviewState
} from "../types";

const K = {
  records: "aq.records.v1",
  reviews: "aq.reviews.v1",
  profile: "aq.profile.v1",
  taskPrefix: "aq.task.v1.",
  bookmarks: "aq.bookmarks.v1",
  reports: "aq.reports.v1",
  mastery: "aq.mastery.v1"
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 存储满或隐私模式，忽略 */
  }
}

export function todayStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dayStart(ts: number = Date.now()): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function loadRecords(): AnswerRecord[] {
  return read<AnswerRecord[]>(K.records, []);
}

export function appendRecord(record: AnswerRecord): void {
  const all = loadRecords();
  all.push(record);
  write(K.records, all);
}

export function loadReviews(): Record<string, ReviewState> {
  return read<Record<string, ReviewState>>(K.reviews, {});
}

export function saveReviews(reviews: Record<string, ReviewState>): void {
  write(K.reviews, reviews);
}

export function loadProfile(): Profile {
  return read<Profile>(K.profile, {
    streak: 0,
    lastActiveDate: "",
    totalAnswered: 0,
    totalCorrect: 0,
    onboarded: false
  });
}

export function saveProfile(profile: Profile): void {
  write(K.profile, profile);
}

export function loadTask(date: string): DailyTask | null {
  return read<DailyTask | null>(K.taskPrefix + date, null);
}

export function saveTask(task: DailyTask): void {
  write(K.taskPrefix + task.date, task);
}

export function loadBookmarks(): string[] {
  return read<string[]>(K.bookmarks, []);
}

export function toggleBookmark(questionId: string): string[] {
  const list = loadBookmarks();
  const next = list.includes(questionId)
    ? list.filter((id) => id !== questionId)
    : [...list, questionId];
  write(K.bookmarks, next);
  return next;
}

export function loadReports(): QuestionReport[] {
  return read<QuestionReport[]>(K.reports, []);
}

export function appendReport(report: QuestionReport): void {
  const all = loadReports();
  all.push(report);
  write(K.reports, all);
}

/* ---------------- 熟练度自评 ---------------- */

export function loadMastery(): Record<string, MasteryState> {
  return read<Record<string, MasteryState>>(K.mastery, {});
}

export function saveMastery(mastery: Record<string, MasteryState>): void {
  write(K.mastery, mastery);
}

/* ---------------- 整包读写（同步与导出码共用同一份形状） ---------------- */

/** 扫出所有「按日期存放」的当天任务，同步时要用。 */
export function loadTasks(): Record<string, DailyTask> {
  const out: Record<string, DailyTask> = {};
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(K.taskPrefix)) continue;
      const task = read<DailyTask | null>(key, null);
      if (task && Array.isArray(task.questionIds)) out[key.slice(K.taskPrefix.length)] = task;
    }
  } catch {
    /* 隐私模式下读不到，当作没有历史任务 */
  }
  return out;
}

/** 读出本机整包进度。同步、导出码、重置都走这里，避免几处各读一遍读岔。 */
export function readAll(): ProgressPayload {
  return {
    records: loadRecords(),
    reviews: loadReviews(),
    profile: loadProfile(),
    bookmarks: loadBookmarks(),
    reports: loadReports(),
    mastery: loadMastery(),
    tasks: loadTasks()
  };
}

/**
 * 覆盖写整包进度。
 * 只写「显式给了」的字段——老版本导出码缺失字段时不应该把本机数据抹掉。
 */
export function writeAll(payload: Partial<ProgressPayload>): void {
  if (payload.records) write(K.records, payload.records);
  if (payload.reviews) write(K.reviews, payload.reviews);
  if (payload.profile && payload.profile.lastActiveDate !== undefined) write(K.profile, payload.profile);
  if (payload.bookmarks) write(K.bookmarks, payload.bookmarks);
  if (payload.reports) write(K.reports, payload.reports);
  if (payload.mastery) write(K.mastery, payload.mastery);
  if (payload.tasks) {
    for (const [date, task] of Object.entries(payload.tasks)) {
      if (task) write(K.taskPrefix + date, { ...task, date });
    }
  }
}

export interface ProgressBundle extends ProgressPayload {
  version: 1;
  exportedAt: number;
}

export function exportProgress(): string {
  const bundle: ProgressBundle = {
    version: 1,
    exportedAt: Date.now(),
    ...readAll()
  };
  // 刻意不带 agent 配置：进度码会明文/加密导出，API key 不该跟着到处跑
  return btoa(unescape(encodeURIComponent(JSON.stringify(bundle))));
}

export function importProgress(code: string): { ok: boolean; message: string } {
  try {
    const parsed = JSON.parse(decodeURIComponent(escape(atob(code.trim())))) as ProgressBundle;
    if (parsed.version !== 1) return { ok: false, message: "进度码版本不匹配" };
    writeAll(parsed);
    return { ok: true, message: `已导入 ${parsed.records?.length ?? 0} 条答题记录` };
  } catch {
    return { ok: false, message: "进度码格式不正确" };
  }
}

export function resetProgress(): void {
  Object.keys(K).forEach((k) => {
    if (k === "taskPrefix") {
      Object.keys(localStorage)
        .filter((key) => key.startsWith(K.taskPrefix))
        .forEach((key) => localStorage.removeItem(key));
    }
  });
  localStorage.removeItem(K.records);
  localStorage.removeItem(K.reviews);
  localStorage.removeItem(K.profile);
  localStorage.removeItem(K.bookmarks);
  localStorage.removeItem(K.reports);
  localStorage.removeItem(K.mastery);
  // agent 配置（含 API key）故意保留：清空学习进度不等于要重新填一次 key
}
