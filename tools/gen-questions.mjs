#!/usr/bin/env node
/**
 * 离线题库流水线：素材 → 草稿 → 校验 → 合并进题库 JSON。
 *
 * 三个子命令（都不需要联网即可跑通，只有 --draft 不带 --offline 时才调模型）：
 *
 *   node tools/gen-questions.mjs --check
 *       校验 app/src/data/questions/*.json 的全部不变量。CI 与提交前用。
 *
 *   node tools/gen-questions.mjs --draft content/sources/rag-paper.md [--offline] [--limit 5]
 *       从素材生成草稿到 content/drafts/。默认调用 OpenAI 兼容接口
 *       （OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL，走 chat/completions）；
 *       --offline 用模板生成结构完整的占位草稿，方便无 key 时跑通链路。
 *
 *   node tools/gen-questions.mjs --merge content/drafts/rag-paper.json RAG
 *       校验草稿并追加进 app/src/data/questions/<分类>.json（按 id 去重）。
 *       追加会改变题目顺序，记得同步 all.test.ts 里的 EXPECTED_IDS。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUESTIONS_DIR = path.join(ROOT, "app", "src", "data", "questions");
const DRAFTS_DIR = path.join(ROOT, "content", "drafts");

/** 分类白名单直接从 index.ts 解析，避免两处维护。 */
export function readCategories() {
  const text = fs.readFileSync(path.join(QUESTIONS_DIR, "index.ts"), "utf8");
  const block = text.match(/CATEGORIES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!block) throw new Error("无法从 index.ts 解析 CATEGORIES");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

export function readQuestionFiles() {
  return fs
    .readdirSync(QUESTIONS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => ({ file, questions: JSON.parse(fs.readFileSync(path.join(QUESTIONS_DIR, file), "utf8")) }));
}

const TYPES = new Set(["single", "judge", "scenario"]);
const SOURCE_TYPES = new Set(["paper", "doc", "spec", "community"]);

/** 校验单题结构，返回问题列表（空数组 = 通过）。 */
export function validateQuestion(q, { categories, idPrefix }) {
  const errs = [];
  const need = (cond, msg) => {
    if (!cond) errs.push(msg);
  };

  need(typeof q?.id === "string" && q.id.length > 0, "缺少 id");
  if (idPrefix) need(String(q?.id).startsWith(idPrefix), `id 应以 ${idPrefix} 开头（与文件名一致）`);
  need(TYPES.has(q?.type), `type 非法：${q?.type}`);
  need(typeof q?.isPractice === "boolean", "isPractice 必须是布尔值");
  need(typeof q?.stem === "string" && q.stem.trim().length > 0, "题干为空");
  need(typeof q?.explanation === "string" && q.explanation.trim().length > 0, "缺少解析");
  need(Number.isInteger(q?.difficulty) && q.difficulty >= 1 && q.difficulty <= 5, "difficulty 必须是 1-5");

  const options = Array.isArray(q?.options) ? q.options : [];
  need(options.length >= 2, "至少要有 2 个选项");
  const keys = options.map((o) => o?.key);
  need(new Set(keys).size === keys.length, "选项 key 重复");
  options.forEach((o) => {
    need(typeof o?.content === "string" && o.content.trim().length > 0, `选项 ${o?.key} 内容为空`);
    if (o && o.isCorrect === false) {
      need(
        typeof o.wrongReason === "string" && o.wrongReason.trim().length > 0,
        `干扰项 ${o.key} 缺少 wrongReason（分层解析要求每个错项都说明为什么错）`
      );
    }
  });
  need(options.filter((o) => o?.isCorrect).length >= 1, "没有正确答案");
  need(options.filter((o) => !o?.isCorrect).length >= 1, "不能所有选项都是正确答案（会渲染成多选）");

  const cats = Array.isArray(q?.categories) ? q.categories : [];
  need(cats.length > 0, "缺少分类");
  cats.forEach((c) => need(categories.includes(c), `分类不在白名单内：${c}`));
  need(Array.isArray(q?.tags), "缺少 tags 数组");

  const src = q?.source ?? {};
  need(SOURCE_TYPES.has(src.type), `source.type 非法：${src.type}`);
  need(typeof src.title === "string" && src.title.trim().length > 0, "缺少 source.title");
  need(typeof src.url === "string" && src.url.trim().length > 0, "缺少 source.url");
  need(typeof src.snippet === "string" && src.snippet.trim().length > 0, "缺少 source.snippet（出处原文片段）");
  return errs;
}

const ID_PREFIX = {
  base: "q_base_",
  prompt: "q_prompt_",
  rag: "q_rag_",
  agent: "q_agent_",
  ontology: "q_onto_",
  tuning: "q_tune_",
  eval: "q_eval_",
  engineering: "q_eng_"
};

export function validateAll() {
  const categories = readCategories();
  const problems = [];
  const seenIds = new Map();
  let total = 0;

  for (const { file, questions } of readQuestionFiles()) {
    const name = file.replace(/\.json$/, "");
    if (!Array.isArray(questions)) {
      problems.push(`${file}: 顶层必须是数组`);
      continue;
    }
    total += questions.length;
    questions.forEach((q, i) => {
      validateQuestion(q, { categories, idPrefix: ID_PREFIX[name] }).forEach((msg) =>
        problems.push(`${file}[${i}] ${q?.id ?? "?"}: ${msg}`)
      );
      if (seenIds.has(q.id)) problems.push(`id 重复：${q.id}（${seenIds.get(q.id)} 与 ${file}）`);
      else seenIds.set(q.id, file);
    });
  }

  return { problems, total, categories };
}

/* ---------------- --draft ---------------- */

const DRAFT_SCHEMA_HINT = `只输出 JSON 数组，每个元素形如：
{
  "id": "q_rag_101",
  "type": "single" | "judge" | "scenario",
  "isPractice": false,
  "stem": "题干（中文，来自素材的真实考点，不要编造素材里没有的结论）",
  "options": [
    { "key": "A", "content": "...", "isCorrect": true },
    { "key": "B", "content": "...", "isCorrect": false, "wrongReason": "为什么这个选项错" }
  ],
  "explanation": "正确答案为什么对",
  "extension": "延伸知识点",
  "difficulty": 1,
  "categories": ["RAG"],
  "tags": ["..."],
  "source": { "type": "paper" | "doc" | "spec" | "community", "title": "标题", "url": "https://...", "snippet": "素材原文片段（必须逐字摘录）" }
}`;

function buildMessages(material, category, limit) {
  return [
    {
      role: "system",
      content:
        "你是 AI 工程知识题库编辑。根据用户给出的素材出单选题，题干与解析用中文。" +
        "每道题必须有 4 个选项、恰好 1 个正确答案、其余 3 个都要写 wrongReason，" +
        "source.snippet 必须逐字摘录素材原文。不要编造素材里没有的事实。\n" +
        DRAFT_SCHEMA_HINT
    },
    { role: "user", content: `分类：${category}\n最多 ${limit} 道题。素材如下：\n\n${material}` }
  ];
}

function extractJson(text) {
  const cleaned = text.replace(/^\s*```(?:json)?/m, "").replace(/```\s*$/m, "");
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("模型输出里找不到 JSON 数组");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function draftWithModel(material, category, limit) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("缺少 OPENAI_API_KEY；如只想跑通链路请加 --offline");
  const base = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, temperature: 0.3, messages: buildMessages(material, category, limit) })
  });
  if (!res.ok) throw new Error(`模型接口返回 ${res.status}：${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return extractJson(data.choices?.[0]?.message?.content ?? "");
}

/** 离线草稿：结构完整但内容需要人工填，用来验证链路与字段规范。 */
function draftOffline(material, category, limit, title) {
  const paragraphs = material
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 40)
    .slice(0, limit);

  return paragraphs.map((p, i) => ({
    id: `q_${category.toLowerCase()}_901${i}`,
    type: "single",
    isPractice: false,
    stem: `【离线占位草稿】素材要点：${p.slice(0, 60)}…`,
    options: [
      { key: "A", content: "占位：正确结论（待补齐）", isCorrect: true },
      { key: "B", content: "占位干扰项 1（待补齐）", isCorrect: false, wrongReason: "离线草稿占位，待人工补写。" },
      { key: "C", content: "占位干扰项 2（待补齐）", isCorrect: false, wrongReason: "离线草稿占位，待人工补写。" },
      { key: "D", content: "占位干扰项 3（待补齐）", isCorrect: false, wrongReason: "离线草稿占位，待人工补写。" }
    ],
    explanation: "离线草稿占位：请根据素材补写正确答案为什么对。",
    extension: "",
    difficulty: 3,
    categories: [category],
    tags: ["草稿"],
    source: { type: "doc", title, url: "https://example.com/待补", snippet: p.slice(0, 160) }
  }));
}

async function runDraft(args) {
  const file = args._[0];
  if (!file) throw new Error("用法：--draft <素材文件> [--offline] [--limit N] [--category 分类]");
  const material = fs.readFileSync(path.resolve(ROOT, file), "utf8");
  const category = args.category ?? "RAG";
  const limit = Number(args.limit ?? 5);
  const offline = args.offline === true;

  const questions = offline
    ? draftOffline(material, category, limit, path.basename(file))
    : await draftWithModel(material, category, limit);

  fs.mkdirSync(DRAFTS_DIR, { recursive: true });
  const outName = (args.out ?? path.basename(file).replace(/\.[^.]+$/, "")) + ".json";
  const outPath = path.join(DRAFTS_DIR, outName);
  fs.writeFileSync(
    outPath,
    JSON.stringify({ sourceFile: file, category, mode: offline ? "offline" : "model", generatedAt: new Date().toISOString(), questions }, null, 2) + "\n"
  );
  console.log(`✓ 生成草稿 ${questions.length} 题 → ${path.relative(ROOT, outPath)}`);
  console.log("  下一步：人工修订来源/解析后，用 --merge 合并进题库。");
}

/* ---------------- --merge ---------------- */

function runMerge(args) {
  const [draftFile, category] = args._;
  if (!draftFile || !category) throw new Error("用法：--merge <草稿文件> <分类>");

  const categories = readCategories();
  if (!categories.includes(category)) throw new Error(`分类不在白名单内：${category}`);

  const draft = JSON.parse(fs.readFileSync(path.resolve(ROOT, draftFile), "utf8"));
  const incoming = Array.isArray(draft) ? draft : draft.questions;
  if (!Array.isArray(incoming)) throw new Error("草稿文件里没有题目数组");
  incoming.forEach((q) => {
    q.categories = [category];
  });

  const problems = [];
  incoming.forEach((q, i) =>
    validateQuestion(q, { categories }).forEach((msg) => problems.push(`草稿[${i}] ${q?.id ?? "?"}: ${msg}`))
  );

  const targets = readQuestionFiles();
  const existingIds = new Set(targets.flatMap((t) => t.questions.map((q) => q.id)));
  const fresh = incoming.filter((q) => !existingIds.has(q.id));
  if (fresh.length !== incoming.length) console.log(`  跳过 ${incoming.length - fresh.length} 道已存在的题（按 id 去重）`);

  // 跨分类题会让多个文件都含该分类，取「含得最多」的那个作为归口文件
  const target = targets
    .map((t) => ({ ...t, count: t.questions.filter((q) => q.categories?.includes(category)).length }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)[0];
  if (!target) throw new Error(`题库里还没有「${category}」分类的文件，请先新建 app/src/data/questions/<分类>.json`);
  const targetPath = path.join(QUESTIONS_DIR, target.file);

  if (problems.length) {
    console.error(`✗ 草稿有 ${problems.length} 处结构问题，未合并：`);
    problems.forEach((p) => console.error(`  ${p}`));
    process.exit(1);
  }

  const merged = [...target.questions, ...fresh];
  fs.writeFileSync(targetPath, JSON.stringify(merged, null, 2) + "\n");
  console.log(`✓ 合并 ${fresh.length} 题 → ${target.file}（现共 ${merged.length} 题）`);
  if (fresh.length > 0) {
    console.log("  提醒：题目顺序变了，请同步更新 app/src/data/questions/all.test.ts 的 EXPECTED_IDS。");
  }
}

/* ---------------- 入口 ---------------- */

/** 只有这几个开关带值；--draft / --merge 后面的路径按位置参数处理。 */
const VALUE_FLAGS = new Set(["limit", "category", "out"]);

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (VALUE_FLAGS.has(key) && next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else args[key] = true;
    } else args._.push(a);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

try {
  if (args.merge) runMerge(args);
  else if (args.draft) await runDraft(args);
  else {
    const { problems, total } = validateAll();
    if (problems.length) {
      console.error(`✗ 题库校验失败，共 ${problems.length} 处问题：`);
      problems.forEach((p) => console.error(`  ${p}`));
      process.exit(1);
    }
    console.log(`✓ 题库校验通过：${total} 题，全部字段与分层解析要求完整`);
  }
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
