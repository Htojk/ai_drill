#!/usr/bin/env node
/**
 * 一次开发的收尾流程：把铁律 2/3/4/5 串成一条命令。
 *
 *   node tools/finish-task.mjs --task T-001 --message "feat(pwa): 补 iOS PNG 图标" \
 *        --evidence "npm run build 通过；手机实测图标正常"
 *
 * 依次执行：
 *   1. 暂存全部改动
 *   2. 校验提交行数（铁律 3）
 *   3. 校验分层与文件体积（铁律 1）
 *   4. 只跑相关测试（铁律 4）
 *   5. 更新 docs/PLAN.md 并提交（铁律 2 + 5）
 *
 * 任何一步失败都会中止，不会留下半个提交。
 */

import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? "" : args[i + 1] ?? "";
};

const task = get("--task").toUpperCase();
const message = get("--message");
const evidence = get("--evidence");
const skipTests = args.includes("--skip-tests");

if (!task || !message) {
  console.error(`✗ 缺少参数

用法：
  node tools/finish-task.mjs --task T-001 --message "feat(scope): 说明" [--evidence "验证方式"] [--skip-tests]

提示：先确认任务已在计划里（node tools/plan.mjs list），没有就先 add。
`);
  process.exit(1);
}

const run = (label, cmd, cmdArgs) => {
  console.log(`\n── ${label} ─────────────────────────────`);
  try {
    execFileSync(cmd, cmdArgs, { stdio: "inherit" });
  } catch {
    console.error(`\n✗ 「${label}」未通过，已中止，未产生提交。`);
    process.exit(1);
  }
};

run("暂存改动", "git", ["add", "-A"]);

run("校验提交行数", "node", ["tools/check-commit-size.mjs", "--staged"]);
run("校验分层与体积", "node", ["tools/check-layers.mjs"]);

if (skipTests) {
  console.log("\n── 跳过测试（--skip-tests）─────────────────");
  console.log("  仅限纯文档 / 纯配置改动。");
} else {
  run("跑相关测试", "node", ["tools/test-related.mjs"]);
}

run("更新计划", "node", ["tools/plan.mjs", "done", task, ...(evidence ? ["--evidence", evidence] : [])]);
run("纳入计划变更", "git", ["add", "-A"]);
run("复校行数（含计划文件）", "node", ["tools/check-commit-size.mjs", "--staged"]);

run("提交", "git", ["commit", "-m", `${message} (${task})`]);

console.log(`
────────────────────────────────────────
✓ ${task} 已完成并提交

  提交信息：${message} (${task})
  查看：    node tools/plan.mjs show ${task}
  `);
