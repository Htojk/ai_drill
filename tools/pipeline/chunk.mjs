/**
 * 语料切分与打包：把「已切好的块」（pieces，见 normalize.splitBlocks/toChunkPieces）
 * 合并成适合出题的小块（chunk）。
 *
 * 关键约定：每个 chunk 同时带 text（规范化，供出题阅读）与 verbatim（原文，供出处引用）。
 * verbatim 直接来自原文切片，因此题目里的 source.snippet 可以保证逐字引用。
 * 本模块不 import normalize，避免循环依赖；纯函数，无 IO，方便单测。
 */

export const DEFAULT_CHUNK = { maxChars: 1200, minChars: 200, maxChunks: 40 };

/** 是否是 markdown 标题行，返回层级（# 的个数）；不是标题返回 0。 */
export function headingLevel(line) {
  const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
  return m ? m[1].length : 0;
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

/** djb2：给 chunk 算个短指纹，用于跨源去重，不需要密码学强度。 */
export function fingerprint(text) {
  let h = 5381;
  const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
  for (let i = 0; i < normalized.length; i++) h = ((h << 5) + h + normalized.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/**
 * 把「块」按顺序贪心打包成 chunk。
 * 每个 chunk 的 verbatim 是参与打包的块原文按序拼接，因此在原文里仍然连续；
 * text 是对应的规范化文本。
 *
 * @param {Array<{headingPath: string[], raw: string, text: string}>} pieces
 * @param {object} doc 语料元信息（id/sourceId/title/url/license）
 */
export function chunkPieces(pieces, doc, options = {}) {
  const { maxChars, minChars, maxChunks } = { ...DEFAULT_CHUNK, ...options };
  const chunks = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    chunks.push({
      id: `${doc.id}#${chunks.length + 1}`,
      docId: doc.id,
      sourceId: doc.sourceId,
      title: doc.title,
      url: doc.url,
      license: doc.license,
      heading: current.headingPath.join(" › "),
      chars: current.text.length,
      fingerprint: fingerprint(current.verbatim),
      text: current.text,
      verbatim: current.verbatim
    });
    current = null;
  };

  for (const piece of pieces) {
    const text = piece.text.trim();
    const raw = piece.raw.trim();
    if (!text && !raw) continue;

    if (!current) {
      current = { headingPath: piece.headingPath, text, verbatim: raw };
      continue;
    }
    if (current.text.length + text.length + 2 <= maxChars) {
      current.text += `\n\n${text}`;
      current.verbatim += `\n\n${raw}`;
      continue;
    }
    flush();
    current = { headingPath: piece.headingPath, text, verbatim: raw };
    if (chunks.length >= maxChunks) break;
  }
  flush();

  if (chunks.length > maxChunks) chunks.length = maxChunks;
  // 末块太短就并回上一块，避免产出「只有一句话」的题源
  if (minChars > 0 && chunks.length > 1 && chunks[chunks.length - 1].chars < minChars) {
    const tail = chunks.pop();
    const prev = chunks[chunks.length - 1];
    prev.text = `${prev.text}\n\n${tail.text}`;
    prev.verbatim = `${prev.verbatim}\n\n${tail.verbatim}`;
    prev.chars = prev.text.length;
  }
  return chunks;
}

/**
 * 一篇语料 → chunk。优先用 doc.blocks（带原文，可保证 snippet 逐字）；
 * 没有 blocks 时退回按 doc.text 切（此路径的 verbatim 等同 text）。
 */
export function chunkDocument(doc, options = {}) {
  const { maxChars } = { ...DEFAULT_CHUNK, ...options };
  const blocks = doc.blocks?.length ? doc.blocks : [{ headingPath: [], raw: doc.text, text: doc.text }];
  const pieces = blocks.flatMap((block) =>
    block.raw.length <= maxChars
      ? [block]
      : splitLongText(block.raw, maxChars).map((raw) => ({ headingPath: block.headingPath, raw, text: raw }))
  );
  return chunkPieces(pieces, doc, options);
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
