import { describe, expect, it } from "vitest";
import { STAGES_DAYS, applyAnswer, isDue } from "./review";
import { dayStart } from "./storage";

const DAY_MS = 86400000;
const NOW = new Date(2026, 8, 22, 10, 30, 0).getTime();

describe("applyAnswer", () => {
  it("首次答对进入第 0 档，次日到期", () => {
    const s = applyAnswer(undefined, "q1", true, NOW);
    expect(s.questionId).toBe("q1");
    expect(s.stage).toBe(0);
    expect(s.nextReviewAt).toBe(dayStart(NOW) + STAGES_DAYS[0] * DAY_MS);
    expect(s.wrongCount).toBe(0);
  });

  it("连续答对逐档推进，封顶在最后一档", () => {
    let s = applyAnswer(undefined, "q1", true, NOW);
    for (let i = 0; i < STAGES_DAYS.length + 3; i++) s = applyAnswer(s, "q1", true, NOW);
    expect(s.stage).toBe(STAGES_DAYS.length - 1);
    expect(s.nextReviewAt).toBe(dayStart(NOW) + STAGES_DAYS[STAGES_DAYS.length - 1] * DAY_MS);
  });

  it("答错清零档位、累计错误次数，并回到第 1 天复习", () => {
    const twiceCorrect = applyAnswer(applyAnswer(undefined, "q1", true, NOW), "q1", true, NOW);
    expect(twiceCorrect.stage).toBe(1);

    const s = applyAnswer(twiceCorrect, "q1", false, NOW);
    expect(s.stage).toBe(0);
    expect(s.wrongCount).toBe(1);
    expect(s.nextReviewAt).toBe(dayStart(NOW) + STAGES_DAYS[0] * DAY_MS);
  });

  it("错误次数在多次答错时累加，不受答对影响", () => {
    let s = applyAnswer(undefined, "q1", false, NOW);
    s = applyAnswer(s, "q1", false, NOW);
    s = applyAnswer(s, "q1", true, NOW);
    expect(s.wrongCount).toBe(2);
  });
});

describe("isDue", () => {
  it("到期时间早于当前即视为到期", () => {
    expect(isDue({ questionId: "q1", stage: 0, nextReviewAt: NOW - 1, wrongCount: 0 }, NOW)).toBe(true);
  });

  it("恰好等于当前时间也算到期（边界）", () => {
    expect(isDue({ questionId: "q1", stage: 0, nextReviewAt: NOW, wrongCount: 0 }, NOW)).toBe(true);
  });

  it("未到期则为 false", () => {
    expect(isDue({ questionId: "q1", stage: 0, nextReviewAt: NOW + 1, wrongCount: 0 }, NOW)).toBe(false);
  });
});
