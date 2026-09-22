import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chunkDocument,
  chunkPieces,
  dedupeChunks,
  DEFAULT_CHUNK,
  fingerprint,
  headingLevel,
  splitLongText
} from "./chunk.mjs";

describe("headingLevel", () => {
  it("识别 1-6 级标题", () => {
    assert.equal(headingLevel("# a"), 1);
    assert.equal(headingLevel("### c"), 3);
    assert.equal(headingLevel("####### g"), 0);
    assert.equal(headingLevel("正文"), 0);
  });
});

describe("splitLongText", () => {
  it("短文本原样返回", () => {
    assert.deepEqual(splitLongText("hello", 100), ["hello"]);
  });

  it("按段落拆分超长文本，且每块不超上限", () => {
    const text = [150, 150, 150].map((n) => "x".repeat(n)).join("\n\n");
    const parts = splitLongText(text, 200);
    assert.equal(parts.length, 3);
    assert.ok(parts.every((p) => p.length <= 200));
  });

  it("没有段落边界时按句子拆", () => {
    const text = "第一句。第二句。第三句。";
    assert.deepEqual(splitLongText(text, 8), ["第一句。", "第二句。", "第三句。"]);
  });

  it("单句超长时硬切，不丢内容", () => {
    const text = "a".repeat(50);
    const parts = splitLongText(text, 20);
    assert.equal(parts.join(""), text);
  });
});

describe("fingerprint", () => {
  it("空白差异不影响指纹（可用于跨源去重）", () => {
    assert.equal(fingerprint("Hello  World\n"), fingerprint("hello world"));
  });

  it("不同内容指纹不同", () => {
    assert.notEqual(fingerprint("a"), fingerprint("b"));
  });
});

const DOC = {
  id: "cookbook-rag-abc123",
  sourceId: "openai-cookbook",
  title: "RAG 指南",
  url: "https://github.com/openai/openai-cookbook/blob/main/x.md",
  license: "MIT"
};

const piece = (raw, headingPath = ["切分策略"]) => ({ headingPath, raw, text: raw });

describe("chunkPieces", () => {
  it("同时产出 text 与 verbatim，且都带出处信息", () => {
    const chunk = chunkPieces([piece("第一条。"), piece("第二条。")], DOC)[0];
    assert.equal(chunk.url, DOC.url);
    assert.equal(chunk.license, "MIT");
    assert.equal(chunk.heading, "切分策略");
    assert.equal(chunk.text, "第一条。\n\n第二条。");
    assert.equal(chunk.verbatim, "第一条。\n\n第二条。");
    assert.ok(chunk.id.startsWith(DOC.id));
  });

  it("超过 maxChars 时开新 chunk", () => {
    const chunks = chunkPieces([piece("x".repeat(80)), piece("y".repeat(80))], DOC, { maxChars: 100, minChars: 0 });
    assert.equal(chunks.length, 2);
  });

  it("末块过短会并回上一块", () => {
    const chunks = chunkPieces([piece("x".repeat(100)), piece("tiny")], DOC, { maxChars: 120, minChars: 20 });
    assert.equal(chunks.length, 1);
    assert.ok(chunks[0].verbatim.includes("tiny"));
  });

  it("遵守 maxChunks 上限", () => {
    const pieces = Array.from({ length: 10 }, (_, i) => piece(`第 ${i} 条${"x".repeat(50)}`));
    const chunks = chunkPieces(pieces, DOC, { maxChars: 60, maxChunks: 3, minChars: 0 });
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].text, pieces[0].text);
  });

  it("空 pieces 返回空数组", () => {
    assert.deepEqual(chunkPieces([], DOC), []);
  });
});

describe("chunkDocument", () => {
  it("blocks 模式：text 与 verbatim 分别来自规范化与原文", () => {
    const doc = {
      ...DOC,
      text: "切分策略 按语义切分更稳。",
      blocks: [{ headingPath: ["切分策略"], raw: "## 切分策略\n按语义切分更稳。", text: "切分策略\n按语义切分更稳。" }]
    };
    const [chunk] = chunkDocument(doc);
    assert.ok(chunk.verbatim.includes("## 切分策略"));
    assert.ok(!chunk.text.includes("##"));
  });

  it("没有 blocks 时退回按 text 切分", () => {
    const chunks = chunkDocument({ ...DOC, text: "只有正文。" });
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].verbatim, "只有正文。");
  });

  it("chunk 长度不超过 maxChars", () => {
    const doc = { ...DOC, text: "x".repeat(4000), blocks: [{ headingPath: [], raw: "x".repeat(4000), text: "x".repeat(4000) }] };
    assert.ok(chunkDocument(doc, { maxChars: 500 }).every((c) => c.chars <= 500));
  });

  it("chunk id 不重复", () => {
    const doc = { ...DOC, text: "y".repeat(3000), blocks: [{ headingPath: [], raw: "y".repeat(3000), text: "y".repeat(3000) }] };
    const chunks = chunkDocument(doc, { maxChars: 400 });
    assert.equal(new Set(chunks.map((c) => c.id)).size, chunks.length);
  });

  it("默认值就是导出常量（便于文档说明）", () => {
    assert.equal(DEFAULT_CHUNK.maxChars, 1200);
  });
});

describe("dedupeChunks", () => {
  it("指纹相同的块只保留第一处", () => {
    const chunk = (id, text) => ({ id, fingerprint: fingerprint(text), text });
    const out = dedupeChunks([chunk("a", "same"), chunk("b", "same"), chunk("c", "other")]);
    assert.deepEqual(out.map((c) => c.id), ["a", "c"]);
  });
});
