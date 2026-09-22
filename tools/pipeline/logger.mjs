/**
 * 结构化日志：控制台给人看，JSONL 给机器/事后复盘看。
 *
 * 为什么要它：抓取型流水线最容易出的问题是「跑失败了不知道失败在哪一步」。
 * 所以每条日志都带 runId / stage / level / 时间戳，阶段有耗时与计数，
 * 全部落到 content/logs/<runId>.jsonl；同时自动脱敏，避免把 API key 写进日志。
 */
import fs from "node:fs";
import path from "node:path";
import { LOGS_DIR, rel } from "./paths.mjs";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
const SENSITIVE_KEY = /(api[-_]?key|token|secret|password|passphrase|authorization|cookie)/i;
const REDACTED = "***";

/** 生成一次运行的短 id，用于串起同一次抓取的所有产物与日志。 */
export function newRunId(date = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-` +
    `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  );
}

export function resolveLevel(explicit) {
  const wanted = explicit ?? process.env.PIPELINE_LOG_LEVEL ?? "info";
  return LEVELS[wanted] ? wanted : "info";
}

/** 递归脱敏：字段名命中敏感词就整体替换，深拷贝避免污染调用方对象。 */
export function redact(value, depth = 0) {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message };
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redact(v, depth + 1);
  }
  return out;
}

function stamp(date) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}.${p(date.getMilliseconds(), 3)}`;
}

function formatFields(fields) {
  const parts = Object.entries(fields ?? {}).map(([k, v]) => {
    if (v === undefined || v === "") return null;
    const text = typeof v === "string" ? v : JSON.stringify(v);
    return `${k}=${text}`;
  });
  return parts.filter(Boolean).join(" ");
}

/**
 * 同一次运行里的所有 logger（含各 stage 的子 logger）共享这份状态：
 * 计数、各级别条数、warn/error 明细、开始时间、日志文件。
 * 显式传递而不是挂在对象上，避免子 logger 各写各的。
 */
function createShared({ runId, level, logFile, console: toConsole }) {
  const target = logFile === null ? null : (logFile ?? path.join(LOGS_DIR, `${runId}.jsonl`));
  if (target) fs.mkdirSync(path.dirname(target), { recursive: true });
  return {
    runId,
    minLevel: LEVELS[resolveLevel(level)],
    levelName: resolveLevel(level),
    target,
    toConsole,
    startedAt: Date.now(),
    counters: new Map(),
    totals: { debug: 0, info: 0, warn: 0, error: 0 },
    warnings: [],
    errors: []
  };
}

/** 按级别决定「是否值得记录」；低于级别的整条丢弃（含落盘），保证语义一致。 */
function isEnabled(shared, lvl) {
  return LEVELS[lvl] >= shared.minLevel;
}

/**
 * @param {object} options
 * @param {string} options.runId       本次运行的 id
 * @param {boolean} [options.console]  是否输出到控制台（默认 true）
 * @param {string} [options.level]     最低输出级别（默认取 PIPELINE_LOG_LEVEL 或 info）
 * @param {string} [options.logFile]   覆盖 JSONL 落盘路径；传 null 则只打控制台
 */
export function createLogger({ runId = newRunId(), stage = "pipeline", level, console: toConsole = true, logFile, shared } = {}) {
  const state = shared ?? createShared({ runId, level, logFile, console: toConsole });
  const target = state.target;

  if (!shared && target) {
    fs.appendFileSync(
      target,
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        runId: state.runId,
        stage,
        msg: "run.start",
        ms: 0,
        pid: process.pid,
        logLevel: state.levelName
      }) + "\n"
    );
  }

  function emit(lvl, msg, fields) {
    if (!isEnabled(state, lvl)) return;
    state.totals[lvl] += 1;
    const payload = redact(fields);
    if (target) {
      const line = {
        ts: new Date().toISOString(),
        level: lvl,
        runId: state.runId,
        stage,
        msg,
        ms: Date.now() - state.startedAt,
        ...payload
      };
      fs.appendFileSync(target, JSON.stringify(line) + "\n");
    }
    if (!state.toConsole) return;
    const extra = formatFields(payload);
    const label = lvl.toUpperCase().padEnd(5);
    process.stdout.write(`${stamp(new Date())} ${label} [${stage}] ${msg}${extra ? "  " + extra : ""}\n`);
  }

  const logger = {
    runId: state.runId,
    stage,
    logFile: target,
    level: state.levelName,
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => {
      if (isEnabled(state, "warn")) state.warnings.push({ stage, msg, ...redact(fields) });
      emit("warn", msg, fields);
    },
    error: (msg, fields) => {
      if (isEnabled(state, "error")) state.errors.push({ stage, msg, ...redact(fields) });
      emit("error", msg, fields);
    },
    /** 派生一个带阶段名的子 logger，共享计数、汇总与日志文件。 */
    forStage(nextStage) {
      return createLogger({ runId: state.runId, stage: nextStage, shared: state });
    },
    /** 阶段耗时：const t = log.timer("x"); ...; t() 会打出耗时。 */
    timer(label, fields) {
      const t0 = Date.now();
      return (extra) => {
        const ms = Date.now() - t0;
        emit("info", `${label}.done`, { ms, ...fields, ...extra });
        return ms;
      };
    },
    count(name, delta = 1) {
      state.counters.set(name, (state.counters.get(name) ?? 0) + delta);
      return state.counters.get(name);
    },
    counts: () => Object.fromEntries(state.counters),
    totals: () => state.totals,
    warnings: () => state.warnings,
    errors: () => state.errors,
    summary() {
      const t = logger.totals();
      const c = logger.counts();
      const summary = {
        runId: state.runId,
        elapsedMs: Date.now() - state.startedAt,
        logLevel: state.levelName,
        logFile: target ? rel(target) : null,
        counts: c,
        levels: { ...t },
        warningCount: logger.warnings().length,
        errorCount: logger.errors().length
      };
      return summary;
    },
    close() {
      const summary = logger.summary();
      emit("info", "run.summary", summary);
      return summary;
    }
  };
  return logger;
}
