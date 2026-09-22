import { describe, expect, it } from "vitest";
import {
  BASE_INTERVALS,
  DUE_RETENTION,
  applyAnswer,
  byMostForgotten,
  daysUntilDue,
  intervalsFor,
  isDue,
  retention
} from "./ebbinghaus";
import { dayStart } from "./storage";

const DAY_MS = 86400000;
const NOW = new Date(2026, 8, 22, 10, 30, 0).getTime();
const state = (over: Partial<Parameters<typeof retention>[0]> = {}) => ({
  questionId: "q1",
  stage: 0,
  nextReviewAt: NOW,
  wrongCount: 0,
  ...over
});

describe("intervalsFor", () => {
  it("模糊档就是基准曲线（艾宾浩斯节点）", () => {
    expect(intervalsFor("fuzzy")).toEqual(BASE_INTERVALS);
  });

  it("已掌握拉长间隔、未掌握压缩间隔，且不短于 1 天", () => {
    const mastered = intervalsFor("mastered");
    const unknown = intervalsFor("unknown");
    // 第 0 档被「最短 1 天」兜底夹住（日频产品无法比天更细），所以从第 2 档起比
    expect(mastered[2]).toBeGreaterThan(BASE_INTERVALS[2]);
    expect(unknown[2]).toBeLessThan(BASE_INTERVALS[2]);
    expect(Math.min(...unknown)).toBeGreaterThanOrEqual(1);
  });
});

describe("retention", () => {
  it("刚复习完保持率接近 1", () => {
    expect(retention(state({ lastReviewedAt: NOW, intervalDays: 10 }), NOW)).toBeCloseTo(1, 5);
  });

  it("随时间指数衰减，一个稳定度周期后约为 1/e", () => {
    const r = retention(state({ lastReviewedAt: NOW, intervalDays: 10 }), NOW + 10 * DAY_MS);
    expect(r).toBeCloseTo(Math.exp(-1), 3);
  });

  it("没有记录时保持率为 0（没练过就谈不上遗忘）", () => {
    expect(retention(undefined, NOW)).toBe(0);
  });
});

describe("applyAnswer", () => {
  it("首次答对进入第 0 档，按当日零点 + 间隔排期", () => {
    const s = applyAnswer(undefined, "q1", true, NOW, "fuzzy");
    expect(s.stage).toBe(0);
    expect(s.intervalDays).toBe(BASE_INTERVALS[0]);
    expect(s.nextReviewAt).toBe(dayStart(NOW) + BASE_INTERVALS[0] * DAY_MS);
    expect(s.lastReviewedAt).toBe(NOW);
    expect(s.streakCorrect).toBe(1);
    expect(s.wrongCount).toBe(0);
  });

  it("连续答对逐档推进并封顶在最后一档", () => {
    let s = applyAnswer(undefined, "q1", true, NOW, "fuzzy");
    for (let i = 0; i < BASE_INTERVALS.length + 3; i++) s = applyAnswer(s, "q1", true, NOW, "fuzzy");
    expect(s.stage).toBe(BASE_INTERVALS.length - 1);
    expect(s.nextReviewAt).toBe(dayStart(NOW) + BASE_INTERVALS[BASE_INTERVALS.length - 1] * DAY_MS);
    expect(s.streakCorrect).toBe(BASE_INTERVALS.length + 4);
  });

  it("答错清零档位、累计错误次数，并回到第 1 天量级复习", () => {
    const twice = applyAnswer(applyAnswer(undefined, "q1", true, NOW, "fuzzy"), "q1", true, NOW, "fuzzy");
    expect(twice.stage).toBe(1);

    const s = applyAnswer(twice, "q1", false, NOW, "fuzzy");
    expect(s.stage).toBe(0);
    expect(s.wrongCount).toBe(1);
    expect(s.streakCorrect).toBe(0);
    expect(s.nextReviewAt).toBe(dayStart(NOW) + BASE_INTERVALS[0] * DAY_MS);
  });

  it("熟练度自评直接改变排期间隔：已掌握 > 模糊 > 未掌握", () => {
    // 推进到第 2 档再比，避开「最短 1 天」兜底的夹取区间
    const at = (m: "mastered" | "fuzzy" | "unknown") => {
      let s = applyAnswer(undefined, "q1", true, NOW, m);
      s = applyAnswer(s, "q1", true, NOW, m);
      s = applyAnswer(s, "q1", true, NOW, m);
      return s.nextReviewAt;
    };
    expect(at("mastered")).toBeGreaterThan(at("fuzzy"));
    expect(at("fuzzy")).toBeGreaterThan(at("unknown"));
  });

  it("错误次数在多次答错时累加，不受答对影响", () => {
    let s = applyAnswer(undefined, "q1", false, NOW, "fuzzy");
    s = applyAnswer(s, "q1", false, NOW, "fuzzy");
    s = applyAnswer(s, "q1", true, NOW, "fuzzy");
    expect(s.wrongCount).toBe(2);
  });
});

describe("isDue", () => {
  it("过了排定时间即到期", () => {
    expect(isDue(state({ nextReviewAt: NOW - 1, lastReviewedAt: NOW - 2 * DAY_MS, intervalDays: 1 }), NOW)).toBe(true);
  });

  it("恰好等于当前时间也算到期（边界）", () => {
    expect(isDue(state({ nextReviewAt: NOW }), NOW)).toBe(true);
  });

  it("未到排定时间但保持率已跌破阈值，同样算到期", () => {
    const s = state({ nextReviewAt: NOW + 5 * DAY_MS, lastReviewedAt: NOW - 3 * DAY_MS, intervalDays: 1 });
    expect(retention(s, NOW)).toBeLessThan(DUE_RETENTION);
    expect(isDue(s, NOW)).toBe(true);
  });

  it("刚复习完且未到时间则不算到期", () => {
    const s = state({ nextReviewAt: NOW + DAY_MS, lastReviewedAt: NOW, intervalDays: 7 });
    expect(isDue(s, NOW)).toBe(false);
  });
});

describe("byMostForgotten", () => {
  it("忘得最狠的排最前", () => {
    const fresh = state({ questionId: "fresh", lastReviewedAt: NOW, intervalDays: 30 });
    const stale = state({ questionId: "stale", lastReviewedAt: NOW - 20 * DAY_MS, intervalDays: 5 });
    expect([fresh, stale].sort(byMostForgotten(NOW)).map((s) => s.questionId)).toEqual(["stale", "fresh"]);
  });
});

describe("daysUntilDue", () => {
  it("向上取整，逾期为负或零", () => {
    expect(daysUntilDue(state({ nextReviewAt: NOW + 3 * DAY_MS }), NOW)).toBe(3);
    expect(daysUntilDue(state({ nextReviewAt: NOW - DAY_MS }), NOW)).toBeLessThanOrEqual(0);
  });
});
