import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { createLogger, newRunId, redact, resolveLevel } from "./logger.mjs";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-log-"));
after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function readLines(file) {
  return fs
    .readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
}

describe("redact", () => {
  it("按字段名脱敏，保留其它字段", () => {
    const out = redact({ url: "https://x", apiKey: "sk-123", nested: { Authorization: "Bearer t" } });
    assert.equal(out.url, "https://x");
    assert.equal(out.apiKey, "***");
    assert.equal(out.nested.Authorization, "***");
  });

  it("不改动原对象（深拷贝语义）", () => {
    const input = { apiKey: "sk-123" };
    redact(input);
    assert.equal(input.apiKey, "sk-123");
  });

  it("数组里的敏感字段也会脱敏", () => {
    assert.deepEqual(redact([{ token: "t" }]), [{ token: "***" }]);
  });

  it("Error 转成可读结构，不丢消息", () => {
    const out = redact({ err: new Error("boom") });
    assert.deepEqual(out.err, { name: "Error", message: "boom" });
  });

  it("基本类型原样返回", () => {
    assert.equal(redact("plain"), "plain");
    assert.equal(redact(7), 7);
    assert.equal(redact(null), null);
  });
});

describe("resolveLevel", () => {
  it("认识的级别直接用，不认识的退回 info", () => {
    assert.equal(resolveLevel("debug"), "debug");
    assert.equal(resolveLevel("nonsense"), "info");
  });
});

describe("newRunId", () => {
  it("按本地时间生成可排序的 id", () => {
    assert.equal(newRunId(new Date(2026, 8, 22, 9, 5, 3)), "20260922-090503");
  });
});

describe("createLogger", () => {
  it("落 JSONL 且每条带 runId/stage/level/msg", () => {
    const logFile = path.join(tmpDir, "a.jsonl");
    const log = createLogger({ runId: "r1", stage: "fetch", logFile, console: false });
    log.info("hello", { count: 3 });
    log.warn("careful");
    const lines = readLines(logFile);
    const hello = lines.find((l) => l.msg === "hello");
    assert.equal(hello.runId, "r1");
    assert.equal(hello.stage, "fetch");
    assert.equal(hello.level, "info");
    assert.equal(hello.count, 3);
    assert.ok(lines.some((l) => l.msg === "run.start"));
  });

  it("低于级别的日志不落盘也不输出", () => {
    const logFile = path.join(tmpDir, "b.jsonl");
    const log = createLogger({ runId: "r2", level: "warn", logFile, console: false });
    log.debug("invisible");
    log.info("also-invisible");
    log.error("visible");
    const msgs = readLines(logFile).map((l) => l.msg);
    assert.ok(!msgs.includes("invisible"));
    assert.ok(!msgs.includes("also-invisible"));
    assert.ok(msgs.includes("visible"));
  });

  it("日志文件本身不落敏感字段", () => {
    const logFile = path.join(tmpDir, "c.jsonl");
    const log = createLogger({ runId: "r3", logFile, console: false });
    log.info("call", { apiKey: "sk-secret-value", url: "https://x" });
    const text = fs.readFileSync(logFile, "utf8");
    assert.ok(!text.includes("sk-secret-value"));
    assert.ok(text.includes("https://x"));
  });

  it("计数、阶段计时与汇总可用", () => {
    const logFile = path.join(tmpDir, "d.jsonl");
    const log = createLogger({ runId: "r4", stage: "run", logFile, console: false });
    log.count("docs", 2);
    log.count("docs");
    const stop = log.timer("stage.prepare");
    const ms = stop({ note: "ok" });
    assert.equal(typeof ms, "number");
    const summary = log.summary();
    assert.equal(summary.counts.docs, 3);
    assert.equal(summary.errorCount, 0);
    assert.equal(summary.warningCount, 0);
    assert.ok(summary.elapsedMs >= 0);
  });

  it("warn/error 会被记住，便于最后判断整体是否成功", () => {
    const logFile = path.join(tmpDir, "e.jsonl");
    const log = createLogger({ runId: "r5", logFile, console: false });
    log.warn("maybe bad", { url: "https://x" });
    log.error("very bad", { url: "https://y" });
    assert.equal(log.warnings().length, 1);
    assert.equal(log.errors().length, 1);
    assert.equal(log.summary().errorCount, 1);
  });

  it("子 logger 共享日志文件与计数", () => {
    const logFile = path.join(tmpDir, "f.jsonl");
    const root = createLogger({ runId: "r6", stage: "run", logFile, console: false });
    const child = root.forStage("fetch");
    child.count("files", 4);
    child.info("child-msg");
    assert.equal(child.stage, "fetch");
    assert.equal(root.counts().files, 4);
    assert.ok(readLines(logFile).some((l) => l.msg === "child-msg" && l.stage === "fetch"));
  });
});
