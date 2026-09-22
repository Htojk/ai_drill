/**
 * 规范化：把「抓回来的原始素材」变成统一的 CorpusDoc 契约。
 *
 * 这一层是流水线与业务之间的边界之一：下游（出题、合并）只认 CorpusDoc，
 * 不关心素材来自 GitHub raw、arXiv API 还是手写文件。
 */
import { fingerprint } from "./chunk.mjs";

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
      out.push(`${tidyTitle(level[2])}：`);
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
      .replace(/^\s*[-*+]\s+/, "- ")
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
export function makeCorpusDoc({ sourceId, title, url, license, text, fetchedAt = Date.now(), meta = {} }) {
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
    text
  };
}

/** 一步到位：原始 markdown → CorpusDoc（去掉噪声、转纯文本、校验价值）。 */
export function normalizeMarkdownDoc({ sourceId, url, license, raw, fallbackTitle, meta }) {
  const cleaned = stripBoilerplate(raw);
  const text = markdownToText(cleaned);
  if (isLowValue(text)) return null;
  return makeCorpusDoc({
    sourceId,
    title: extractTitle(cleaned, fallbackTitle),
    url,
    license,
    text,
    meta
  });
}
