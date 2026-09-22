/**
 * 规范化：把「抓回来的原始素材」变成统一的 CorpusDoc 契约。
 *
 * 这一层是流水线与业务之间的边界之一：下游（出题、合并）只认 CorpusDoc，
 * 不关心素材来自 GitHub raw、arXiv API 还是手写文件。
 */
import { fingerprint, headingLevel, splitLongText } from "./chunk.mjs";

/** 徽章、HTML 注释、纯图片行、居中包裹标签：对出题没有价值，整行丢掉。 */
const DROP_LINE = [
  /^\s*\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)\s*$/, // [![badge](img)](link)
  /^\s*!\[[^\]]*\]\([^)]*\)\s*$/, // 纯图片
  /^\s*<!--.*-->\s*$/,
  /^\s*<p\s+align="?center"?>\s*$/i,
  /^\s*<\/?p>\s*$/i,
  /^\s*<img\s[^>]*>\s*$/i,
  /^\s*\[?回到顶部\]?\(?#[^)]*\)?\s*$/
];

/** 标题里常见的噪声：emoji、序号装饰，保留原文但去掉多余空白。 */
function tidyTitle(text) {
  return text.replace(/^[\s#>*_\-]+/, "").replace(/\s+/g, " ").trim();
}

export function stripBoilerplate(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const kept = [];
  let inHtmlComment = false;

  for (const raw of lines) {
    if (inHtmlComment) {
      if (raw.includes("-->")) inHtmlComment = false;
      continue;
    }
    if (/^\s*<!--/.test(raw) && !raw.includes("-->")) {
      inHtmlComment = true;
      continue;
    }
    if (DROP_LINE.some((re) => re.test(raw))) continue;
    kept.push(raw);
  }
  return kept.join("\n");
}

/**
 * markdown → 纯文本。保留标题层级（转成 「标题：」行）与列表，因为
 * 这些结构对出题有用；去掉链接语法、行内代码反引号等纯格式符号。
 * 代码块保留内容（技术细节常常正是考点），但去掉围栏标记。
 */
export function markdownToText(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const out = [];
  let inFence = false;

  for (const raw of lines) {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence;
      out.push("");
      continue;
    }
    if (inFence) {
      out.push(`    ${raw}`);
      continue;
    }
    let line = raw;
    const level = /^(#{1,6})\s+(.*)$/.exec(line);
    if (level) {
      // 只删掉 # 标记，不改写文字：所有变换都必须是「删除」，
      // 这样规范化结果一定是原文的子串，snippet 才能保证逐字引用。
      out.push(tidyTitle(level[2]));
      continue;
    }
    if (/^\s*\|/.test(line)) {
      // 表格：只保留单元格文字，分隔行丢掉
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;
      line = line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean)
        .join(" | ");
      out.push(line);
      continue;
    }
    line = line
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
      .replace(/^\s*>\s?/, "")
      .replace(/^\s*[-*+]\s+/, "")
      .replace(/[ \t]+$/g, "");
    out.push(line);
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 取第一个 h1/h2 当标题；没有就退回调用方给的名字。 */
export function extractTitle(markdown, fallback = "") {
  for (const line of String(markdown).split(/\r?\n/)) {
    const m = /^#{1,2}\s+(.*)$/.exec(line);
    if (m) {
      const title = tidyTitle(m[1].replace(/`/g, ""));
      if (title) return title;
    }
  }
  return tidyTitle(fallback);
}

/** 太短或明显是目录/导航的内容，不值得出题。 */
export function isLowValue(text, { minChars = 200 } = {}) {
  const trimmed = text.trim();
  if (trimmed.length < minChars) return true;
  const lines = trimmed.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return true;
  // 短行占比过高（目录、链接列表、导航）就丢掉
  const shortLines = lines.filter((l) => l.trim().length < 24).length;
  return shortLines / lines.length > 0.7;
}

/** 归一化空白，用于「原文是否包含这段文字」的判断。 */
function collapse(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

/**
 * 按「标题 / 空行段落」切块，每块同时保留：
 *   raw  —— 原文切片（题目的 source.snippet 从这里取，保证逐字）
 *   text —— 规范化文本（给人/模型阅读与出题用）
 *
 * 这是「出处可逐字引用」的根基：raw 一定是原文的连续子串。
 */
export function splitBlocks(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const blocks = [];
  const headingStack = [];
  let buf = [];
  let inFence = false;

  const flush = () => {
    const raw = buf.join("\n").trim();
    buf = [];
    if (!raw) return;
    const text = markdownToText(raw).trim();
    if (!text) return;
    blocks.push({ headingPath: headingStack.filter(Boolean), raw, text });
  };

  for (const line of lines) {
    const isFence = /^\s*(```|~~~)/.test(line);
    const level = inFence || isFence ? 0 : headingLevel(line);
    if (level > 0) {
      flush();
      headingStack.length = Math.max(0, level - 1);
      const title = tidyTitle(line.replace(/^#{1,6}\s+/, ""));
      headingStack[level - 1] = title;
      blocks.push({ headingPath: headingStack.filter(Boolean), raw: line.trim(), text: title });
      continue;
    }
    if (isFence) {
      inFence = !inFence;
      buf.push(line);
      continue;
    }
    if (!inFence && line.trim() === "") {
      flush();
      continue;
    }
    buf.push(line);
  }
  flush();
  return blocks;
}

/** 把过长的块按原文切小，再分别规范化，保持 raw ↔ text 一一对应。 */
export function explodeBlocks(blocks, maxChars) {
  return blocks.flatMap((block) => {
    if (block.raw.length <= maxChars) return [block];
    return splitLongText(block.raw, maxChars).map((raw) => ({
      headingPath: block.headingPath,
      raw,
      text: markdownToText(raw).trim()
    }));
  });
}

/**
 * 校验每块原文都是原始素材的连续子串 —— 这是 snippet 能逐字引用的前提。
 * 一旦将来有人往清洗规则里加了「插入字符」的变换，这里会立刻报出来。
 */
export function checkBlocksVerbatim(blocks, rawMarkdown) {
  const haystack = collapse(rawMarkdown);
  const failed = [];
  blocks.forEach((block, index) => {
    if (!haystack.includes(collapse(block.raw))) failed.push(index);
  });
  return { ok: failed.length === 0, failed };
}

/** 从原文里截一段适合当 snippet 的文字，尽量在词/句边界收尾。 */
export function snippetFrom(verbatim, maxChars = 400) {
  const text = collapse(verbatim);
  if (text.length <= maxChars) return { text, truncated: false };
  const window = text.slice(0, maxChars);
  // 优先切在句末，其次空格，都没有就硬切
  const cut = Math.max(
    window.lastIndexOf("。"),
    window.lastIndexOf(". "),
    window.lastIndexOf("；"),
    window.lastIndexOf(";"),
    window.lastIndexOf(" ")
  );
  const end = cut > maxChars * 0.6 ? cut + 1 : maxChars;
  return { text: text.slice(0, end).trim(), truncated: true };
}

/** 文件名/标题 → 可用作 id 的短标识。保留中日韩字符，其余转连字符。 */
export function slugify(text, { maxLength = 60 } = {}) {
  const slug = String(text)
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
  return slug.slice(0, maxLength).replace(/-$/, "") || "doc";
}

/**
 * 构造 CorpusDoc 契约。
 * @param {object} input
 * @param {string} input.sourceId   源标识（对应 sources.mjs 里的 id）
 * @param {string} input.title      标题
 * @param {string} input.url        可引用的原始地址（题目 source.url 用它）
 * @param {string} input.license    许可（版权风险可见化）
 * @param {string} input.text       已规范化的正文
 */
export function makeCorpusDoc({ sourceId, title, url, license, text, blocks, fetchedAt = Date.now(), meta = {} }) {
  const id = `${sourceId}-${slugify(title)}-${fingerprint(url).slice(0, 6)}`;
  return {
    id,
    sourceId,
    title: tidyTitle(title) || slugify(url),
    url,
    license: license ?? "unknown",
    fetchedAt: new Date(fetchedAt).toISOString(),
    chars: text.length,
    fingerprint: fingerprint(text),
    meta,
    text,
    // blocks 里带原文切片，chunk 阶段靠它产出逐字可引用的 verbatim
    blocks: blocks ?? []
  };
}

/** 一步到位：原始 markdown → CorpusDoc（去噪、切块、规范化、校验价值与逐字性）。 */
export function normalizeMarkdownDoc({ sourceId, url, license, raw, fallbackTitle, meta }) {
  const cleaned = stripBoilerplate(raw);
  const blocks = splitBlocks(cleaned);
  const text = blocks.map((b) => b.text).join("\n\n").trim();
  if (isLowValue(text)) return null;
  const verbatim = checkBlocksVerbatim(blocks, cleaned);
  return makeCorpusDoc({
    sourceId,
    title: extractTitle(cleaned, fallbackTitle),
    url,
    license,
    text,
    blocks,
    meta: { ...meta, verbatimOk: verbatim.ok, verbatimFailedBlocks: verbatim.failed.length }
  });
}
