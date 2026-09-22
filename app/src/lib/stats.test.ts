import { describe, expect, it } from "vitest";
import { accuracyLevel, computeOverview } from "./stats";
import type { AnswerRecord, Question } from "../types";

function q(id: string, categories: string[]): Question {
  return {
    id,
    type: "single",
    isPractice: false,
    stem: "题干",
    options: [{ key: "A", content: "选项", isCorrect: true }],
    explanation: "解析",
    difficulty: 2,
    categories,
    tags: [],
    source: { type: "doc", title: "出处", url: "https://example.com", snippet: "片段" }
  };
}

function rec(questionId: string, isCorrect: boolean): AnswerRecord {
  return { questionId, chosen: ["A"], isCorrect, durationMs: 1000, mode: "daily", answeredAt: 0 };
}

describe("computeOverview", () => {
  it("没有记录时全为 0，且没有分类数据", () => {
    const o = computeOverview([], []);
    expect(o.total).toBe(0);
    expect(o.correct).toBe(0);
    expect(o.accuracy).toBe(0);
    expect(o.byCategory).toEqual([]);
  });

  it("同一题答对一次答错一次：总正确率与分类正确率都是 50%", () => {
    const o = computeOverview([rec("q1", true), rec("q1", false)], [q("q1", ["RAG"])]);
    expect(o.total).toBe(2);
    expect(o.correct).toBe(1);
    expect(o.accuracy).toBe(0.5);
    expect(o.byCategory).toEqual([{ category: "RAG", answered: 2, correct: 1, accuracy: 0.5 }]);
  });

  it("找不到对应题目时归入「未分类」", () => {
    const o = computeOverview([rec("ghost", true)], []);
    expect(o.byCategory[0].category).toBe("未分类");
    expect(o.byCategory[0].answered).toBe(1);
  });

  it("一道题挂多个分类时，每个分类各计一次", () => {
    const o = computeOverview([rec("q1", true)], [q("q1", ["本体与知识图谱", "RAG"])]);
    expect(o.byCategory.map((c) => c.category).sort()).toEqual(["RAG", "本体与知识图谱"].sort());
    expect(o.byCategory).toHaveLength(2);
    expect(o.total).toBe(1);
  });

  it("分类按答题数降序排列", () => {
    const questions = [q("q1", ["A类"]), q("q2", ["B类"])];
    const records = [rec("q1", true), rec("q2", true), rec("q2", false)];
    const o = computeOverview(records, questions);
    expect(o.byCategory.map((c) => c.category)).toEqual(["B类", "A类"]);
  });
});

describe("accuracyLevel", () => {
  it("按 0.8 / 0.6 分档", () => {
    expect(accuracyLevel(1)).toBe("ok");
    expect(accuracyLevel(0.8)).toBe("ok");
    expect(accuracyLevel(0.79)).toBe("warn");
    expect(accuracyLevel(0.6)).toBe("warn");
    expect(accuracyLevel(0.59)).toBe("bad");
    expect(accuracyLevel(0)).toBe("bad");
  });
});
