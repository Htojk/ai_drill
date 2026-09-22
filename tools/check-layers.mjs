#!/usr/bin/env node
/**
 * 铁律 1：分层管理 + 单文件体积预算。
 *
 * 两条机械约束：
 *   A. 依赖只能向下（rank 小的层）。禁止 lib 反向依赖 pages 之类的「向上依赖」。
 *   B. 单文件行数预算：超过 WARN 提示，超过 FAIL 直接拦提交。
 *      目的是让 agent 改一个小功能时，需要读的文件是有限的。
 *
 * 测试文件（*.test.ts）不受这两条约束——它们本来就要跨界。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname, sep } from "node:path";

const SRC = "app/src";
const WARN_LINES = 200;
const FAIL_LINES = 250;

/** 层定义：rank 越小越底层。文件只能 import rank 不大于自己的层。 */
const LAYERS = [
  { name: "types", rank: 0, match: (p) => p === "types.ts" },
  { name: "data", rank: 1, match: (p) => p.startsWith("data/") },
  { name: "lib", rank: 2, match: (p) => p.startsWith("lib/") },
  { name: "pages", rank: 3, match: (p) => p.startsWith("pages/") },
  { name: "entry", rank: 4, match: (p) => p === "App.tsx" || p === "main.tsx" }
];

function layerOf(rel) {
  return LAYERS.find((l) => l.match(rel));
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const isTest = (p) => /\.test\.tsx?$/.test(p);
const toRel = (full) => relative(SRC, full).split(sep).join("/");

const files = walk(SRC).filter((f) => /\.tsx?$/.test(f) && !isTest(f));

const violations = [];
const sizeWarn = [];
const sizeFail = [];

for (const full of files) {
  const rel = toRel(full);
  const own = layerOf(rel);
  const text = readFileSync(full, "utf8");
  const lineCount = text.split("\n").length;

  if (lineCount > FAIL_LINES) sizeFail.push({ rel, lineCount });
  else if (lineCount > WARN_LINES) sizeWarn.push({ rel, lineCount });

  if (!own) continue;

  // 收集相对 import 的目标
  for (const m of text.matchAll(/(?:from|import)\s+["'](\.[^"']+)["']/g)) {
    const spec = m[1];
    let target = join(dirname(rel), spec).split(sep).join("/");
    target = target.replace(/\.tsx?$/, "").replace(/\/index$/, "");
    const targetLayer = layerOf(target + ".ts") ?? layerOf(target);
    if (!targetLayer) continue; // 指向源码之外或未分类路径，忽略

    if (targetLayer.rank > own.rank) {
      violations.push({
        from: rel,
        fromLayer: own.name,
        to: spec,
        toLayer: targetLayer.name
      });
    }
  }
}

let failed = false;

if (sizeFail.length) {
  failed = true;
  console.error(`\n✗ 以下文件超过单文件上限 ${FAIL_LINES} 行：`);
  for (const f of sizeFail.sort((a, b) => b.lineCount - a.lineCount)) {
    console.error(`  ${String(f.lineCount).padStart(4)} 行  ${f.rel}`);
  }
  console.error("  请按功能边界拆分（见 AGENTS.md 第 1 条与分层地图）。");
}

if (violations.length) {
  failed = true;
  console.error("\n✗ 发现向上依赖（违反了分层方向）：");
  for (const v of violations) {
    console.error(`  ${v.from} [${v.fromLayer}]  →  ${v.to} [${v.toLayer}]`);
  }
  console.error("  依赖只能指向同级或更底层的模块。");
}

if (!failed) {
  console.log(`✓ 分层检查通过（${files.length} 个源文件）`);
  if (sizeWarn.length) {
    console.log(`  提示：${sizeWarn.length} 个文件接近上限（> ${WARN_LINES} 行）：`);
    for (const f of sizeWarn.sort((a, b) => b.lineCount - a.lineCount).slice(0, 5)) {
      console.log(`    ${String(f.lineCount).padStart(4)} 行  ${f.rel}`);
    }
  }
}

process.exit(failed ? 1 : 0);
