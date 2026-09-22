/**
 * 权威开源源注册表 + 抓取适配器。
 *
 * 为什么是这几家：题目要能溯源到「一手、可引用、许可清楚」的材料。
 * 官方文档 / 官方示例库 / 安全标准 / 预印本平台，比二手博客可靠得多。
 *
 * 与业务解耦：本模块不认识「题库」「分类白名单」这些概念，
 * 只输出统一的原始素材（path/url/text/license），
 * suggestCategories 只是**建议**，最终归类由人工在 --merge 时决定。
 */
import { buildArxivUrl, parseArxivFeed } from "./arxiv.mjs";

export const SOURCES = [
  {
    id: "openai-cookbook",
    name: "OpenAI Cookbook",
    kind: "github",
    repo: "openai/openai-cookbook",
    ref: "main",
    license: "MIT",
    homepage: "https://github.com/openai/openai-cookbook",
    authority: "OpenAI 官方示例库：RAG、评估、结构化输出等工程实践的一手来源",
    include: /^articles\/(?!gpt-oss\/)[^/]+\.mdx?$/,
    suggestCategories: ["RAG", "评估与可观测"]
  },
  {
    id: "prompt-eng-guide",
    name: "Prompt Engineering Guide (DAIR.AI)",
    kind: "github",
    repo: "dair-ai/Prompt-Engineering-Guide",
    ref: "main",
    license: "MIT",
    homepage: "https://www.promptingguide.ai/",
    authority: "被广泛引用的提示工程系统性综述（论文 + 指南）",
    include: /^pages\/[^/]+\/[^/]+\.md$/,
    suggestCategories: ["提示工程"]
  },
  {
    id: "genai-for-beginners",
    name: "Generative AI for Beginners (Microsoft)",
    kind: "github",
    repo: "microsoft/generative-ai-for-beginners",
    ref: "main",
    license: "MIT",
    homepage: "https://github.com/microsoft/generative-ai-for-beginners",
    authority: "微软官方课程：21 课覆盖 LLM 应用、RAG、Agent、安全",
    include: /^\d\d-[^/]+\/README\.md$/,
    exclude: /translations\//,
    minBytes: 5000,
    suggestCategories: ["RAG", "Agent"]
  },
  {
    id: "transformers-docs",
    name: "Hugging Face Transformers Docs",
    kind: "github",
    repo: "huggingface/transformers",
    ref: "main",
    license: "Apache-2.0",
    homepage: "https://huggingface.co/docs/transformers",
    authority: "主流开源模型库官方文档，模型机制与推理细节的一手说明",
    // 只取英文顶层文档，排除自动生成的 model_doc 与各类翻译
    include: /^docs\/source\/en\/[^/]+\.mdx?$/,
    suggestCategories: ["大模型基础", "微调与对齐"]
  },
  {
    id: "owasp-llm-top10",
    name: "OWASP Top 10 for LLM Applications",
    kind: "github",
    repo: "OWASP/www-project-top-10-for-large-language-model-applications",
    ref: "main",
    license: "CC-BY-SA-4.0",
    homepage: "https://genai.owasp.org/llm-top-10/",
    authority: "OWASP 官方 LLM 应用安全风险清单，业界事实标准",
    include: /^2_0_vulns\/LLM\d\d_[^/]+\.md$/,
    suggestCategories: ["工程与部署"]
  },
  {
    id: "arxiv",
    name: "arXiv (cs.CL / cs.AI)",
    kind: "arxiv",
    license: "arXiv 非排他许可（部分 CC-BY，以论文页为准）",
    homepage: "https://arxiv.org/",
    authority: "预印本平台：方法的第一手表述，但要当作「作者观点」而非定论",
    queries: [
      { label: "rag", query: 'all:"retrieval augmented generation"', suggestCategories: ["RAG"] },
      { label: "evaluation", query: 'all:"LLM evaluation" AND cat:cs.CL', suggestCategories: ["评估与可观测"] },
      { label: "agents", query: 'all:"LLM agent" AND cat:cs.AI', suggestCategories: ["Agent"] },
      { label: "finetuning", query: 'all:"instruction tuning"', suggestCategories: ["微调与对齐"] }
    ]
  }
];

export function listSources() {
  return SOURCES.map((s) => ({ ...s }));
}

export function getSourceById(id) {
  const found = SOURCES.find((s) => s.id === id);
  if (!found) throw new Error(`未知的源：${id}（可用：${SOURCES.map((s) => s.id).join(", ")}）`);
  return found;
}

export function githubTreeUrl(repo, ref) {
  return `https://api.github.com/repos/${repo}/git/trees/${ref}?recursive=1`;
}

export function rawFileUrl(repo, ref, filePath) {
  return `https://raw.githubusercontent.com/${repo}/${ref}/${filePath}`;
}

/** 引用用这个地址（人可读、带行内上下文），比 raw 地址更适合放进题目出处。 */
export function blobUrl(repo, ref, filePath) {
  return `https://github.com/${repo}/blob/${ref}/${filePath}`;
}

/**
 * 从仓库文件树里挑出要抓的文件。纯函数，便于单测。
 * @returns {{ selected: string[], skipped: Array<{path: string, reason: string}> }}
 */
export function selectRepoPaths(tree, source, { limit = 20 } = {}) {
  const skipped = [];
  const matched = [];

  for (const node of tree) {
    if (node.type !== "blob") continue;
    if (!/\.(md|mdx)$/i.test(node.path)) continue;
    if (source.exclude && source.exclude.test(node.path)) continue;
    if (!source.include.test(node.path)) continue;
    if (node.size !== undefined && node.size < (source.minBytes ?? 3000)) {
      skipped.push({ path: node.path, reason: `文件过小（${node.size} < ${source.minBytes ?? 3000} 字节）` });
      continue;
    }
    matched.push(node.path);
  }

  matched.sort();
  const selected = matched.slice(0, limit);
  for (const path of matched.slice(limit)) skipped.push({ path, reason: `超出本次上限 ${limit}` });
  return { selected, skipped };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GitHub：一次树 API 列出全部文件 → 按 include 规则筛选 → 逐个抓 raw 正文。 */
async function fetchGithubSource(source, ctx) {
  const { logger, httpGetJson, httpGetText, limit } = ctx;
  const docs = [];
  const skipped = [];

  const tree = await httpGetJson(githubTreeUrl(source.repo, source.ref), {
    logger,
    label: `${source.id}:tree`
  });
  if (tree.truncated) {
    logger.warn("source.tree_truncated", { source: source.id, note: "文件树被截断，本次结果可能不完整" });
  }
  const nodes = (tree.tree ?? []).filter((n) => n.type === "blob");
  logger.info("source.tree", { source: source.id, repo: source.repo, ref: source.ref, blobs: nodes.length });

  const { selected, skipped: filtered } = selectRepoPaths(nodes, source, { limit });
  skipped.push(...filtered);
  logger.info("source.select", { source: source.id, selected: selected.length, skipped: skipped.length });

  for (const filePath of selected) {
    const url = blobUrl(source.repo, source.ref, filePath);
    try {
      const text = await httpGetText(rawFileUrl(source.repo, source.ref, filePath), {
        logger,
        label: `${source.id}:${filePath}`
      });
      docs.push({ path: filePath, url, text, meta: { repo: source.repo, ref: source.ref, bytes: text.length } });
      logger.debug("source.file_ok", { source: source.id, path: filePath, bytes: text.length });
    } catch (err) {
      skipped.push({ path: filePath, reason: err.message });
      logger.warn("source.file_fail", { source: source.id, path: filePath, reason: err.message });
    }
    await sleep(source.delayMs ?? 120);
  }
  return { docs, skipped };
}

/** arXiv：按查询式取 feed → 解析条目 → 按 arxivId 去重。 */
async function fetchArxivSource(source, ctx) {
  const { logger, httpGetText, limit } = ctx;
  const docs = [];
  const skipped = [];
  const seen = new Set();

  for (const q of source.queries ?? []) {
    const url = buildArxivUrl({ query: q.query, limit });
    try {
      const xml = await httpGetText(url, { logger, label: `${source.id}:${q.label}` });
      const entries = parseArxivFeed(xml);
      logger.info("source.arxiv_query", { source: source.id, query: q.label, entries: entries.length });
      if (entries.length === 0) skipped.push({ path: `query:${q.label}`, reason: "接口没有返回条目" });

      for (const entry of entries) {
        if (seen.has(entry.arxivId)) {
          skipped.push({ path: entry.arxivId, reason: "与前面查询重复" });
          continue;
        }
        seen.add(entry.arxivId);
        docs.push({
          path: `arxiv/${entry.arxivId.replace(/\//g, "_")}.xml`,
          url: entry.url,
          text: `${entry.title}\n\n${entry.summary}`,
          meta: {
            arxivId: entry.arxivId,
            authors: entry.authors,
            publishedAt: entry.publishedAt,
            primaryCategory: entry.primaryCategory,
            query: q.label,
            textKind: "abstract"
          }
        });
      }
    } catch (err) {
      skipped.push({ path: `query:${q.label}`, reason: err.message });
      logger.warn("source.arxiv_fail", { source: source.id, query: q.label, reason: err.message });
    }
    await sleep(source.delayMs ?? 120);
  }
  return { docs, skipped };
}

/**
 * 抓一个源。httpGetJson/httpGetText 由调用方注入（默认用真实实现），
 * 方便测试时替换成假实现，不联网也能验证编排逻辑。
 */
export async function fetchSource(source, ctx) {
  const timer = ctx.logger.timer("source", { source: source.id });
  ctx.logger.info("source.start", {
    source: source.id,
    name: source.name,
    kind: source.kind,
    license: source.license,
    limit: ctx.limit
  });

  const result = source.kind === "github" ? await fetchGithubSource(source, ctx) : await fetchArxivSource(source, ctx);

  ctx.logger.count("docs.fetched", result.docs.length);
  ctx.logger.count("docs.skipped", result.skipped.length);
  timer({ docs: result.docs.length, skipped: result.skipped.length });
  return result;
}
