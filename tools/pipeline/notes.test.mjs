import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyPath,
  cleanAnswer,
  decodeEntities,
  extractFiles,
  isQuestionTitle,
  normalizeStem,
  parseSections,
  pickKeyPoints,
  pickVerbatimSnippet,
  shouldSkipPath,
  stemKey,
  stripInlineMarkup,
  toDraftQuestion,
  truncatePoint
} from "./notes.mjs";

describe("classifyPath", () => {
  it("按顶层目录映射到题库分类", () => {
    assert.equal(classifyPath("01.大语言模型基础/1.llm概念/1.llm概念.md"), "大模型基础");
    assert.equal(classifyPath("02.大语言模型架构/5.transformer/5.transformer.md"), "大模型基础");
    assert.equal(classifyPath("05.有监督微调/1.sft/1.sft.md"), "微调与对齐");
    assert.equal(classifyPath("04.分布式训练/9.显存/9.显存.md"), "工程与部署");
  });

  it("路径覆盖优先于顶层目录", () => {
    assert.equal(classifyPath("10.大语言模型应用/1.langchain/1.langchain.md"), "Agent");
    assert.equal(classifyPath("10.大语言模型应用/2.agent/2.agent.md"), "Agent");
    assert.equal(classifyPath("10.大语言模型应用/8.检索增强rag/8.rag.md"), "RAG");
  });

  it("不认识的目录返回 null（调用方据此跳过）", () => {
    assert.equal(classifyPath("98.课程/1.广告.md"), null);
    assert.equal(classifyPath("random.md"), null);
  });
});

describe("shouldSkipPath", () => {
  it("跳过导航页与课程广告目录", () => {
    assert.equal(shouldSkipPath("README.md"), true);
    assert.equal(shouldSkipPath("01.大语言模型基础/README.md"), true);
    assert.equal(shouldSkipPath("_sidebar.md"), true);
    assert.equal(shouldSkipPath("99.其他/1.x.md"), true);
  });

  it("正文文件不跳过", () => {
    assert.equal(shouldSkipPath("01.大语言模型基础/1.llm概念/1.llm概念.md"), false);
  });
});

describe("parseSections", () => {
  it("子标题归属父标题，正文到同级标题为止", () => {
    const md = [
      "# 1. 大标题",
      "开头一句",
      "## 1.1 子节",
      "子节内容",
      "## 1.2 另一个子节",
      "另一段",
      "# 2. 下一个大标题",
      "结束"
    ].join("\n");
    const secs = parseSections(md);
    assert.equal(secs.length, 4);
    assert.equal(secs[0].title, "1. 大标题");
    assert.ok(secs[0].body.includes("子节内容"));
    assert.ok(secs[0].body.includes("1.2 另一个子节"));
    assert.ok(!secs[0].body.includes("结束"));
    assert.equal(secs[1].title, "1.1 子节");
    assert.equal(secs[1].body.trim(), "子节内容");
  });

  it("去掉标题里的 [toc] 残片", () => {
    // 原文的写法是 \[toc]（反斜杠 + 方括号），不是 \[toc\]
    assert.deepEqual(parseSections("## 问题 \\[toc]\n正文").map((s) => s.title), ["问题"]);
  });
});

describe("isQuestionTitle", () => {
  it("问号结尾、QA 前缀、疑问句式都算题目", () => {
    assert.equal(isQuestionTitle("什么是 Prefix LM？"), true);
    assert.equal(isQuestionTitle("QA: 解释注意力机制"), true);
    assert.equal(isQuestionTitle("谈一下你对 RAG 的理解"), true);
    assert.equal(isQuestionTitle("介绍一下 MoE"), true);
  });

  it("小节名不算题目", () => {
    assert.equal(isQuestionTitle("1.1 Prefix LM"), false);
    assert.equal(isQuestionTitle("参考资料"), false);
  });
});

describe("normalizeStem", () => {
  it("去掉编号、加粗、QA 前缀与中文间多余空格", () => {
    assert.equal(normalizeStem("1. **什么是 大模型**？"), "什么是大模型？");
    assert.equal(normalizeStem("QA: 什么是RAG？"), "什么是RAG？");
    assert.equal(normalizeStem("（3）解释一下 self-attention"), "解释一下 self-attention");
  });
});

describe("decodeEntities", () => {
  it("还原笔记里常见的 HTML 实体", () => {
    assert.equal(decodeEntities("a&#x20;b&nbsp;c"), "a b c");
    assert.equal(decodeEntities("&lt;tag&gt; &amp; &quot;q&quot;"), "<tag> & \"q\"");
  });
});

describe("stripInlineMarkup", () => {
  it("去掉加粗、行内代码与转义星号", () => {
    assert.equal(stripInlineMarkup("**重点** 和 `code` 与 \\*星号\\*"), "重点 和 code 与 星号");
  });

  it("保留乘法用的单个星号与 dunder 双下划线", () => {
    assert.equal(stripInlineMarkup("x * sigmoid(Wx)"), "x * sigmoid(Wx)");
    assert.equal(stripInlineMarkup("__init__ 方法"), "__init__ 方法");
  });
});

describe("cleanAnswer", () => {
  it("删掉图片/链接/目录/公式定界等无信息量的行", () => {
    const body = [
      "#### 标题符号要去掉",
      "![示意图](a.png)",
      "\\[toc]",
      "$$",
      "[官方文档](https://example.com/doc)",
      "保留这一句正文。"
    ].join("\n");
    const out = cleanAnswer(body);
    assert.ok(!out.includes("#"), "标题符号要清掉");
    assert.ok(!out.includes("![") && !out.includes("[toc]") && !out.includes("$$"), "图片/目录/公式定界要清掉");
    assert.ok(!out.includes("官方文档"), "纯链接行要清掉");
    assert.ok(out.includes("标题符号要去掉") && out.includes("保留这一句正文。"));
  });

  it("消化 Markdown 标记与 HTML 实体（应用是纯文本渲染）", () => {
    const out = cleanAnswer("**加粗**的`代码`，结尾&#x20;");
    assert.equal(out, "加粗的代码，结尾");
  });

  it("压缩连续空行", () => {
    assert.equal(cleanAnswer("第一段\n\n\n\n第二段"), "第一段\n\n第二段");
  });

  it("把段落内的软换行接回一行：中文不补空格，西文补一个", () => {
    assert.equal(cleanAnswer("第一行文字写到一半\n接着是第二行。"), "第一行文字写到一半接着是第二行。");
    assert.equal(cleanAnswer("结尾是英文 word\nnext line"), "结尾是英文 word next line");
  });

  it("列表项的换行有语义，保持原样", () => {
    assert.equal(cleanAnswer("说明如下：\n\n1. 第一点内容\n2. 第二点内容"), "说明如下：\n\n1. 第一点内容\n2. 第二点内容");
  });
});

describe("truncatePoint", () => {
  it("不超长时原样返回", () => {
    assert.equal(truncatePoint("很短", 10), "很短");
  });

  it("超长时在句末标点处断开，不留半句话", () => {
    assert.equal(truncatePoint("一二三四五六，七八九十十一", 10), "一二三四五六");
  });

  it("没有标点可断时按上限硬截", () => {
    assert.equal(truncatePoint("abcdefghijklmnop", 10), "abcdefghij");
  });
});

describe("pickKeyPoints", () => {
  it("只取列表项，并清洗、截断、去重", () => {
    const answer = [
      "开头一句不是列表。",
      "1. **要点一**：说明文字够长可以留下",
      "2. 要点一：说明文字够长可以留下",
      "- 要点二很短但超过八个字符",
      "3. " + "很长的要点".repeat(20)
    ].join("\n");
    const points = pickKeyPoints(answer, 5, 20);
    assert.equal(points.length, 3);
    assert.equal(points[0], "要点一：说明文字够长可以留下");
    assert.equal(points[1], "要点二很短但超过八个字符");
    assert.ok(points[2].length <= 20);
  });

  it("遵守条数上限", () => {
    const answer = [1, 2, 3, 4, 5, 6, 7].map((n) => `${n}. 这是第${n}条足够长的要点说明`).join("\n");
    assert.equal(pickKeyPoints(answer, 3).length, 3);
  });

  it("没有列表项时返回空数组", () => {
    assert.deepEqual(pickKeyPoints("这里只是一段普通说明文字，没有任何列表。"), []);
  });

  it("超过上限的要点按标点截断", () => {
    const points = pickKeyPoints("1. 要点一要点二要点三，后面还有很多很多的字", 5, 12);
    assert.deepEqual(points, ["要点一要点二要点三"]);
  });
});

describe("pickVerbatimSnippet", () => {
  const long = "这一段正文足够长，可以当作出处片段展示给用户直接核对原文，也方便逐字检索原文位置。";

  it("取第一句够长且干净的原文", () => {
    assert.equal(pickVerbatimSnippet(`短\n\n${long}`), long);
  });

  it("跳过含图片/链接/表格的行", () => {
    const body = `查看 ![图](a.png) 这里是足够长的一行文字用来跳过它呢\n\n${long}`;
    assert.equal(pickVerbatimSnippet(body), long);
  });

  it("没有合格片段时返回 null", () => {
    assert.equal(pickVerbatimSnippet("太短"), null);
  });
});

describe("stemKey", () => {
  it("忽略空白与标点，用于跨文件去重", () => {
    assert.equal(stemKey("什么是 RAG？"), stemKey("什么是RAG?"));
    assert.equal(stemKey("什么是 **RAG**"), stemKey("什么是RAG"));
  });
});

describe("extractFiles", () => {
  const long = "这是一段足够长的答案正文，用来通过最小长度校验，并且能提供出处片段，方便逐字检索核对，同时验证软换行的合并以及空行保留是否正常。";

  it("抽出问句标题，跨文件按题干去重并统计分类", () => {
    const files = [
      { path: "01.大语言模型基础/1.llm概念/1.llm概念.md", text: `## 什么是大模型？\n${long}\n\n## 1.1 小节名\n不是题目` },
      { path: "02.大语言模型架构/5.transformer/5.transformer.md", text: `## 什么是 大模型?\n${long}` },
      { path: "05.有监督微调/1.sft/1.sft.md", text: `## 什么是 SFT？\n${long}` },
      { path: "README.md", text: `## 什么是导航页？\n${long}` }
    ];
    const { items, stats } = extractFiles(files);
    assert.equal(items.length, 2);
    assert.equal(stats.duplicates, 1);
    assert.equal(stats.filesSkipped, 1);
    assert.deepEqual(stats.byCategory, { 大模型基础: 1, 微调与对齐: 1 });
  });

  it("答案太短或拿不到出处片段时丢弃", () => {
    const files = [{ path: "05.有监督微调/1.sft/1.sft.md", text: "## 什么是 SFT？\n太短" }];
    const { items, stats } = extractFiles(files);
    assert.equal(items.length, 0);
    assert.equal(stats.questions, 0);
  });
});

describe("toDraftQuestion", () => {
  const item = {
    filePath: "01.大语言模型基础/1.llm概念/1.llm概念.md",
    category: "大模型基础",
    level: 2,
    stem: "什么是大模型",
    answer: "参考答案正文。",
    keyPoints: [],
    snippet: "**这是一段很长的原文片段，会被清洗并截断到六十个字符以内**，后面还有更多内容。",
    difficulty: 3
  };

  it("产出合法的 short 草稿：无选项、有参考答案与出处", () => {
    const q = toDraftQuestion(item, { repoWebUrl: "https://github.com/wdndev/llm_interview_note", index: 6 });
    assert.equal(q.id, "d_note_0007");
    assert.equal(q.type, "short");
    assert.deepEqual(q.options, []);
    assert.equal(q.stem, "什么是大模型？");
    assert.deepEqual(q.categories, ["大模型基础"]);
    assert.ok(q.source.url.startsWith("https://github.com/wdndev/llm_interview_note/blob/main/"));
  });

  it("keyPoints 为空时用清洗并截断过的出处片段兜底", () => {
    const q = toDraftQuestion(item, { repoWebUrl: "https://example.com", index: 0 });
    assert.equal(q.keyPoints.length, 1);
    assert.ok(!q.keyPoints[0].includes("**"));
    assert.ok(q.keyPoints[0].length <= 60);
  });

  it("已有 keyPoints 时原样保留，不再加问号", () => {
    const q = toDraftQuestion({ ...item, stem: "什么是大模型？", keyPoints: ["要点一"] }, { repoWebUrl: "https://example.com" });
    assert.deepEqual(q.keyPoints, ["要点一"]);
    assert.equal(q.stem, "什么是大模型？");
  });
});
