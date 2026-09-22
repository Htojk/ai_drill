import { describe, expect, it } from "vitest";
import { coverage, gradeLocally, tokens } from "./grading";
import { QUESTIONS } from "../data/questions";
import { correctAnswerLabel } from "./question-kind";
import type { Question } from "../types";

const SHORT: Question = {
  id: "q_short_1",
  type: "short",
  isPractice: true,
  stem: "RAG 里为什么要做重排序？",
  options: [],
  keyPoints: [
    "向量检索的相似度只反映语义接近，不保证与问题真正相关",
    "重排序用更强的模型对候选做精排，把相关文档提到前面"
  ],
  referenceAnswer:
    "向量召回只保证语义接近，重排序用更强的交叉编码器对候选精排，把真正相关的文档提到 top-k。",
  explanation: "召回保量、重排保质的经典分工。",
  difficulty: 3,
  categories: ["RAG"],
  tags: ["简答"],
  source: { type: "doc", title: "t", url: "https://x.com", snippet: "s" }
};

describe("tokens", () => {
  it("中文按相邻二字切分，忽略标点空白", () => {
    expect([...tokens("语义 接近")].sort()).toEqual(["义接", "接近", "语义"].sort());
  });

  it("纯英文按单词切分并小写", () => {
    expect([...tokens("Rerank Is Better")].sort()).toEqual(["better", "is", "rerank"]);
  });
});

describe("coverage", () => {
  it("完全一致为 1，完全无关为 0", () => {
    expect(coverage("语义接近", "语义接近")).toBe(1);
    expect(coverage("语义接近", "完全无关的内容")).toBeLessThan(0.5);
  });

  it("容忍语序与措辞差异", () => {
    expect(coverage("用更强的模型精排候选", "候选由更强的模型再做一次精排")).toBeGreaterThan(0.5);
  });
});

describe("gradeLocally", () => {
  it("空作答判为 blank，并给出可操作的引导", () => {
    const g = gradeLocally(SHORT, "   ");
    expect(g.verdict).toBe("blank");
    expect(g.score).toBe(0);
    expect(g.missedPoints).toHaveLength(2);
    expect(g.by).toBe("local");
  });

  it("要点齐全判为 correct（80 分以上）", () => {
    const answer = "向量检索的相似度只反映语义接近，不保证与问题真正相关；重排序用更强的模型对候选做精排，把相关文档提到前面。";
    const g = gradeLocally(SHORT, answer);
    expect(g.verdict).toBe("correct");
    expect(g.score).toBe(100);
    expect(g.missedPoints).toEqual([]);
    expect(g.comment).toContain("要点基本齐全");
  });

  it("只答对一半判为 partial，并列出漏掉的要点", () => {
    const g = gradeLocally(SHORT, "向量检索的相似度只反映语义接近，不保证与问题真正相关。");
    expect(g.verdict).toBe("partial");
    expect(g.score).toBe(50);
    expect(g.hitPoints).toHaveLength(1);
    expect(g.missedPoints).toHaveLength(1);
    expect(g.comment).toContain("漏掉了");
  });

  it("答非所问判为 wrong", () => {
    const g = gradeLocally(SHORT, "我觉得应该把温度调低一点试试看。");
    expect(g.verdict).toBe("wrong");
    expect(g.score).toBe(0);
  });

  it("没有 keyPoints 时退回按参考答案评分", () => {
    const noPoints: Question = { ...SHORT, keyPoints: undefined };
    expect(gradeLocally(noPoints, SHORT.referenceAnswer!).verdict).toBe("correct");
  });
});

// 这组是「内容质量」的回归测试，不是纯逻辑测试。
//
// 背景：HIT_COVERAGE 曾经是 0.5，那是按上面那个近乎逐字抄写的小夹具调出来的。
// 换成题库里真实写法的 180 道简答题，参考答案原文自评只有 21% 能到 partial 线 ——
// 标准答案自己都判不及格，用户写对也拿不到分。阈值按真实语料重新标定后，
// 这里把标定结果钉住：以后再调阈值，先跑这组。
describe("本地评分与真实题库的自洽性", () => {
  const short = QUESTIONS.filter((q) => q.type === "short" && (q.keyPoints?.length ?? 0) > 0);

  it("题库里简答题数量足够，避免空集合让断言恒真", () => {
    expect(short.length).toBeGreaterThan(100);
  });

  it("绝大多数简答题，参考答案原文至少能判为 partial", () => {
    const partial = short.filter((q) => gradeLocally(q, q.referenceAnswer ?? "").score >= 40);
    expect(partial.length / short.length).toBeGreaterThanOrEqual(0.85);
  });

  it("跑题答案拿不到分（区分度没有被放宽阈值吃掉）", () => {
    const offTopic = "这个问题我了解一些，主要是和实际工程场景相关，需要结合具体情况来分析。";
    const scored = short.map((q) => gradeLocally(q, offTopic).score);
    const mean = scored.reduce((a, b) => a + b, 0) / scored.length;
    expect(mean).toBeLessThan(10);
  });
});

describe("correctAnswerLabel", () => {
  it("选择题给出「正确答案：A」这样的文案", () => {
    const choice: Question = {
      ...SHORT,
      type: "single",
      referenceAnswer: undefined,
      keyPoints: undefined,
      options: [
        { key: "A", content: "对", isCorrect: true },
        { key: "B", content: "错", isCorrect: false, wrongReason: "反了" }
      ]
    };
    expect(correctAnswerLabel(choice)).toBe("正确答案：A");
  });

  it("简答题没有选项，返回 null，避免渲染出空的「正确答案：」", () => {
    expect(correctAnswerLabel(SHORT)).toBeNull();
  });
});
