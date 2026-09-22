/**
 * 题目 / 草稿的**唯一契约**（shared contract）。
 *
 * 谁在用：
 *   - tools/gen-questions.mjs   出题草稿的校验与合并
 *   - tools/pipeline/*          抓取流水线产出的草稿
 *   - CI（.github/workflows）     题库不变量校验
 *
 * 放在这里而不是放在 gen-questions.mjs 里，是为了让「流水线」与「业务写入口」
 * 依赖同一份声明，而不是互相 import —— 两端都只依赖契约。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const QUESTIONS_DIR = path.join(ROOT, "app", "src", "data", "questions");

export const TYPES = new Set(["single", "judge", "scenario"]);
export const SOURCE_TYPES = new Set(["paper", "doc", "spec", "community"]);

/** 题目对象允许出现的字段，多一个都算错（能挡住拼写错误，如 wrongREason）。 */
export const QUESTION_FIELDS = new Set([
  "id",
  "type",
  "isPractice",
  "stem",
  "options",
  "explanation",
  "extension",
  "difficulty",
  "categories",
  "tags",
  "source"
]);

export const OPTION_FIELDS = new Set(["key", "content", "isCorrect", "wrongReason"]);
export const SOURCE_FIELDS = new Set(["type", "title", "url", "snippet"]);

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

/** 题库文件名 → 该文件里题目 id 的前缀。 */
export const ID_PREFIX = {
  base: "q_base_",
  prompt: "q_prompt_",
  rag: "q_rag_",
  agent: "q_agent_",
  ontology: "q_onto_",
  tuning: "q_tune_",
  eval: "q_eval_",
  engineering: "q_eng_"
};

function unknownKeys(obj, allowed) {
  return Object.keys(obj ?? {}).filter((k) => !allowed.has(k));
}

/** 校验单题结构，返回问题列表（空数组 = 通过）。 */
export function validateQuestion(q, { categories, idPrefix } = {}) {
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

  const extra = unknownKeys(q, QUESTION_FIELDS);
  need(extra.length === 0, `出现未定义字段：${extra.join(", ")}`);

  const options = Array.isArray(q?.options) ? q.options : [];
  need(options.length >= 2, "至少要有 2 个选项");
  const keys = options.map((o) => o?.key);
  need(new Set(keys).size === keys.length, "选项 key 重复");
  options.forEach((o) => {
    need(typeof o?.content === "string" && o.content.trim().length > 0, `选项 ${o?.key} 内容为空`);
    const optExtra = unknownKeys(o, OPTION_FIELDS);
    need(optExtra.length === 0, `选项 ${o?.key} 出现未定义字段：${optExtra.join(", ")}`);
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
  if (categories) cats.forEach((c) => need(categories.includes(c), `分类不在白名单内：${c}`));
  need(Array.isArray(q?.tags), "缺少 tags 数组");

  const src = q?.source ?? {};
  need(SOURCE_TYPES.has(src.type), `source.type 非法：${src.type}`);
  need(typeof src.title === "string" && src.title.trim().length > 0, "缺少 source.title");
  need(typeof src.url === "string" && src.url.trim().length > 0, "缺少 source.url");
  need(typeof src.snippet === "string" && src.snippet.trim().length > 0, "缺少 source.snippet（出处原文片段）");
  const srcExtra = unknownKeys(src, SOURCE_FIELDS);
  need(srcExtra.length === 0, `source 出现未定义字段：${srcExtra.join(", ")}`);
  return errs;
}

/** 全量校验题库，返回问题清单与题量。 */
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

/**
 * 给待合并的题目重新分配 id：按目标文件的前缀 + 递增序号。
 * 流水线产出的草稿用中性 id，落到具体分类文件时才编号，避免两处维护前缀。
 */
export function assignIds(questions, fileKey, existingIds = new Set()) {
  const prefix = ID_PREFIX[fileKey];
  if (!prefix) throw new Error(`未知的题库文件前缀：${fileKey}`);
  const used = new Set([...existingIds].filter((id) => String(id).startsWith(prefix)));
  let seq = 1;
  return questions.map((q) => {
    while (used.has(prefix + String(seq).padStart(3, "0"))) seq += 1;
    const id = prefix + String(seq).padStart(3, "0");
    used.add(id);
    seq += 1;
    return { ...q, id };
  });
}

/** 合并时只保留契约内的字段，丢弃流水线可能带上的辅助字段。 */
export function pickContractFields(question) {
  const out = {};
  for (const field of QUESTION_FIELDS) if (question[field] !== undefined) out[field] = question[field];
  out.options = (question.options ?? []).map((o) => {
    const opt = {};
    for (const field of OPTION_FIELDS) if (o[field] !== undefined) opt[field] = o[field];
    return opt;
  });
  const src = {};
  for (const field of SOURCE_FIELDS) if (question.source?.[field] !== undefined) src[field] = question.source[field];
  out.source = src;
  return out;
}
