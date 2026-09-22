#!/usr/bin/env node
/**
 * 题目获取流水线（与业务解耦）。
 *
 *   fetch     从权威开源项目抓正文       → content/raw/<sourceId>/*.md + manifest
 *   normalize 规范化成统一契约 CorpusDoc → content/corpus/<sourceId>.json
 *   chunk     切成适合出题的小块          → content/chunks/<sourceId>.json
 *   draft     产出题目草稿                → content/drafts/oss-<runId>.json
 *
 * 产物只是「候选人 + 真实出处」，进题库必须人工审核后用：
 *   node tools/gen-questions.mjs --merge content/drafts/oss-xxx.json RAG
 *
 * 用法：
 *   node tools/pipeline/run.mjs --list
 *   node tools/pipeline/run.mjs --all
 *   node tools/pipeline/run.mjs --stage fetch --source arxiv --limit 3
 *   node tools/pipeline/run.mjs --stage draft --mode llm
 *
 * 日志：控制台 + content/logs/<runId>.jsonl；报告写 content/reports/<runId>.json。
 */
import fs from "node:fs";
import path from "node:path";
import { httpGetJson, httpGetText } from "./http.mjs";
import { createLogger, newRunId } from "./logger.mjs";
import { LOGS_DIR, REPORTS_DIR, rel } from "./paths.mjs";
import { fetchSource, getSourceById, listSources, SOURCES } from "./sources.mjs";
import { runChunk, runDraft, runNormalize, writeRawDocs } from "./stages.mjs";

const STAGES = ["fetch", "normalize", "chunk", "draft"];

const VALUE_FLAGS = new Set(["stage", "source", "limit", "mode", "per-chunk", "total", "level"]);

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

function printSources() {
  const lines = ["可用源（全部为权威开源项目 / 平台）："];
  for (const s of listSources()) {
    lines.push(`  ${s.id.padEnd(22)} ${s.license.padEnd(30)} ${s.name}`);
    lines.push(`  ${"".padEnd(22)} 出处：${s.homepage}`);
    lines.push(`  ${"".padEnd(22)} 为何可信：${s.authority}`);
  }
  return lines.join("\n");
}

/** fetch 阶段：按源抓取、落盘、记录 manifest；单源失败不影响其它源。 */
async function stageFetch({ logger, sourceId, limit }) {
  const targets = sourceId ? [getSourceById(sourceId)] : SOURCES;
  const results = [];

  for (const source of targets) {
    const stageLog = logger.forStage(`fetch:${source.id}`);
    try {
      const { docs, skipped } = await fetchSource(source, { logger: stageLog, httpGetText, httpGetJson, limit });
      if (docs.length === 0) {
        stageLog.warn("source.empty", { source: source.id, reason: "没有抓到任何正文" });
      }
      const manifest = writeRawDocs(source.id, docs, stageLog);
      results.push({
        source: source.id,
        name: source.name,
        docs: docs.length,
        skipped: skipped.length,
        files: manifest.length
      });
    } catch (err) {
      // 单个源挂掉不应该让整条流水线失败：记 error，继续跑下一个源
      stageLog.error("source.failed", { source: source.id, reason: err.message, status: err.status });
      results.push({ source: source.id, name: source.name, docs: 0, error: err.message });
    }
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    process.stdout.write(printSources() + "\n");
    return;
  }

  const runId = newRunId();
  const logger = createLogger({
    runId,
    stage: "pipeline",
    level: args.level ?? (args.verbose ? "debug" : undefined),
    console: !args.quiet
  });

  const limit = Number(args.limit ?? 5);
  const mode = args.mode ?? "extract";
  const stage = args.all ? null : (args.stage ?? null);
  if (stage && !STAGES.includes(stage)) {
    throw new Error(`未知的 stage：${stage}（可用：${STAGES.join(", ")}）`);
  }

  logger.info("pipeline.start", {
    runId,
    stages: args.all ? STAGES.join("+") : (stage ?? "fetch+normalize+chunk+draft"),
    limit,
    mode,
    source: args.source ?? "(全部)",
    node: process.version
  });

  const report = { runId, startedAt: new Date().toISOString(), stages: {} };

  if (args.all || !stage || stage === "fetch") {
    const stop = logger.timer("stage.fetch");
    report.stages.fetch = await stageFetch({ logger, sourceId: args.source, limit });
    stop({ sources: report.stages.fetch.length });
  }
  if (args.all || !stage || stage === "normalize") {
    const stop = logger.timer("stage.normalize");
    report.stages.normalize = runNormalize({ logger, sourceId: args.source });
    stop();
  }
  if (args.all || !stage || stage === "chunk") {
    const stop = logger.timer("stage.chunk");
    report.stages.chunk = runChunk({ logger });
    stop();
  }
  if (args.all || !stage || stage === "draft") {
    const stop = logger.timer("stage.draft");
    let llmDraft;
    if (mode === "llm") {
      const { draftQuestionsWithModel } = await import("../llm.mjs");
      llmDraft = (chunk, category) =>
        draftQuestionsWithModel({
          material: chunk.text,
          category,
          limit: 1,
          sourceHint: `${chunk.title} ${chunk.url}`,
          logger: logger.forStage("llm")
        });
    }
    report.stages.draft = await runDraft({
      logger,
      runId,
      mode,
      llmDraft,
      perChunkLimit: Number(args["per-chunk"] ?? 1),
      totalLimit: Number(args.total ?? 20)
    });
    stop({ drafts: report.stages.draft.count });
  }

  const summary = logger.close();
  report.finishedAt = new Date().toISOString();
  report.summary = summary;
  report.logFile = rel(path.join(LOGS_DIR, `${runId}.jsonl`));
  report.warnings = logger.warnings();
  report.errors = logger.errors();
  const draftStage = report.stages.draft;
  report.nextStep = draftStage?.count
    ? `人工审核后合并：node tools/gen-questions.mjs --merge ${rel(draftStage.file)} <分类>`
    : stage
      ? `继续后续阶段：node tools/pipeline/run.mjs --all（或在 content/logs 里查上面的 warn/error）`
      : "本次没有产出草稿，检查上方 warn/error 与 content/logs 下的日志";

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const reportFile = path.join(REPORTS_DIR, `${runId}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(path.join(REPORTS_DIR, "latest.json"), JSON.stringify(report, null, 2) + "\n");

  logger.info("pipeline.done", {
    report: rel(reportFile),
    log: report.logFile,
    warnings: summary.warningCount,
    errors: summary.errorCount,
    elapsedMs: summary.elapsedMs
  });
  process.stdout.write(`\n下一步：${report.nextStep}\n`);

  // 有 error 就算失败退出，方便 CI / 定时任务发现问题
  if (summary.errorCount > 0) process.exitCode = 1;
}

try {
  await main();
} catch (err) {
  process.stderr.write(`✗ ${err.message}\n`);
  process.exitCode = 1;
}
