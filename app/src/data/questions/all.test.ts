import { describe, expect, it } from "vitest";
import { CATEGORIES, QUESTIONS, QUESTIONS_BY_ID, getQuestion } from "./index";

/**
 * 题库全量不变量。
 * 改动任何分类文件后本文件都会入选相关测试（见 tools/test-related.mjs）。
 */

/** 锁定的题目顺序：顺序会影响新用户摸底抽样，改动必须是有意的 */
const EXPECTED_IDS = [
  "q_base_001", "q_base_002", "q_base_003",
  "q_prompt_001", "q_prompt_002", "q_prompt_003",
  "q_rag_001", "q_rag_002", "q_rag_003",
  "q_agent_001", "q_agent_002", "q_agent_003",
  "q_onto_001", "q_onto_002", "q_onto_003",
  "q_tune_001", "q_tune_002", "q_tune_003",
  "q_eval_001", "q_eval_002", "q_eval_003",
  "q_eng_001", "q_eng_002", "q_eng_003"
];

describe("题库结构", () => {
  it("题目顺序与预期一致", () => {
    expect(QUESTIONS.map((q) => q.id)).toEqual(EXPECTED_IDS);
  });

  it("id 唯一", () => {
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
  });

  it("索引与查询一致", () => {
    expect(QUESTIONS_BY_ID.size).toBe(QUESTIONS.length);
    expect(getQuestion("q_base_001")?.id).toBe("q_base_001");
    expect(getQuestion("不存在的题")).toBeUndefined();
  });

  it("每个分类都至少有一道题", () => {
    const covered = new Set(QUESTIONS.flatMap((q) => q.categories));
    expect(CATEGORIES.filter((c) => !covered.has(c))).toEqual([]);
  });

  it("工程判断题数量足够支撑每日 3 题的下限", () => {
    expect(QUESTIONS.filter((q) => q.isPractice).length).toBeGreaterThanOrEqual(3);
  });
});

describe("每道题的字段完整性", () => {
  it.each(QUESTIONS.map((q) => [q.id, q] as const))("%s", (_id, q) => {
    expect(q.stem.trim().length).toBeGreaterThan(0);
    expect(q.explanation.trim().length).toBeGreaterThan(0);
    expect(q.options.length).toBeGreaterThanOrEqual(2);

    // 选项 key 唯一
    const keys = q.options.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);

    // 至少一个正确答案，且不能全是正确答案
    const correct = q.options.filter((o) => o.isCorrect);
    expect(correct.length).toBeGreaterThanOrEqual(1);
    expect(correct.length).toBeLessThan(q.options.length);

    // 错误选项必须写明错因（这是产品的核心差异化，不是可选项）
    for (const o of q.options.filter((x) => !x.isCorrect)) {
      expect(o.wrongReason?.trim().length ?? 0).toBeGreaterThan(0);
    }

    // 分类必须有效
    expect(q.categories.length).toBeGreaterThan(0);
    const known = new Set<string>(CATEGORIES);
    expect(q.categories.filter((c) => !known.has(c))).toEqual([]);

    // 溯源必须完整
    expect(q.source.title.trim().length).toBeGreaterThan(0);
    expect(q.source.url).toMatch(/^https:\/\//);
    expect(q.source.snippet.trim().length).toBeGreaterThan(0);

    expect(q.difficulty).toBeGreaterThanOrEqual(1);
    expect(q.difficulty).toBeLessThanOrEqual(5);
  });
});
