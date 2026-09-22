/**
 * 语料切分：把一篇语料切成适合出题的小块（chunk）。
 *
 * 为什么按结构切：出题需要「一个块讲清楚一件事」。
 * 按 markdown 标题先分段，再按段落/句子边界收敛到目标长度，
 * 比定长硬切更容易产出可溯源的题目（出处能定位到小节）。
 *
 * 纯函数，无 IO，方便单测。
 */

export const DEFAULT_CHUNK = { maxChars: 1200, minChars: 200, maxChunks: 40 };

const FENCE = /^\s*(```|~~~)/;

/** 是否是 markdown 标题行，返回层级（# 的个数）；不是标题返回 0。 */
export function headingLevel(line) {
  const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
  return m ? m[1].length : 0;
}

/**
 * 按标题切段。代码围栏内的 `#` 不算标题（否则 YAML/shell 注释会把结构切碎）。
 * @returns {Array<{headingPath: string[], level: number, text: string}>}
 */
export function splitMarkdownSections(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const sections = [];
  const headingStack = [];
  let buffer = [];
  let inFence = false;

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) {
      sections.push({
        headingPath: headingStack.filter(Boolean),
        level: headingStack.length,
        text
      });
    }
    buffer = [];
  };

  for (const line of lines) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      buffer.push(line);
      continue;
    }
    const level = inFence ? 0 : headingLevel(line);
    if (level > 0) {
      flush();
      headingStack.length = Math.max(0, level - 1);
      headingStack[level - 1] = line.replace(/^#{1,6}\s+/, "").trim();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return sections;
}

const SENTENCE_SPLIT = /(?<=[。！？；!?;])\s*(?=[^\s])|(?<=\.)\s+(?=[A-Z(])/;

/** 把长文本按「段落 → 句子 → 硬换行」逐级降级，拆到不超过 maxChars。 */
export function splitLongText(text, maxChars) {
  if (text.length <= maxChars) return [text];
  const pieces = [];

  for (const paragraph of text.split(/\n{2,}/)) {
    if (paragraph.length <= maxChars) {
      pieces.push(paragraph);
      continue;
    }
    for (const sentence of paragraph.split(SENTENCE_SPLIT)) {
      if (sentence.length <= maxChars) {
        pieces.push(sentence);
        continue;
      }
      // 单句仍然超长（表格、长代码行）：只能硬切
      for (let i = 0; i < sentence.length; i += maxChars) {
        pieces.push(sentence.slice(i, i + maxChars));
      }
    }
  }
  return pieces.filter((p) => p.trim().length > 0);
}

/** 贪心合并到接近 maxChars，避免产出大量碎片。 */
export function packPieces(pieces, maxChars, minChars = 0) {
  const out = [];
  let current = "";

  for (const piece of pieces) {
    const candidate = current ? `${current}\n\n${piece}` : piece;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) out.push(current);
    current = piece.length > maxChars ? piece.slice(0, maxChars) : piece;
  }
  if (current) out.push(current);

  // 末块太短就并回上一块，避免产出「只有一句话」的题源
  if (minChars > 0 && out.length > 1 && out[out.length - 1].length < minChars) {
    const tail = out.pop();
    out[out.length - 1] = `${out[out.length - 1]}\n\n${tail}`;
  }
  return out;
}

/** djb2：给 chunk 算个短指纹，用于跨源去重，不需要密码学强度。 */
export function fingerprint(text) {
  let h = 5381;
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  for (let i = 0; i < normalized.length; i++) h = ((h << 5) + h + normalized.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/**
 * 把一篇语料切成 chunk。返回的每个 chunk 自带出处信息（url/heading），
 * 便于下游直接填进题目的 source 字段。
 */
export function chunkDocument(doc, options = {}) {
  const { maxChars, minChars, maxChunks } = { ...DEFAULT_CHUNK, ...options };
  const sections = splitMarkdownSections(doc.text);
  const chunks = [];

  for (const section of sections) {
    const heading = section.headingPath.join(" › ");
    for (const text of packPieces(splitLongText(section.text, maxChars), maxChars, minChars)) {
      chunks.push({
        id: `${doc.id}#${chunks.length + 1}`,
        docId: doc.id,
        sourceId: doc.sourceId,
        title: doc.title,
        url: doc.url,
        license: doc.license,
        heading,
        chars: text.length,
        fingerprint: fingerprint(text),
        text
      });
      if (chunks.length >= maxChunks) return chunks;
    }
  }
  return chunks;
}

/** 跨文档去重：同一段文字在多篇语料里出现时只保留第一处。 */
export function dedupeChunks(chunks) {
  const seen = new Set();
  return chunks.filter((c) => {
    if (seen.has(c.fingerprint)) return false;
    seen.add(c.fingerprint);
    return true;
  });
}
