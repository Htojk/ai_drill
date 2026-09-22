import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chunkToDraft } from "./stages.mjs";

const SOURCE = { id: "openai-cookbook", name: "OpenAI Cookbook" };
const chunk = {
  id: "doc#1",
  docId: "doc",
  sourceId: "openai-cookbook",
  title: "RAG 指南",
  url: "https://github.com/openai/openai-cookbook/blob/main/a.md",
  license: "MIT",
  heading: "切分策略",
  chars: 120,
  fingerprint: "deadbeef",
  text: "切分策略\n按语义切分能保留上下文完整性。",
  verbatim: "## 切分策略\n\n按语义切分能保留上下文完整性。"
};

describe("chunkToDraft", () => {
  const draft = chunkToDraft(chunk, SOURCE, "RAG");

  it("出处三项都是真的：来源标题、可访问 URL、逐字片段", () => {
    assert.equal(draft.source.url, chunk.url);
    assert.equal(draft.source.title, "RAG 指南 · 切分策略");
    // snippet 必须能在原文切片里逐字找到
    assert.ok(chunk.verbatim.replace(/\s+/g, " ").includes(draft.source.snippet.replace(/\s+/g, " ")));
  });

  it("snippet 取自 verbatim 原文而不是规范化文本（保证逐字，故可能保留 markdown 标记）", () => {
    assert.ok(chunk.verbatim.includes("## 切分策略"));
    assert.ok(!chunk.text.includes("##"));
    assert.ok(draft.source.snippet.startsWith("## 切分策略"));
  });

  it("题干与解析显式标注「待人工改写」，避免被误当成成品入库", () => {
    assert.ok(draft.stem.includes("待人工改写"));
    assert.ok(draft.explanation.includes("待填"));
    assert.deepEqual(draft.categories, ["RAG"]);
    assert.ok(draft.tags.includes("待人工改写"));
  });

  it("结构与题库契约一致：四个选项且只有一个正确", () => {
    assert.equal(draft.type, "single");
    assert.equal(draft.options.length, 4);
    assert.equal(draft.options.filter((o) => o.isCorrect).length, 1);
    assert.equal(draft.options.map((o) => o.key).join(""), "ABCD");
  });

  it("id 稳定：同一片段重建得到同一个 id", () => {
    assert.equal(chunkToDraft(chunk, SOURCE, "RAG").id, draft.id);
  });
});
