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
import { draftQuestionsWithModel } from "./llm.mjs";
import {
  ID_PREFIX,
  QUESTIONS_DIR,
  ROOT,
  assignIds,
  pickContractFields,
  readCategories,
  readQuestionFiles,
  validateAll,
  validateQuestion
} from "./question-schema.mjs";

const DRAFTS_DIR = path.join(ROOT, "content", "drafts");

/* ---------------- --draft ---------------- */

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
    : await draftQuestionsWithModel({ material, category, limit });

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
  const raw = Array.isArray(draft) ? draft : draft.questions;
  if (!Array.isArray(raw)) throw new Error("草稿文件里没有题目数组");

  // 先按契约裁剪并锁定分类，再做结构校验；这样流水线带的辅助字段不会漏进题库
  const incoming = raw.map((q) => ({ ...pickContractFields(q), categories: [category] }));

  const problems = [];
  incoming.forEach((q, i) =>
    validateQuestion(q, { categories }).forEach((msg) => problems.push(`草稿[${i}] ${q?.id ?? "?"}: ${msg}`))
  );
  if (problems.length) {
    console.error(`✗ 草稿有 ${problems.length} 处结构问题，未合并：`);
    problems.forEach((p) => console.error(`  ${p}`));
    process.exit(1);
  }

  // 跨分类题会让多个文件都含该分类，取「含得最多」的那个作为归口文件
  const targets = readQuestionFiles();
  const target = targets
    .map((t) => ({ ...t, count: t.questions.filter((q) => q.categories?.includes(category)).length }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)[0];
  if (!target) throw new Error(`题库里还没有「${category}」分类的文件，请先新建 app/src/data/questions/<分类>.json`);
  const targetPath = path.join(QUESTIONS_DIR, target.file);
  const fileKey = target.file.replace(/\.json$/, "");

  // 去重口径是题干（归一化后），这样重复跑流水线不会反复插入同一道题
  const norm = (s) => String(s).replace(/\s+/g, "").trim();
  const seenStems = new Set(target.questions.map((q) => norm(q.stem)));
  const fresh = incoming.filter((q) => !seenStems.has(norm(q.stem)));
  if (fresh.length !== incoming.length) console.log(`  跳过 ${incoming.length - fresh.length} 道题干重复的题`);
  if (fresh.length === 0) {
    console.log("✓ 没有需要合并的新题。");
    return;
  }

  // 落到具体文件时才编号：id 前缀由文件名决定，避免上游各自维护前缀
  const numbered = assignIds(fresh, fileKey, new Set(target.questions.map((q) => q.id)));
  const merged = [...target.questions, ...numbered];
  fs.writeFileSync(targetPath, JSON.stringify(merged, null, 2) + "\n");
  console.log(`✓ 合并 ${numbered.length} 题 → ${target.file}（现共 ${merged.length} 题）`);
  console.log(`  新 id：${numbered.map((q) => q.id).join(", ")}`);
  console.log("  提醒：题目顺序变了，请同步更新 app/src/data/questions/all.test.ts 的 EXPECTED_IDS。");
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

/** 只有被当作脚本直接执行时才跑 CLI；被 import 时（如流水线复用校验）不应有副作用。 */
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
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
}

export { runMerge };
