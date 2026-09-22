import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chunkDocument,
  dedupeChunks,
  DEFAULT_CHUNK,
  fingerprint,
  headingLevel,
  packPieces,
  splitLongText,
  splitMarkdownSections
} from "./chunk.mjs";

describe("headingLevel", () => {
  it("识别 1-6 级标题", () => {
    assert.equal(headingLevel("# a"), 1);
    assert.equal(headingLevel("### c"), 3);
    assert.equal(headingLevel("####### g"), 0);
    assert.equal(headingLevel("正文"), 0);
  });
});

describe("splitMarkdownSections", () => {
  it("按标题分段并记录标题路径", () => {
    const sections = splitMarkdownSections("# A\nalpha\n\n## B\nbeta\n\n# C\ngamma");
    assert.deepEqual(sections.map((s) => s.headingPath), [["A"], ["A", "B"], ["C"]]);
    assert.equal(sections[1].text, "beta");
  });

  it("代码围栏里的 # 不算标题", () => {
    const md = "# T\n\n```bash\n# 这是注释\nnpm i\n```\n\ntail";
    const sections = splitMarkdownSections(md);
    assert.equal(sections.length, 1);
    assert.ok(sections[0].text.includes("# 这是注释"));
    assert.ok(sections[0].text.includes("tail"));
  });

  it("标题下的正文不会串到下一个标题", () => {
    const sections = splitMarkdownSections("## One\n1\n\n## Two\n2");
    assert.deepEqual(sections.map((s) => s.text), ["1", "2"]);
  });

  it("空文档返回空数组", () => {
    assert.deepEqual(splitMarkdownSections("   \n\n"), []);
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
    const parts = splitLongText(text, 8);
    assert.equal(parts.length, 3);
    assert.deepEqual(parts, ["第一句。", "第二句。", "第三句。"]);
  });

  it("单句超长时硬切，不丢内容", () => {
    const text = "a".repeat(50);
    const parts = splitLongText(text, 20);
    assert.equal(parts.join(""), text);
  });
});

describe("packPieces", () => {
  it("贪心合并到接近上限", () => {
    const packed = packPieces(["a".repeat(50), "b".repeat(50)], 120);
    assert.equal(packed.length, 1);
  });

  it("超过上限就开新块", () => {
    const packed = packPieces(["a".repeat(80), "b".repeat(80)], 100);
    assert.equal(packed.length, 2);
  });

  it("末块过短会并回上一块", () => {
    const packed = packPieces(["a".repeat(100), "tiny"], 120, 20);
    assert.equal(packed.length, 1);
    assert.ok(packed[0].includes("tiny"));
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

describe("chunkDocument", () => {
  const doc = {
    id: "cookbook-rag-abc123",
    sourceId: "openai-cookbook",
    title: "RAG 指南",
    url: "https://github.com/openai/openai-cookbook/blob/main/x.md",
    license: "MIT"
  };

  it("每个 chunk 都带得出处信息（供题目 source 使用）", () => {
    const chunks = chunkDocument({ ...doc, text: "# 标题\n" + "内容。".repeat(200) });
    assert.ok(chunks.length > 0);
    for (const c of chunks) {
      assert.equal(c.url, doc.url);
      assert.equal(c.license, "MIT");
      assert.ok(c.heading.startsWith("标题"));
      assert.ok(c.id.startsWith(doc.id));
    }
  });

  it("遵守 maxChunks 上限", () => {
    const chunks = chunkDocument({ ...doc, text: "# T\n" + "a".repeat(5000) }, { maxChunks: 3, maxChars: 300 });
    assert.equal(chunks.length, 3);
  });

  it("chunk 长度不超过 maxChars", () => {
    const chunks = chunkDocument({ ...doc, text: "# T\n" + "x".repeat(4000) }, { maxChars: 500 });
    assert.ok(chunks.every((c) => c.chars <= 500));
  });

  it("chunk id 不重复", () => {
    const chunks = chunkDocument({ ...doc, text: "# T\n" + "y".repeat(3000) }, { maxChars: 400 });
    assert.equal(new Set(chunks.map((c) => c.id)).size, chunks.length);
  });

  it("空文档返回空数组", () => {
    assert.deepEqual(chunkDocument({ ...doc, text: "" }), []);
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
