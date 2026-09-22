/**
 * 三个加工 stage：normalize（规范化）→ chunk（切分）→ draft（出草稿）。
 *
 * 每个 stage 只读写 content/ 下的 JSON/文本产物，互不 import 业务代码：
 *   raw/<sourceId>/*.md      ← fetch 阶段产出
 *   corpus/<sourceId>.json   ← CorpusDoc[]
 *   chunks/<sourceId>.json   ← TextChunk[]
 *   drafts/<runId>.json      ← 题目草稿（交给 gen-questions --merge 才进题库）
 *
 * 所有 stage 都会把「处理了多少、丢了多少、为什么丢」写进日志。
 */
import fs from "node:fs";
import path from "node:path";
import { chunkDocument, dedupeChunks } from "./chunk.mjs";
import { explodeBlocks, makeCorpusDoc, normalizeMarkdownDoc, snippetFrom } from "./normalize.mjs";
import { CHUNKS_DIR, CORPUS_DIR, DRAFTS_DIR, RAW_DIR, rel } from "./paths.mjs";
import { SOURCES } from "./sources.mjs";

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
}

/** fetch 阶段把正文写成 content/raw/<sourceId>/<序号>-<slug>.md，附带 manifest。 */
export function writeRawDocs(sourceId, docs, logger) {
  const dir = path.join(RAW_DIR, sourceId);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = [];

  docs.forEach((doc, index) => {
    const base = path.basename(doc.path).replace(/\.[^.]+$/, "");
    const fileName = `${String(index + 1).padStart(2, "0")}-${base.replace(/[^\w\u4e00-\u9fff.-]/g, "_")}.md`;
    fs.writeFileSync(path.join(dir, fileName), doc.text);
    manifest.push({ file: fileName, url: doc.url, path: doc.path, meta: doc.meta ?? {} });
    logger.debug("raw.written", { source: sourceId, file: fileName, bytes: doc.text.length });
  });

  writeJson(path.join(RAW_DIR, `${sourceId}.manifest.json`), manifest);
  logger.info("raw.saved", { source: sourceId, docs: manifest.length, dir: rel(dir) });
  return manifest;
}

/** normalize：raw 正文 → CorpusDoc（统一契约）。低价值内容在这里被丢掉并留痕。 */
export function runNormalize({ logger, sourceId } = {}) {
  const ids = sourceId ? [sourceId] : SOURCES.map((s) => s.id);
  const summary = {};

  for (const id of ids) {
    const source = SOURCES.find((s) => s.id === id);
    const manifestFile = path.join(RAW_DIR, `${id}.manifest.json`);
    if (!fs.existsSync(manifestFile)) {
      logger.warn("normalize.skip", { source: id, reason: "还没有抓取产物，先跑 fetch" });
      continue;
    }
    const manifest = readJson(manifestFile);
    const dir = path.join(RAW_DIR, id);
    const docs = [];
    let dropped = 0;
    let nonVerbatim = 0;

    for (const entry of manifest) {
      const raw = fs.readFileSync(path.join(dir, entry.file), "utf8");
      const doc = normalizeMarkdownDoc({
        sourceId: id,
        url: entry.url,
        license: source?.license,
        raw,
        fallbackTitle: entry.path,
        meta: entry.meta
      });
      if (!doc) {
        dropped += 1;
        logger.warn("normalize.drop", { source: id, file: entry.file, reason: "内容过短或近似目录" });
        continue;
      }
      // 题目的 source.snippet 必须逐字引用原文：这里卡一道（块原文须是素材的连续子串）
      if (!doc.meta.verbatimOk) {
        nonVerbatim += 1;
        logger.warn("normalize.not_verbatim", {
          source: id,
          file: entry.file,
          failedBlocks: doc.meta.verbatimFailedBlocks,
          reason: "块原文不是素材的连续子串，snippet 无法保证逐字引用（清洗规则可能引入了新字符）"
        });
      }
      docs.push(doc);
    }

    const outFile = path.join(CORPUS_DIR, `${id}.json`);
    writeJson(outFile, docs);
    summary[id] = { docs: docs.length, dropped };
    logger.count("corpus.docs", docs.length);
    logger.count("corpus.nonverbatim", nonVerbatim);
    logger.info("normalize.done", { source: id, docs: docs.length, dropped, nonVerbatim, out: rel(outFile) });
  }
  return summary;
}

/** chunk：CorpusDoc → TextChunk（带出处、去重）。 */
export function runChunk({ logger, chunkOptions } = {}) {
  const summary = {};

  for (const file of listJson(CORPUS_DIR)) {
    const sourceId = file.replace(/\.json$/, "");
    const docs = readJson(path.join(CORPUS_DIR, file));
    // 过长的块先按原文爆炸成小块，再打包（保证 raw ↔ text 一一对应）
    const all = docs.flatMap((doc) =>
      chunkDocument({ ...doc, blocks: explodeBlocks(doc.blocks, chunkOptions?.maxChars ?? 1200) }, chunkOptions)
    );
    const chunks = dedupeChunks(all);
    const outFile = path.join(CHUNKS_DIR, `${sourceId}.json`);
    writeJson(outFile, chunks);
    summary[sourceId] = { chunks: chunks.length, deduped: all.length - chunks.length };
    logger.count("chunks.total", chunks.length);
    logger.info("chunk.done", {
      source: sourceId,
      docs: docs.length,
      chunks: chunks.length,
      deduped: all.length - chunks.length,
      avgChars: chunks.length ? Math.round(chunks.reduce((s, c) => s + c.chars, 0) / chunks.length) : 0,
      out: rel(outFile)
    });
  }
  return summary;
}

/**
 * extract 模式：把 chunk 变成「待人工改写」的草稿，但**出处是真的**——
 * 真实 URL、真实来源标题、逐字摘录的原文片段（这三项正是模型最容易编造的部分）。
 */
export function chunkToDraft(chunk, source, category) {
  // snippet 直接来自原文切片，因此与出处逐字一致（截断只在词/句边界收尾）
  const snippet = snippetFrom(chunk.verbatim);
  return {
    id: `q_oss_${chunk.fingerprint}`,
    type: "single",
    isPractice: /工程|部署|安全|事故|选型|成本/.test(`${chunk.title}${chunk.heading}`),
    stem: `【待人工改写·出处：${source?.name ?? chunk.sourceId}】${chunk.heading || chunk.title}：请依据下面的出处原文设计一道单选题。`,
    options: [
      { key: "A", content: "【待填】与出处原文一致的表述", isCorrect: true },
      { key: "B", content: "【待填】干扰项", isCorrect: false, wrongReason: "待人工补写。" },
      { key: "C", content: "【待填】干扰项", isCorrect: false, wrongReason: "待人工补写。" },
      { key: "D", content: "【待填】干扰项", isCorrect: false, wrongReason: "待人工补写。" }
    ],
    explanation: `【待填】依据出处改写：${chunk.text.slice(0, 120)}…`,
    extension: "",
    difficulty: 3,
    categories: [category],
    tags: ["oss", source?.id ?? chunk.sourceId, "待人工改写"],
    source: {
      type: "doc",
      title: chunk.heading ? `${chunk.title} · ${chunk.heading}` : chunk.title,
      url: chunk.url,
      snippet: snippet.text
    }
  };
}

/**
 * draft stage。mode=extract 时离线产出候选（保证出处是真的，题目内容待人工写）；
 * mode=llm 时需要 OPENAI_API_KEY（在 run.mjs 里注入 llmDraft 函数）。
 */
export async function runDraft({ logger, runId, mode = "extract", perChunkLimit = 1, llmDraft, totalLimit = 20 }) {
  const chunksDir = CHUNKS_DIR;
  const drafts = [];
  const perSource = {};

  for (const file of listJson(chunksDir)) {
    const sourceId = file.replace(/\.json$/, "");
    const source = SOURCES.find((s) => s.id === sourceId);
    const category = source?.suggestCategories?.[0] ?? "工程与部署";
    const chunks = readJson(path.join(chunksDir, file));
    if (chunks.length === 0) {
      logger.warn("draft.empty", { source: sourceId, reason: "没有可用 chunk" });
      continue;
    }

    let produced = [];
    if (mode === "llm" && llmDraft) {
      const take = chunks.slice(0, Math.min(chunks.length, perChunkLimit));
      for (const chunk of take) {
        try {
          const questions = await llmDraft(chunk, category);
          produced.push(...questions);
          logger.info("draft.llm_ok", { source: sourceId, chunk: chunk.id, questions: questions.length });
        } catch (err) {
          logger.warn("draft.llm_fail", { source: sourceId, chunk: chunk.id, reason: err.message });
        }
      }
    } else {
      produced = chunks.slice(0, perChunkLimit).map((chunk) => chunkToDraft(chunk, source, category));
    }

    perSource[sourceId] = { chunks: chunks.length, drafts: produced.length, category };
    logger.count("drafts.total", produced.length);
    const snippets = produced.map((q) => q.source?.snippet?.length ?? 0);
    logger.info("draft.done", {
      source: sourceId,
      chunks: chunks.length,
      drafts: produced.length,
      mode,
      suggestedCategory: category,
      snippetChars: snippets.length ? `${Math.min(...snippets)}~${Math.max(...snippets)}` : 0
    });
    drafts.push(...produced);
  }

  const limited = drafts.slice(0, totalLimit);
  const outFile = path.join(DRAFTS_DIR, `oss-${runId}.json`);
  writeJson(outFile, {
    generatedBy: "tools/pipeline/run.mjs",
    runId,
    mode,
    generatedAt: new Date().toISOString(),
    note: "extract 模式的题目内容需要人工改写；出处（url/snippet）来自权威开源项目原文，可直接采用。",
    perSource,
    questions: limited
  });
  logger.info("draft.saved", { drafts: limited.length, out: rel(outFile), truncated: drafts.length - limited.length });
  return { file: outFile, count: limited.length, perSource, dropped: drafts.length - limited.length };
}
