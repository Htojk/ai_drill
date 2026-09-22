import { describe, expect, it } from "vitest";
import { MASTERY_FACTOR, MASTERY_LABELS, inferMastery, levelOf, resolveMastery } from "./mastery";

describe("inferMastery", () => {
  it("选择题答对=已掌握、答错=未掌握", () => {
    expect(inferMastery({ isCorrect: true })).toBe("mastered");
    expect(inferMastery({ isCorrect: false })).toBe("unknown");
  });

  it("看了答案一律未掌握，即使随后选对", () => {
    expect(inferMastery({ isCorrect: true, viewedAnswer: true })).toBe("unknown");
  });

  it("简答批阅结果决定档位：对/部分/错", () => {
    expect(inferMastery({ isCorrect: false, verdict: "correct" })).toBe("mastered");
    expect(inferMastery({ isCorrect: false, verdict: "partial" })).toBe("fuzzy");
    expect(inferMastery({ isCorrect: true, verdict: "wrong" })).toBe("unknown");
  });
});

describe("resolveMastery", () => {
  const auto = (level: "mastered" | "fuzzy" | "unknown", updatedAt: number) => ({ level, explicit: false, updatedAt });
  const manual = (level: "mastered" | "fuzzy" | "unknown", updatedAt: number) => ({ level, explicit: true, updatedAt });

  it("首次写入直接采用", () => {
    expect(resolveMastery(undefined, "q1", auto("fuzzy", 1)).level).toBe("fuzzy");
  });

  it("用户的显式自评不会被之后的自动推断覆盖", () => {
    const prev = resolveMastery(undefined, "q1", manual("mastered", 100));
    const next = resolveMastery(prev, "q1", auto("unknown", 200));
    expect(next.level).toBe("mastered");
    expect(next.explicit).toBe(true);
  });

  it("用户后来显式改了，就以显式为准", () => {
    const prev = resolveMastery(undefined, "q1", auto("mastered", 100));
    expect(resolveMastery(prev, "q1", manual("fuzzy", 200)).level).toBe("fuzzy");
  });

  it("同为自动推断时取更晚的一次", () => {
    const prev = resolveMastery(undefined, "q1", auto("mastered", 200));
    expect(resolveMastery(prev, "q1", auto("unknown", 100)).level).toBe("mastered");
    expect(resolveMastery(prev, "q1", auto("unknown", 300)).level).toBe("unknown");
  });
});

describe("常量与取值", () => {
  it("三档都有中文标签，倍率递减", () => {
    expect(MASTERY_LABELS.mastered).toBe("已掌握");
    expect(MASTERY_FACTOR.mastered).toBeGreaterThan(MASTERY_FACTOR.fuzzy);
    expect(MASTERY_FACTOR.fuzzy).toBeGreaterThan(MASTERY_FACTOR.unknown);
  });

  it("没练过的题按未掌握算", () => {
    expect(levelOf({}, "没练过")).toBe("unknown");
    expect(levelOf({ q1: { questionId: "q1", level: "mastered", updatedAt: 1, explicit: true } }, "q1")).toBe("mastered");
  });
});
