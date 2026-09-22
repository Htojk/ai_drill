import { describe, expect, it } from "vitest";
import { DAILY_SIZE, QUOTA, buildDailyTask } from "./recommend";
import type { AnswerRecord, Profile, Question, ReviewState } from "../types";

const NOW = new Date(2026, 8, 22, 10, 0, 0).getTime();
const DAY_MS = 86400000;

const q = (id: string, over: Partial<Question> = {}): Question => ({
  id,
  type: "single",
  isPractice: false,
  stem: `题干 ${id}`,
  options: [
    { key: "A", content: "对", isCorrect: true },
    { key: "B", content: "错", isCorrect: false, wrongReason: "错因" }
  ],
  explanation: "解析",
  difficulty: 3,
  categories: ["RAG"],
  tags: ["t"],
  source: { type: "doc", title: "t", url: "https://x.com", snippet: "s" },
  ...over
});

const ONBOARDED: Profile = {
  streak: 3,
  lastActiveDate: "2026-09-21",
  totalAnswered: 40,
  totalCorrect: 30,
  onboarded: true
};

const record = (questionId: string, over: Partial<AnswerRecord> = {}): AnswerRecord => ({
  questionId,
  chosen: ["A"],
  isCorrect: true,
  durationMs: 1000,
  mode: "daily",
  answeredAt: NOW - 1 * DAY_MS,
  ...over
});

/** 造一批题目：10 道做过（有复习记录）+ 30 道全新 */
function fixture() {
  const questions = [
    ...Array.from({ length: 10 }, (_, i) => q(`old${i}`, { isPractice: true })),
    ...Array.from({ length: 30 }, (_, i) => q(`new${i}`))
  ];
  const records = questions.slice(0, 10).map((x) => record(x.id));
  return { questions, records };
}

describe("buildDailyTask", () => {
  it("永远凑满 DAILY_SIZE 且不重复", () => {
    const { questions, records } = fixture();
    const ids = buildDailyTask({ questions, records, reviews: {}, profile: ONBOARDED, now: NOW });
    expect(ids).toHaveLength(DAILY_SIZE);
    expect(new Set(ids).size).toBe(DAILY_SIZE);
  });

  it("没有复习记录时全部给新题（新用户也能凑满）", () => {
    const questions = Array.from({ length: 20 }, (_, i) => q(`n${i}`));
    const ids = buildDailyTask({ questions, records: [], reviews: {}, profile: { ...ONBOARDED, onboarded: false }, now: NOW });
    expect(ids).toHaveLength(DAILY_SIZE);
    expect(new Set(ids).size).toBe(DAILY_SIZE);
  });

  it("到期复习优先：忘得最狠的先出现", () => {
    const { questions, records } = fixture();
    const reviews: Record<string, ReviewState> = {
      old0: { questionId: "old0", stage: 0, nextReviewAt: NOW - 1, wrongCount: 0, lastReviewedAt: NOW - 30 * DAY_MS, intervalDays: 1 },
      old1: { questionId: "old1", stage: 0, nextReviewAt: NOW - 1, wrongCount: 0, lastReviewedAt: NOW - 1 * DAY_MS, intervalDays: 10 }
    };
    const ids = buildDailyTask({ questions, records, reviews, profile: ONBOARDED, now: NOW });
    // 保持率更低的 old0 应该排在 old1 之前
    expect(ids.indexOf("old0")).toBeLessThan(ids.indexOf("old1"));
    expect(ids.indexOf("old0")).toBeLessThan(QUOTA.due);
  });

  it("未掌握/模糊的题会被拉回来复习", () => {
    const { questions, records } = fixture();
    const mastery = { old3: { questionId: "old3", level: "unknown" as const, updatedAt: NOW, explicit: true } };
    const ids = buildDailyTask({ questions, records, reviews: {}, profile: ONBOARDED, mastery, now: NOW });
    expect(ids).toContain("old3");
  });

  it("同一天多次计算结果一致（确定性）", () => {
    const { questions, records } = fixture();
    const input = { questions, records, reviews: {}, profile: ONBOARDED, now: NOW };
    expect(buildDailyTask(input)).toEqual(buildDailyTask(input));
  });

  it("当日工程判断题不少于 3 道", () => {
    // 只有 4 道工程判断题，且分布在全新课里，考验配额顺延
    const questions = [
      ...Array.from({ length: 6 }, (_, i) => q(`p${i}`, { isPractice: true })),
      ...Array.from({ length: 24 }, (_, i) => q(`n${i}`))
    ];
    const ids = buildDailyTask({ questions, records: [], reviews: {}, profile: ONBOARDED, now: NOW });
    const practiceCount = ids.filter((id) => questions.find((x) => x.id === id)?.isPractice).length;
    expect(practiceCount).toBeGreaterThanOrEqual(3);
  });

  it("题库比 DAILY_SIZE 小时也能返回（不重复、不补假题）", () => {
    const questions = [q("a"), q("b")];
    const ids = buildDailyTask({ questions, records: [], reviews: {}, profile: ONBOARDED, now: NOW });
    expect(ids).toEqual(["a", "b"]);
  });
});
