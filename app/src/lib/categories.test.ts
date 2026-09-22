import { describe, expect, it } from "vitest";
import type { AnswerRecord, Question } from "../types";
import {
  computeCategoryProgress,
  latestByQuestion,
  listCategories,
  pickCategoryQuestions,
  questionsOfCategory
} from "./categories";

function q(id: string, categories: string[]): Question {
  return {
    id,
    type: "single",
    isPractice: false,
    stem: id,
    options: [{ key: "A", content: "a", isCorrect: true }],
    explanation: "",
    difficulty: 2,
    categories,
    tags: [],
    source: { type: "doc", title: "t", url: "https://example.com", snippet: "" }
  };
}

function rec(questionId: string, isCorrect: boolean, answeredAt: number): AnswerRecord {
  return { questionId, chosen: ["A"], isCorrect, durationMs: 1000, mode: "practice", answeredAt };
}

const QUESTIONS: Question[] = [
  q("q1", ["RAG"]),
  q("q2", ["RAG", "工程与部署"]),
  q("q3", ["Agent"]),
  q("q4", ["RAG"])
];

describe("listCategories", () => {
  it("按题库出现顺序列出分类且不重复", () => {
    expect(listCategories(QUESTIONS)).toEqual(["RAG", "工程与部署", "Agent"]);
  });

  it("题库为空时返回空数组", () => {
    expect(listCategories([])).toEqual([]);
  });
});

describe("questionsOfCategory", () => {
  it("多分类题目会同时出现在两个分类里", () => {
    expect(questionsOfCategory("RAG", QUESTIONS).map((x) => x.id)).toEqual(["q1", "q2", "q4"]);
    expect(questionsOfCategory("工程与部署", QUESTIONS).map((x) => x.id)).toEqual(["q2"]);
  });
});

describe("latestByQuestion", () => {
  it("同一题只保留最近一次作答", () => {
    const latest = latestByQuestion([rec("q1", false, 100), rec("q1", true, 200)]);
    expect(latest.size).toBe(1);
    expect(latest.get("q1")?.isCorrect).toBe(true);
  });

  it("时间戳相同时保留后写入的那条", () => {
    const latest = latestByQuestion([rec("q1", true, 100), rec("q1", false, 100)]);
    expect(latest.get("q1")?.isCorrect).toBe(false);
  });
});

describe("computeCategoryProgress", () => {
  const records = [rec("q1", false, 100), rec("q1", true, 200), rec("q2", false, 300)];

  it("按最近一次作答统计已练、答错与正确率", () => {
    const progress = computeCategoryProgress(QUESTIONS, records);
    const rag = progress.find((p) => p.category === "RAG");
    expect(rag).toEqual({ category: "RAG", total: 3, seen: 2, wrong: 1, accuracy: 0.5 });
  });

  it("没做过的分类也在列表里，正确率为 0", () => {
    const agent = computeCategoryProgress(QUESTIONS, records).find((p) => p.category === "Agent");
    expect(agent).toEqual({ category: "Agent", total: 1, seen: 0, wrong: 0, accuracy: 0 });
  });

  it("多分类题的作答会被两个分类各记一次", () => {
    const eng = computeCategoryProgress(QUESTIONS, records).find((p) => p.category === "工程与部署");
    expect(eng).toEqual({ category: "工程与部署", total: 1, seen: 1, wrong: 1, accuracy: 0 });
  });
});

describe("pickCategoryQuestions", () => {
  it("顺序为：没做过 → 最近做错 → 已做对", () => {
    const records = [rec("q4", false, 100), rec("q1", true, 200)];
    expect(pickCategoryQuestions("RAG", QUESTIONS, records)).toEqual(["q2", "q4", "q1"]);
  });

  it("按 size 截断", () => {
    const records = [rec("q4", false, 100)];
    expect(pickCategoryQuestions("RAG", QUESTIONS, records, 2)).toEqual(["q1", "q2"]);
  });

  it("未知分类返回空数组", () => {
    expect(pickCategoryQuestions("不存在的分类", QUESTIONS, [])).toEqual([]);
  });
});
