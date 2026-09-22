import type { AnswerRecord, DailyTask, Profile, QuestionReport, ReviewState } from "../types";

const K = {
  records: "aq.records.v1",
  reviews: "aq.reviews.v1",
  profile: "aq.profile.v1",
  taskPrefix: "aq.task.v1.",
  bookmarks: "aq.bookmarks.v1",
  reports: "aq.reports.v1"
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

export interface ProgressBundle {
  version: 1;
  exportedAt: number;
  records: AnswerRecord[];
  reviews: Record<string, ReviewState>;
  profile: Profile;
  bookmarks: string[];
  reports: QuestionReport[];
}

export function exportProgress(): string {
  const bundle: ProgressBundle = {
    version: 1,
    exportedAt: Date.now(),
    records: loadRecords(),
    reviews: loadReviews(),
    profile: loadProfile(),
    bookmarks: loadBookmarks(),
    reports: loadReports()
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(bundle))));
}

export function importProgress(code: string): { ok: boolean; message: string } {
  try {
    const parsed = JSON.parse(decodeURIComponent(escape(atob(code.trim())))) as ProgressBundle;
    if (parsed.version !== 1) return { ok: false, message: "进度码版本不匹配" };
    write(K.records, parsed.records ?? []);
    write(K.reviews, parsed.reviews ?? {});
    write(K.profile, parsed.profile ?? {});
    write(K.bookmarks, parsed.bookmarks ?? []);
    write(K.reports, parsed.reports ?? []);
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
}
