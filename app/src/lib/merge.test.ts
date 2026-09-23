import { describe, expect, it } from "vitest";
import { isSamePayload, mergePayload } from "./merge";
import type { AnswerRecord, DailyTask, MasteryState, ProgressPayload, ReviewState } from "../types";

const record = (id: string, at: number, correct = true): AnswerRecord => ({
  questionId: id,
  chosen: ["A"],
  isCorrect: correct,
  durationMs: 1000,
  mode: "daily",
  answeredAt: at
});

const review = (id: string, patch: Partial<ReviewState> = {}): ReviewState => ({
  questionId: id,
  stage: 1,
  nextReviewAt: 1,
  wrongCount: 0,
  ...patch
});

const mastery = (id: string, patch: Partial<MasteryState> = {}): MasteryState => ({
  questionId: id,
  level: "fuzzy",
  updatedAt: 1,
  explicit: false,
  ...patch
});

const task = (date: string, ids: string[], done: string[] = []): DailyTask => ({ date, questionIds: ids, completed: done });

function payload(patch: Partial<ProgressPayload> = {}): ProgressPayload {
  return {
    records: [],
    reviews: {},
    profile: { streak: 0, lastActiveDate: "", totalAnswered: 0, totalCorrect: 0, onboarded: false },
    bookmarks: [],
    reports: [],
    mastery: {},
    tasks: {},
    ...patch
  };
}

describe("mergePayload 取并集", () => {
  it("答题记录按 题目+时间 去重后按时间升序", () => {
    const local = payload({ records: [record("q1", 200)] });
    const remote = payload({ records: [record("q1", 100), record("q2", 300)] });
    const merged = mergePayload(local, remote);
    expect(merged.records.map((r) => `${r.questionId}@${r.answeredAt}`)).toEqual(["q1@100", "q1@200", "q2@300"]);
  });

  it("收藏并集去重，反馈按 题目+时间 去重", () => {
    const local = payload({ bookmarks: ["q1", "q2"], reports: [{ questionId: "q1", reason: "unclear", createdAt: 1 }] });
    const remote = payload({ bookmarks: ["q2", "q3"], reports: [{ questionId: "q1", reason: "other", createdAt: 2 }] });
    const merged = mergePayload(local, remote);
    expect(merged.bookmarks).toEqual(["q1", "q2", "q3"]);
    expect(merged.reports).toHaveLength(2);
  });

  it("当天任务合并：题目与已完成都取并集", () => {
    const local = payload({ tasks: { "2026-09-23": task("2026-09-23", ["q1", "q2"], ["q1"]) } });
    const remote = payload({ tasks: { "2026-09-23": task("2026-09-23", ["q2", "q3"], ["q3"]) } });
    const merged = mergePayload(local, remote).tasks["2026-09-23"];
    expect(merged.questionIds).toEqual(["q1", "q2", "q3"]);
    expect(merged.completed).toEqual(["q1", "q3"]);
  });
});

describe("mergePayload 取更新的一份", () => {
  it("复习节奏取更晚复习过的那份；同刻取推进更远的", () => {
    const local = payload({ reviews: { q1: review("q1", { lastReviewedAt: 100, stage: 5 }) } });
    const remote = payload({ reviews: { q1: review("q1", { lastReviewedAt: 200, stage: 2 }) } });
    expect(mergePayload(local, remote).reviews.q1.stage).toBe(2);

    const sameTime = payload({ reviews: { q1: review("q1", { lastReviewedAt: 100, stage: 3 }) } });
    const other = payload({ reviews: { q1: review("q1", { lastReviewedAt: 100, stage: 1 }) } });
    expect(mergePayload(sameTime, other).reviews.q1.stage).toBe(3);
  });

  it("熟练度取更新时间更晚的；同一时刻优先用户手动选的", () => {
    const local = payload({ mastery: { q1: mastery("q1", { level: "mastered", updatedAt: 50 }) } });
    const remote = payload({ mastery: { q1: mastery("q1", { level: "unknown", updatedAt: 90 }) } });
    expect(mergePayload(local, remote).mastery.q1.level).toBe("unknown");

    const manual = payload({ mastery: { q1: mastery("q1", { level: "fuzzy", updatedAt: 90, explicit: true }) } });
    const auto = payload({ mastery: { q1: mastery("q1", { level: "unknown", updatedAt: 90 }) } });
    expect(mergePayload(auto, manual).mastery.q1.level).toBe("fuzzy");
  });

  it("画像取更乐观的事实：累计取大、连续天数取大、最近活跃取更晚", () => {
    const local = payload({ profile: { streak: 2, lastActiveDate: "2026-09-22", totalAnswered: 30, totalCorrect: 20, onboarded: true } });
    const remote = payload({ profile: { streak: 5, lastActiveDate: "2026-09-20", totalAnswered: 10, totalCorrect: 9, onboarded: false } });
    const merged = mergePayload(local, remote).profile;
    expect(merged.totalAnswered).toBe(30);
    expect(merged.lastActiveDate).toBe("2026-09-22");
    expect(merged.streak).toBe(5);
    expect(merged.onboarded).toBe(true);
  });
});

describe("合并的边界", () => {
  it("一边为空就是另一边原样", () => {
    const filled = payload({ records: [record("q1", 1)], bookmarks: ["q1"] });
    const merged = mergePayload(payload(), filled);
    expect(merged.records).toHaveLength(1);
    expect(merged.bookmarks).toEqual(["q1"]);
  });

  it("同一份数据合并后不变（幂等，避免无意义的覆盖写）", () => {
    const one = payload({ records: [record("q1", 1), record("q1", 2)], bookmarks: ["q1"] });
    expect(isSamePayload(mergePayload(one, one), one)).toBe(true);
  });

  it("老数据缺 tasks 字段也不会炸", () => {
    const legacy = { ...payload(), tasks: undefined as unknown as Record<string, DailyTask> };
    expect(mergePayload(legacy, payload()).tasks).toEqual({});
  });
});
