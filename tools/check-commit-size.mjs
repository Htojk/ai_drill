#!/usr/bin/env node
/**
 * 铁律 3：单次提交改动行数不超过预算（默认 800 行）。
 *
 * 计数口径：git diff --cached --numstat 的「新增 + 删除」之和。
 * 不计入：lockfile、二进制/图片/字体、以及 git 判定为纯重命名的文件（-M）。
 * 纯「文件搬家」不算改动，但把内容从一个文件挪到另一个文件会算——那确实是改动。
 */

import { execFileSync } from "node:child_process";

const LIMIT = Number(process.env.HARNESS_MAX_LINES ?? 800);
const EXCLUDE = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)yarn\.lock$/,
  /\.(png|jpe?g|gif|webp|avif|ico|icns|woff2?|ttf|otf|eot|mp4|pdf|zip)$/i
];

function numstat() {
  const args = ["diff", "--cached", "--numstat", "-M"];
  const out = execFileSync("git", args, { encoding: "utf8" });
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [added, deleted, ...rest] = line.split("\t");
      return { added, deleted, path: rest.join("\t") };
    });
}

const rows = numstat();
const counted = [];
let total = 0;
let skipped = 0;

for (const row of rows) {
  const binary = row.added === "-" || row.deleted === "-";
  if (binary || EXCLUDE.some((re) => re.test(row.path))) {
    skipped++;
    continue;
  }
  const n = Number(row.added) + Number(row.deleted);
  total += n;
  counted.push({ path: row.path, n });
}

counted.sort((a, b) => b.n - a.n);

if (rows.length === 0) {
  console.error("✗ 没有暂存的改动（先 git add）");
  process.exit(1);
}

if (total > LIMIT) {
  console.error(`\n✗ 提交过大：${total} 行 > 预算 ${LIMIT} 行\n`);
  console.error("改动最多的文件：");
  for (const c of counted.slice(0, 8)) console.error(`  ${String(c.n).padStart(6)}  ${c.path}`);
  console.error(`
请把它拆成多个提交。按功能边界拆，而不是按文件个数：

  git reset                      # 取消暂存，保留工作区改动
  git add <第一个功能的文件…>      # 只暂存第一块
  git commit -m "feat(scope): 说明 (T-00N)"
  # 重复直到全部提交完

如果这次确实是不可分割的整体改动（例如一次性大重构），
用 HARNESS_MAX_LINES=<新上限> 重新提交，并在提交信息里说明为什么必须一次做完。
`);
  process.exit(1);
}

const pct = Math.round((total / LIMIT) * 100);
console.log(`✓ 提交行数：${total} / ${LIMIT}（${pct}%）`);
if (total > LIMIT * 0.8) console.log("  接近预算上限，下一步考虑拆分。");
if (skipped) console.log(`  已跳过 ${skipped} 个不计入项（二进制 / lockfile）。`);
