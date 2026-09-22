#!/usr/bin/env node
/**
 * 铁律 4：只跑与本次改动相关的测试用例，不要每次跑全量。
 *
 * 做法：建立 src 下的 import 图，对每个测试文件求「传递依赖闭包」，
 * 只要闭包里出现了本次改动的文件，就选中它。
 * 直接改动的测试文件本身也会被选中。
 *
 * 用法：
 *   node tools/test-related.mjs              默认用暂存区（git diff --cached）判断改动
 *   node tools/test-related.mjs --paths a.ts b.ts
 *   node tools/test-related.mjs --all        紧急情况跑全量（CI 发布前偶尔用）
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const APP = "app";
// 统一用绝对路径：否则「改动文件」（来自 git，已 resolve）与「依赖图节点」
// （来自 walk，原本是相对路径）无法比较，会漏选测试。
const SRC = resolve(APP, "src");
const EXTS = [".ts", ".tsx"];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

function importsOf(file) {
  const text = readFileSync(file, "utf8");
  const specs = [];
  for (const m of text.matchAll(/(?:from|import)\s+["'](\.[^"']+)["']/g)) specs.push(m[1]);
  return specs;
}

function resolveSpec(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  const candidates = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => join(base, "index" + e))];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

const all = walk(SRC);
const graph = new Map(all.map((f) => [f, importsOf(f).map((s) => resolveSpec(f, s)).filter(Boolean)]));

/** 传递依赖闭包（含自身） */
function closure(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const dep of graph.get(file) ?? []) closure(dep, seen);
  return seen;
}

const args = process.argv.slice(2);
const useAll = args.includes("--all");

let changed = [];
if (useAll) {
  changed = all.slice();
} else if (args.includes("--paths")) {
  changed = args
    .slice(args.indexOf("--paths") + 1)
    .filter((a) => !a.startsWith("--"))
    .map((p) => resolve(p));
} else {
  const out = execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" });
  changed = out
    .split("\n")
    .filter(Boolean)
    .map((p) => resolve(p))
    .filter((p) => p.startsWith(resolve(SRC)) && /\.tsx?$/.test(p));
}

const changedSet = new Set(changed);
const tests = all.filter((f) => f.endsWith(".test.ts") || f.endsWith(".test.tsx"));

const selected = [];
for (const t of tests) {
  if (changedSet.has(t)) {
    selected.push({ file: t, why: "本文件被直接修改" });
    continue;
  }
  const deps = closure(t);
  const hit = changed.find((c) => deps.has(c));
  if (hit) selected.push({ file: t, why: `依赖了改动文件 ${relative(SRC, hit).split(sep).join("/")}` });
}

if (changed.length === 0) {
  console.log("• 本次没有改动 app/src 下的代码，跳过测试。");
  process.exit(0);
}

if (selected.length === 0) {
  console.log(`• 改动了 ${changed.length} 个源文件，但没有覆盖它们的测试用例。`);
  console.log("  （如果这是新功能，考虑就近补一个 *.test.ts；本次不跑全量，按铁律 4。）");
  process.exit(0);
}

const files = selected.map((s) => relative(APP, s.file).split(sep).join("/"));
console.log(`• 改动 ${changed.length} 个源文件 → 选中 ${files.length} 个相关测试文件：`);
for (const s of selected) {
  console.log(`    ${relative(APP, s.file).split(sep).join("/")}  ← ${s.why}`);
}
console.log("");

// 直接用 node 跑 vitest 的入口：Windows 上 execFileSync 无法直接拉起 .cmd（EINVAL）
const entry = resolve(APP, "node_modules", "vitest", "vitest.mjs");
if (!existsSync(entry)) {
  console.error(`✗ 找不到测试运行器 ${entry}，先在 app/ 下执行 npm install。`);
  process.exit(1);
}
try {
  execFileSync(process.execPath, [entry, "run", ...files], { cwd: APP, stdio: "inherit" });
} catch (err) {
  console.error("\n✗ 相关测试未通过，先修好再提交。");
  if (err?.message && !/status/i.test(err.message)) console.error(`  原因：${err.message}`);
  process.exit(1);
}
