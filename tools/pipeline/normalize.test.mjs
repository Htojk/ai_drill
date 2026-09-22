import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractTitle,
  isLowValue,
  makeCorpusDoc,
  markdownToText,
  normalizeMarkdownDoc,
  slugify,
  stripBoilerplate
} from "./normalize.mjs";

describe("stripBoilerplate", () => {
  it("丢掉徽章行与纯图片行", () => {
    const md = "text\n[![CI](https://img.shields.io/x)](https://x)\n![logo](a.png)";
    assert.equal(stripBoilerplate(md), "text");
  });

  it("丢掉多行 HTML 注释", () => {
    const md = "a\n<!--\nhidden\nlines\n-->\nb";
    assert.equal(stripBoilerplate(md), "a\nb");
  });

  it("保留正文里的链接和图片说明之外的文本", () => {
    const md = "见 [文档](https://x) 与 ![图](b.png) 说明";
    assert.equal(stripBoilerplate(md), md);
  });
});

describe("markdownToText", () => {
  it("标题转成「标题：」行", () => {
    assert.equal(markdownToText("## RAG 是什么"), "RAG 是什么：");
  });

  it("链接只留可见文字", () => {
    assert.equal(markdownToText("见 [LangChain 文档](https://x)"), "见 LangChain 文档");
  });

  it("去掉行内代码反引号但保留代码内容", () => {
    assert.equal(markdownToText("用 `top_k=5` 控制"), "用 top_k=5 控制");
  });

  it("去掉粗体斜体标记", () => {
    assert.equal(markdownToText("**重点**与*强调*"), "重点与强调");
  });

  it("代码块保留内容、去掉围栏", () => {
    const out = markdownToText("```python\nprint(1)\n```");
    assert.ok(out.includes("print(1)"));
    assert.ok(!out.includes("```"));
  });

  it("表格去掉分隔行、保留单元格", () => {
    const out = markdownToText("| A | B |\n| --- | --- |\n| 1 | 2 |");
    assert.ok(out.includes("A | B"));
    assert.ok(out.includes("1 | 2"));
    assert.ok(!out.includes("--- | ---"));
  });

  it("去掉引用符号与 HTML 标签", () => {
    assert.equal(markdownToText("> 引用\n<div>x</div>"), "引用\nx");
  });

  it("折叠 3 个以上连续空行", () => {
    assert.equal(markdownToText("a\n\n\n\n\nb"), "a\n\nb");
  });
});

describe("extractTitle", () => {
  it("优先取 h1", () => {
    assert.equal(extractTitle("# 真标题\n\n## 小标题", "fallback"), "真标题");
  });

  it("没有标题时用文件名兜底", () => {
    assert.equal(extractTitle("没有标题的正文", "README.md"), "README.md");
  });

  it("标题里的反引号会被去掉", () => {
    assert.equal(extractTitle("# 用 `top_k` 调优"), "用 top_k 调优");
  });
});

describe("isLowValue", () => {
  it("太短的内容被判定为低价值", () => {
    assert.equal(isLowValue("太短"), true);
  });

  it("短行占比过高的目录型内容被丢掉", () => {
    const toc = ["[A](#a)", "[B](#b)", "[C](#c)", "[D](#d)", "[E](#e)"].join("\n");
    assert.equal(isLowValue(toc, { minChars: 10 }), true);
  });

  it("正常段落不是低价值", () => {
    const body = "这段话解释了为什么按语义切分比定长切分更好用。".repeat(12);
    assert.equal(isLowValue(body), false);
  });
});

describe("slugify", () => {
  it("英文标题转连字符形式", () => {
    assert.equal(slugify("RAG: Retrieval Augmented Generation!"), "rag-retrieval-augmented-generation");
  });

  it("保留中文，去掉标点", () => {
    assert.equal(slugify("RAG 切分策略（上）"), "rag-切分策略上");
  });

  it("空输入有兜底值", () => {
    assert.equal(slugify("！！！"), "doc");
  });

  it("超长标题被截断且不以连字符结尾", () => {
    const out = slugify("a".repeat(80), { maxLength: 10 });
    assert.equal(out.length <= 10, true);
    assert.ok(!out.endsWith("-"));
  });
});

describe("makeCorpusDoc", () => {
  const base = { sourceId: "arxiv", title: "A Paper", url: "https://arxiv.org/abs/1", license: "arXiv", text: "body" };

  it("产出统一契约字段", () => {
    const doc = makeCorpusDoc(base);
    assert.equal(doc.sourceId, "arxiv");
    assert.equal(doc.title, "A Paper");
    assert.equal(doc.chars, 4);
    assert.ok(doc.id.startsWith("arxiv-a-paper-"));
    assert.ok(doc.fetchedAt.endsWith("Z"));
    assert.ok(doc.fingerprint);
  });

  it("同一 url 的 id 稳定（重建不产生新 id）", () => {
    assert.equal(makeCorpusDoc(base).id, makeCorpusDoc({ ...base, fetchedAt: 1 }).id);
  });

  it("缺 license 时标 unknown，让版权风险可见", () => {
    assert.equal(makeCorpusDoc({ ...base, license: undefined }).license, "unknown");
  });
});

describe("normalizeMarkdownDoc", () => {
  it("原始 markdown 一步规范化为 CorpusDoc", () => {
    const doc = normalizeMarkdownDoc({
      sourceId: "openai-cookbook",
      url: "https://github.com/openai/openai-cookbook/blob/main/a.md",
      license: "MIT",
      fallbackTitle: "a.md",
      raw: `[![badge](i.png)](u)\n\n# 切分策略\n\n${"按语义切分能保留上下文完整性，避免关键前提被切走。".repeat(12)}`
    });
    assert.ok(doc);
    assert.equal(doc.title, "切分策略");
    assert.ok(doc.text.includes("按语义切分"));
    assert.ok(!doc.text.includes("badge"));
  });

  it("低价值内容返回 null，由调用方记一条 warn", () => {
    const doc = normalizeMarkdownDoc({
      sourceId: "x",
      url: "https://x",
      license: "MIT",
      raw: "太短了"
    });
    assert.equal(doc, null);
  });
});
