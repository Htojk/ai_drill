#!/usr/bin/env node
// 从「笔记型仓库」抽取问答题，产出可合并的草稿（与业务解耦）。
//
// 与 tools/pipeline/run.mjs 的分工：
//   run.mjs       面向「连续叙述型素材」，按长度切块后出题（需要出题模型）
//   extract-notes 面向「标题即问题、正文即答案」的笔记仓库，直接抽取现成问答
//
// 两者共用 http/logger/paths 三个基础模块，都不认识题库与分类白名单；
// 唯一业务写入口仍然是 node tools/gen-questions.mjs --merge。
//
// 用法：
//   node tools/extract-notes.mjs --repo wdndev/llm_interview_note --ref main
//   node tools/extract-notes.mjs --repo wdndev/llm_interview_note --cache-only   # 只抓不抽
//   node tools/extract-notes.mjs --local content/raw/notes-wdndev               # 离线重跑抽取
//
// 日志：控制台 + content/logs/<runId>.jsonl；报告写 content/reports/notes-<runId>.json。

import fs from "node:fs";
import path from "node:path";
import { httpGetJson, httpGetText } from "./pipeline/http.mjs";
import { createLogger, newRunId } from "./pipeline/logger.mjs";
import { CONTENT, LOGS_DIR, RAW_DIR, REPORTS_DIR, rel } from "./pipeline/paths.mjs";
import { extractFiles, toDraftQuestion } from "./pipeline/notes.mjs";

const DEFAULT_REPO = "wdndev/llm_interview_note";
const DEFAULT_REF = "main";

const VALUE_FLAGS = new Set(["repo", "ref", "local", "limit", "level", "out"]);

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (VALUE_FLAGS.has(key) && next && !next.startsWith("--")) { args[key] = next; i++; }
      else args[key] = true;
    } else args._.push(a);
  }
  return args;
}

/** 缓存的本地文件名里不能带路径分隔符，压平成 a__b.md，并留一份映射。 */
function flatName(filePath) {
  return filePath.replace(/\//g, "__");
}

function writeCache(cacheDir, filePath, text, logger) {
  const target = path.join(cacheDir, flatName(filePath));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  logger?.debug("notes.cache_write", { file: filePath, bytes: text.length });
}

function readCache(cacheDir, logger) {
  const files = [];
  for (const name of fs.readdirSync(cacheDir)) {
    if (!name.endsWith(".md")) continue;
    const filePath = name.replace(/__/g, "/");
    const text = fs.readFileSync(path.join(cacheDir, name), "utf8");
    files.push({ path: filePath, text });
    logger?.debug("notes.cache_read", { file: filePath, bytes: text.length });
  }
  return files;
}

/** 并发受控地抓取，单个文件失败只记 error 并跳过，不中断整轮。 */
async function fetchFiles({ repo, ref, files, logger, limit, concurrency = 6 }) {
  const targets = limit ? files.slice(0, limit) : files;
  const base = `https://raw.githubusercontent.com/${repo}/${ref}/`;
  const out = [];
  let idx = 0;

  async function worker() {
    while (idx < targets.length) {
      const filePath = targets[idx++];
      const url = base + filePath.split("/").map(encodeURIComponent).join("/");
      try {
        const text = await httpGetText(url, { logger, label: filePath });
        out.push({ path: filePath, text });
        logger.count("files.fetched");
      } catch (err) {
        logger.error("notes.fetch_failed", { file: filePath, reason: err.message, status: err.status });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = args.repo ?? DEFAULT_REPO;
  const ref = args.ref ?? DEFAULT_REF;
  const runId = newRunId();
  const logger = createLogger({ runId, stage: "notes", level: args.level, console: !args.quiet });
  const sourceId = `notes-${repo.split("/").pop()}`;

  logger.info("notes.start", { runId, repo, ref, local: args.local ?? "(无)", node: process.version });

  let files = [];
  let commit = null;
  const cacheDir = path.join(RAW_DIR, sourceId);

  if (args.local) {
    // 离线模式：只跑抽取，不联网
    const localDir = path.isAbsolute(args.local) ? args.local : path.join(process.cwd(), args.local);
    files = readCache(localDir, logger);
    logger.info("notes.loaded_local", { dir: rel(localDir), files: files.length });
  } else {
    const stopTree = logger.timer("stage.tree");
    const tree = await httpGetJson(`https://api.github.com/repos/${repo}/git/trees/${ref}?recursive=1`, { logger });
    if (tree.truncated) logger.warn("notes.tree_truncated", { repo, ref });
    const mdPaths = tree.tree.filter((t) => t.type === "blob" && t.path.endsWith(".md")).map((t) => t.path);
    stopTree({ entries: tree.tree.length, markdown: mdPaths.length });
    logger.count("files.discovered", mdPaths.length);

    // 记下确切 commit，保证「这批题来自哪个版本」可复现
    try {
      const commits = await httpGetJson(`https://api.github.com/repos/${repo}/commits/${ref}`, { logger });
      commit = commits.sha;
      logger.info("notes.commit", { sha: commit, date: commits.commit?.committer?.date });
    } catch (err) {
      logger.warn("notes.commit_unknown", { reason: err.message });
    }

    const stopFetch = logger.timer("stage.fetch");
    files = await fetchFiles({ repo, ref, files: mdPaths, logger, limit: args.limit ? Number(args.limit) : null });
    stopFetch({ fetched: files.length });

    fs.mkdirSync(cacheDir, { recursive: true });
    for (const f of files) writeCache(cacheDir, f.path, f.text, logger);
    logger.info("notes.cache_saved", { dir: rel(cacheDir), files: files.length });
  }

  if (args["cache-only"]) {
    const summary = logger.close();
    logger.info("notes.cache_only_done", { files: files.length, log: rel(path.join(LOGS_DIR, `${runId}.jsonl`)) });
    process.stdout.write(`\n只抓取未抽取：缓存 ${files.length} 个文件 → ${rel(cacheDir)}\n下一步：node tools/extract-notes.mjs --local ${rel(cacheDir)}\n`);
    void summary;
    return;
  }

  const stopExtract = logger.timer("stage.extract");
  const { items, stats } = extractFiles(files, { logger });
  stopExtract({ questions: stats.questions });
  logger.info("notes.extracted", { ...stats, byCategory: JSON.stringify(stats.byCategory) });

  if (items.length === 0) {
    logger.warn("notes.empty", { hint: "没有抽到问答，检查文件结构与 isQuestionTitle 规则" });
  }

  const webUrl = `https://github.com/${repo}`;
  const draftsDir = path.join(CONTENT, "drafts");
  fs.mkdirSync(draftsDir, { recursive: true });

  // 合并时 --merge 会把 categories 强制改成传入的单个分类，
  // 所以按分类拆成多个草稿文件，避免混在一起被统一标成同一类。
  const byCategory = new Map();
  items.forEach((item, i) => {
    const q = toDraftQuestion(item, { repoWebUrl: webUrl, ref: commit ?? ref, index: i });
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category).push(q);
  });

  const written = [];
  for (const [category, questions] of [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const slug = category.replace(/[^\w\u4e00-\u9fa5]+/g, "-");
    const file = path.join(draftsDir, `${sourceId}-${runId}-${slug}.json`);
    fs.writeFileSync(file, JSON.stringify(questions, null, 2) + "\n");
    written.push({ category, count: questions.length, file: rel(file) });
    logger.info("notes.draft_written", { category, count: questions.length, file: rel(file) });
  }

  const summary = logger.close();
  const report = {
    runId,
    repo,
    ref,
    commit,
    startedAt: new Date().toISOString(),
    stats,
    drafts: written,
    summary,
    warnings: logger.warnings(),
    errors: logger.errors(),
    licenseNote:
      "该仓库未声明 LICENSE（API license=null，LICENSE 404）。默认版权保留，" +
      "把内容复制进公开站点有侵权风险；草稿统一打了「待复核」标签，入库前需确认使用方式。",
    nextStep: written.length
      ? `人工复核后合并：node tools/gen-questions.mjs --merge <草稿> <分类>（每个分类一个文件）`
      : "本次没有产出草稿，检查上方 warn/error"
  };
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const reportFile = path.join(REPORTS_DIR, `notes-${runId}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(path.join(REPORTS_DIR, "notes-latest.json"), JSON.stringify(report, null, 2) + "\n");

  logger.info("notes.done", {
    report: rel(reportFile),
    drafts: written.length,
    questions: items.length,
    warnings: summary.warningCount,
    errors: summary.errorCount,
    elapsedMs: summary.elapsedMs
  });
  process.stdout.write(`\n${report.licenseNote}\n下一步：${report.nextStep}\n`);
  if (summary.errorCount > 0) process.exitCode = 1;
}

try {
  await main();
} catch (err) {
  process.stderr.write(`✗ ${err.message}\n`);
  process.exitCode = 1;
}
