// 把「笔记型仓库」的 Markdown 切成问答候选（Q&A candidates）。
//
// 为什么不用 chunk.mjs：chunk 按长度切，适合连续叙述型素材；
// 而这类面试笔记是「标题即问题、正文即答案」，按标题层级切才能保住
// 问句与答案的对应关系，不会把答案拦腰截断。
//
// 这一层是纯函数：不联网、不认识题库契约、不写文件，方便单测与复用。
// 与业务的唯一接口是 toDraftQuestion()，产出的是 gen-questions --merge 认的草稿。

// 顶层目录 -> 题库分类（分类白名单见 app/src/data/questions/index.ts）。
const DIR_CATEGORY = [
  ["01.大语言模型基础", "大模型基础"],
  ["02.大语言模型架构", "大模型基础"],
  ["03.训练数据集", "微调与对齐"],
  ["04.分布式训练", "工程与部署"],
  ["05.有监督微调", "微调与对齐"],
  ["06.推理", "工程与部署"],
  ["07.强化学习", "微调与对齐"],
  ["08.检索增强rag", "RAG"],
  ["09.大语言模型评估", "评估与可观测"],
  ["10.大语言模型应用", "提示工程"]
];

// 更细的路径覆盖：同一个大目录里混着不同考点的内容。
const PATH_OVERRIDES = [
  [/agent/i, "Agent"],
  [/langchain/i, "Agent"],
  [/mcp/i, "Agent"],
  [/rag|检索增强/i, "RAG"]
];

// 目录页、导航文件、课程广告：不是知识点，直接跳过。
const SKIP_PATH = [/^README\.md$/i, /^_sidebar\.md$/i, /^_navbar\.md$/i, /^98\./, /^99\./, /\/README\.md$/i];

export function shouldSkipPath(filePath) {
  return SKIP_PATH.some((re) => re.test(filePath));
}

/** 顶层目录 + 路径覆盖 -> 分类；命中不了返回 null。 */
export function classifyPath(filePath) {
  const top = String(filePath).split("/")[0];
  const base = DIR_CATEGORY.find(([dir]) => top === dir)?.[1] ?? null;
  for (const [re, cat] of PATH_OVERRIDES) if (re.test(filePath)) return cat;
  return base;
}

// 「QA:」这种前缀是作者的标注，不是题面的一部分。
const QA_PREFIX = /^\**\s*Q\s*A?\s*[:：]/i;
// 题面开头的编号与项目符号，例如「1.」「1-2」「（3）」「- 」
const STEM_LEADING_NOISE = /^\s*(?:\d+(?:[.\-–—]\d+)*\s*[.、．)]?\s*|[-*+]\s+|（\d+）\s*)/;

/** 去 HTML 实体（笔记里常见 &#x20; 这类空格占位）。 */
export function decodeEntities(text) {
  return String(text)
    .replace(/&#x20;/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

/**
 * 去掉行内标记（加粗、行内代码、删除线、转义星号），保留纯文本。
 * 注意：单个 `*` 在笔记里常是乘法（`x * sigmoid(Wx)`），只删成对出现的 `**`；
 * `__` 可能与代码里的 dunder 冲突，这里一并不动。
 */
export function stripInlineMarkup(text) {
  return decodeEntities(text)
    .replace(/\\[*_`]/g, "")
    .replace(/\*\*|~~/g, "")
    .replace(/`/g, "")
    .trim();
}

/**
 * 中文之间不该有空格：原文常写成「目前 主流的开源模型体系 有哪些？」。
 * 只吃掉空格和制表符——`\s` 会连段落分隔的换行一起吃掉，把两段粘成一段。
 */
function tidyCjkSpaces(text) {
  const CJK = "\\u4e00-\\u9fa5，。、；：？！（）「」《》【】—…·";
  return String(text)
    .replace(new RegExp(`([${CJK}])[ \\t]+(?=[${CJK}])`, "g"), "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** 单个汉字/中文标点，用来判断软换行要不要补空格。 */
const CJK_CHAR = /[\u4e00-\u9fa5，。、；：？！（）「」《》【】—…·]/;

/**
 * 把段落内的软换行接回一行。Markdown 原文按屏幕宽度断行，
 * 直接留着会让纯文本渲染出现一堆参差短行；中文之间不需要空格，其余补一个。
 * 列表、表格、引用块的换行有语义，原样保留。
 */
function unwrapParagraph(lines) {
  if (lines.some((l) => /^\s*(?:\d+[.、．)]|[-*+]\s|\||>)/.test(l))) return lines.join("\n");
  let out = "";
  for (const line of lines) {
    const text = line.trim();
    if (!text) continue;
    if (!out) {
      out = text;
      continue;
    }
    out += CJK_CHAR.test(out.slice(-1)) && CJK_CHAR.test(text[0]) ? text : ` ${text}`;
  }
  return out;
}

/** 去掉题面里的编号、加粗、QA 前缀，得到可以直接展示的问题。 */
export function normalizeStem(rawTitle) {
  let t = String(rawTitle).replace(/^\*+|\*+$/g, "").trim();
  t = t.replace(QA_PREFIX, "").trim();
  t = t.replace(STEM_LEADING_NOISE, "").trim();
  return tidyCjkSpaces(stripInlineMarkup(t));
}

/** 问句判定：以问号结尾，或带 QA: 标注，或明显的疑问句式。 */
export function isQuestionTitle(rawTitle) {
  const raw = String(rawTitle).replace(/^\*+|\*+$/g, "").trim();
  if (QA_PREFIX.test(raw)) return true;
  const stem = normalizeStem(raw);
  if (/[？?]\s*$/.test(stem)) return true;
  return /^(?:请)?(?:谈一下|说说|介绍一下|解释一下)/.test(stem);
}

/**
 * 按标题层级把 Markdown 切成 section。
 * 每个 section 的正文 = 直到「下一个层级 <= 自己」的标题为止，
 * 所以问题下面的子标题（#### 2.1 …）会正确地留在答案里。
 */
export function parseSections(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const heads = [];
  lines.forEach((line, i) => {
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) heads.push({ i, level: m[1].length, title: m[2].replace(/\\?\[toc\]/gi, "").trim() });
  });
  return heads.map((h, k) => {
    const next = heads.slice(k + 1).find((n) => n.level <= h.level);
    const end = next ? next.i : lines.length;
    return { level: h.level, title: h.title, body: lines.slice(h.i + 1, end).join("\n") };
  });
}

// 对答案没有信息量的整行：纯图片、纯链接、目录残片、引用角标、html 包裹标签。
const DROP_LINE = [
  /^\s*!\[[^\]]*\]\([^)]*\)\s*$/,
  /^\s*<img\s[^>]*>\s*$/i,
  /^\s*<\/?(?:p|div|br)\s*\/?>\s*$/i,
  /^\\?\[toc\](?:\s|&#x[0-9a-f]+;|&nbsp;)*$/i, // 有的写成 \[toc]&#x20;
  /^\s*\[[\d,\s]+\]\s*$/,
  /^\s*\$\$?\s*$/, // 独立的公式定界行，留着只是噪声
  /^\s*\[[^\]]+\]\(https?:\/\/[^)]+\)\s*$/
];

/**
 * 清掉对出题无价值的行，并把答案里残留的 Markdown 标记转成纯文本。
 * 应用是纯文本渲染（没有 Markdown 引擎），加粗/行内代码/HTML 实体必须在这里消化，
 * 否则用户会看到 `**类。**`、`&#x20;` 这类原文残留。
 */
export function cleanAnswer(body) {
  const kept = String(body)
    .split(/\r?\n/)
    .filter((line) => !DROP_LINE.some((re) => re.test(line)))
    .map((line) => line.replace(/^#{1,6}\s+/, "").replace(/\\?\[toc\]/gi, ""));
  const paragraphs = kept
    .join("\n")
    .split(/\n{2,}/)
    .map((para) => unwrapParagraph(para.split("\n")))
    .join("\n\n");
  return tidyCjkSpaces(stripInlineMarkup(paragraphs))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 从答案里挑一句「原文逐字」的话，作为 source.snippet（出处片段）。 */
export function pickVerbatimSnippet(rawBody, minLen = 40, maxLen = 160) {
  for (const para of String(rawBody).split(/\n{2,}/)) {
    const line = para.split(/\r?\n/).map((x) => x.trim()).find((x) => x.length >= minLen);
    if (!line) continue;
    if (/!\[|<img|\]\(|\|.*\|/.test(line)) continue; // 含图片/链接/表格，逐字引用不干净
    return line.slice(0, maxLen);
  }
  return null;
}

/** 把一句要点压到 maxLen 以内，优先在句末标点处断开，避免留下半句话。 */
export function truncatePoint(text, maxLen = 60) {
  const t = String(text).trim();
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen);
  const stop = Math.max(cut.lastIndexOf("；"), cut.lastIndexOf("。"), cut.lastIndexOf("，"));
  return stop > maxLen * 0.5 ? cut.slice(0, stop) : cut;
}

/** 从答案里抽要点（列表项优先），作为简答题的 keyPoints。 */
export function pickKeyPoints(answer, limit = 5, maxLen = 60) {
  const points = [];
  for (const line of String(answer).split(/\r?\n/)) {
    const m = line.match(/^\s*(?:\d+[.、．)]|[-*+])\s+(.{8,})$/);
    if (!m) continue;
    const text = truncatePoint(tidyCjkSpaces(stripInlineMarkup(m[1])), maxLen);
    if (text.length < 8) continue;
    if (points.includes(text)) continue;
    points.push(text);
    if (points.length >= limit) break;
  }
  return points;
}

/** 答案越长通常越难；这是给 difficulty 的粗略估计，人工复核时可改。 */
export function estimateDifficulty(answer) {
  const n = String(answer).length;
  if (n < 150) return 2;
  if (n < 450) return 3;
  return 4;
}

/** 题干归一化用于去重：去掉空白与标点，避免同一题因排版差异重复入库。 */
export function stemKey(stem) {
  return String(stem).replace(/[\s，。、？?！!：:；;（）()「」《》"'\*`]/g, "").toLowerCase();
}

/**
 * 多个文件 -> 去重后的问答候选 + 统计。
 * 跨文件重复很常见（同一考点在多个笔记里都写过），按题干去重并保留先出现的那个。
 */
export function extractFiles(files, { logger, minAnswerChars = 60, minStemChars = 6 } = {}) {
  const seen = new Map();
  const stats = { files: 0, filesSkipped: 0, sections: 0, questions: 0, duplicates: 0, noSnippet: 0 };
  const byCategory = {};

  for (const { path: filePath, text } of files) {
    const category = classifyPath(filePath);
    if (!category || shouldSkipPath(filePath)) {
      stats.filesSkipped += 1;
      logger?.debug("notes.file_skipped", { file: filePath });
      continue;
    }
    stats.files += 1;
    const sections = parseSections(text);
    stats.sections += sections.length;
    let found = 0;

    for (const section of sections) {
      if (!isQuestionTitle(section.title)) continue;
      const stem = normalizeStem(section.title);
      if (stem.length < minStemChars) continue;
      const answer = cleanAnswer(section.body);
      if (answer.length < minAnswerChars) continue;
      // snippet 是给用户看的「出处片段」：保留原句用词，但去掉 Markdown 标记，
      // 否则纯文本渲染会露出 `**` 和反引号。
      const verbatim = pickVerbatimSnippet(section.body);
      const snippet = verbatim ? stripInlineMarkup(verbatim) : null;
      if (!snippet) {
        stats.noSnippet += 1;
        logger?.debug("notes.no_snippet", { file: filePath, stem });
        continue;
      }
      const key = stemKey(stem);
      if (seen.has(key)) {
        stats.duplicates += 1;
        logger?.debug("notes.duplicate", { stem, file: filePath });
        continue;
      }
      seen.set(key, {
        filePath, category, level: section.level, stem, answer,
        keyPoints: pickKeyPoints(answer), snippet,
        difficulty: estimateDifficulty(answer)
      });
      found += 1;
      byCategory[category] = (byCategory[category] ?? 0) + 1;
    }
    stats.questions += found;
    logger?.debug("notes.file_done", { file: filePath, sections: sections.length, questions: found });
  }

  return { items: [...seen.values()], stats: { ...stats, byCategory } };
}

/**
 * 问答候选 -> gen-questions --merge 认的草稿题目。
 * 统一产出 short 题：没有选项，靠 referenceAnswer + keyPoints 批阅。
 */
export function toDraftQuestion(item, { repoWebUrl, ref = "main", index = 0 } = {}) {
  const stem = /[？?]\s*$/.test(item.stem) ? item.stem : `${item.stem}？`;
  const fileName = item.filePath.split("/").pop().replace(/\.md$/, "");
  return {
    id: `d_note_${String(index + 1).padStart(4, "0")}`,
    type: "short",
    isPractice: false,
    stem,
    options: [],
    referenceAnswer: item.answer,
    // 解析不出列表项时退回 snippet：snippet 是原文逐字片段，同样要过一遍清洗与截断，
    // 否则加粗标记和上百字的整段会漏进 keyPoints。
    keyPoints: item.keyPoints.length
      ? item.keyPoints
      : [truncatePoint(stripInlineMarkup(item.snippet), 60)],
    explanation:
      `本题来自社区整理的 LLM 面试笔记《${fileName}》，考点属于「${item.category}」。` +
      "参考答案为原文整理（二手资料），尚未逐条核对一手来源，入库前需人工复核。",
    extension: "来源是他人整理的笔记，结论请以论文或官方文档为准。",
    difficulty: item.difficulty,
    categories: [item.category],
    tags: ["面试笔记", "待复核"],
    source: {
      type: "community",
      title: `LLM 面试笔记 · ${item.filePath.replace(/\//g, " / ")}`,
      url: `${repoWebUrl}/blob/${ref}/${item.filePath.split("/").map(encodeURIComponent).join("/")}`,
      snippet: item.snippet
    }
  };
}
