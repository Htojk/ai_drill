import { describe, expect, it } from "vitest";
import { CATEGORIES, QUESTIONS, QUESTIONS_BY_ID, getQuestion } from "./index";

/**
 * 题库全量不变量。
 * 改动任何分类文件后本文件都会入选相关测试（见 tools/test-related.mjs）。
 */

/**
 * 锁定的题库结构与题量。
 *
 * 为什么不再逐条列出 id：题库扩到几百题后，几百行的 id 列表没人会真的看，
 * 反而会把「顺序变了」这个真正要防的问题淹没掉。这里改成锁定
 * 「每个文件的题量 + 各文件 id 必须成块且升序」，同样能拦住无意的顺序改动，
 * 而且加题时只需要更新这个表。
 *
 * 顺序会影响「新用户均匀摸底」的抽样结果，所以改动必须是有意的。
 */
const EXPECTED_FILES: { prefix: string; count: number }[] = [
  { prefix: "q_base_", count: 3 },
  { prefix: "q_prompt_", count: 3 },
  { prefix: "q_rag_", count: 100 },
  { prefix: "q_agent_", count: 100 },
  { prefix: "q_onto_", count: 3 },
  { prefix: "q_tune_", count: 3 },
  { prefix: "q_eval_", count: 3 },
  { prefix: "q_eng_", count: 3 }
];

describe("题库结构", () => {
  it("每个文件的题量与预期一致", () => {
    const actual = EXPECTED_FILES.map(({ prefix }) => QUESTIONS.filter((q) => q.id.startsWith(prefix)).length);
    expect(actual).toEqual(EXPECTED_FILES.map((f) => f.count));
  });

  it("题目按文件成块排列，且 id 升序（顺序改动必须是有意的）", () => {
    let cursor = 0;
    for (const { prefix, count } of EXPECTED_FILES) {
      const block = QUESTIONS.slice(cursor, cursor + count);
      expect(block.every((q) => q.id.startsWith(prefix))).toBe(true);
      const nums = block.map((q) => Number(q.id.slice(prefix.length)));
      expect(nums).toEqual([...nums].sort((a, b) => a - b));
      cursor += count;
    }
    expect(cursor).toBe(QUESTIONS.length);
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

    if (q.type === "short") {
      // 简答题没有选项：靠 referenceAnswer + keyPoints 批阅，而不是判对错
      expect(q.options).toEqual([]);
      expect(q.referenceAnswer?.trim().length ?? 0).toBeGreaterThan(0);
      expect(q.keyPoints?.length ?? 0).toBeGreaterThan(0);
    } else {
      expect(q.options.length).toBeGreaterThanOrEqual(2);

      // 判断题只有「正确 / 错误」两个选项
      if (q.type === "judge") expect(q.options.length).toBe(2);

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
