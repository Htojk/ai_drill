#!/usr/bin/env node
/**
 * 铁律 2：维护 docs/PLAN.md，只保留最近 5 条已完成任务，更早的自动归档。
 *
 * 用法：
 *   node tools/plan.mjs list                     列出计划
 *   node tools/plan.mjs add "任务标题"            新增到「待办」
 *   node tools/plan.mjs start T-003              移入「进行中」
 *   node tools/plan.mjs done T-003 --evidence "验证方式"   标记完成（自动归档溢出项）
 *   node tools/plan.mjs show T-003               在 git 历史里找该任务的提交
 *
 * 本文件格式由脚本维护，手改容易破坏解析。
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const PLAN = "docs/PLAN.md";
const ARCHIVE_DIR = "docs/plan-archive";
const KEEP_DONE = 5;

const SECTIONS = { doing: "## 进行中", todo: "## 待办", done: "## 已完成（仅保留最近 5 条，更早的见 docs/plan-archive/）" };
const TASK_RE = /^- \[( |x)\] (T-\d+)\s+(.+?)(?:\s+·\s+(.*))?$/;

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function readPlan() {
  if (!existsSync(PLAN)) {
    return { header: "# 开发计划\n\n> 本文件由 `tools/plan.mjs` 维护。\n", doing: [], todo: [], done: [] };
  }
  const text = readFileSync(PLAN, "utf8").replace(/\r\n/g, "\n");
  const firstHeading = text.search(/^## /m);
  const header = (firstHeading === -1 ? text : text.slice(0, firstHeading)).replace(/\s+$/, "\n");

  const state = { header, doing: [], todo: [], done: [] };
  let current = null;
  for (const line of text.slice(firstHeading === -1 ? text.length : firstHeading).split("\n")) {
    if (line.startsWith("## ")) {
      current = line.includes("进行中") ? "doing" : line.includes("待办") ? "todo" : line.includes("已完成") ? "done" : null;
      continue;
    }
    const m = line.match(TASK_RE);
    if (m && current) state[current].push({ id: m[2], title: m[3].trim(), meta: (m[4] ?? "").trim() });
  }
  return state;
}

function render(state) {
  const fmt = (t, done) => `- [${done ? "x" : " "}] ${t.id} ${t.title}${t.meta ? ` · ${t.meta}` : ""}`;
  const block = (arr, done) => "\n" + (arr.length ? arr.map((t) => fmt(t, done)).join("\n") : "_（空）_");
  return [
    state.header.replace(/\s+$/, ""),
    "",
    SECTIONS.doing,
    block(state.doing, false),
    "",
    SECTIONS.todo,
    block(state.todo, false),
    "",
    SECTIONS.done,
    block(state.done, true),
    ""
  ].join("\n");
}

function allIds() {
  const ids = [];
  const scan = (text) => {
    // 只认任务行，避免头部说明里的示例编号（如 “(T-004)”）被当成已用编号
    for (const line of text.split("\n")) {
      const m = line.match(TASK_RE);
      if (m) ids.push(Number(m[2].slice(2)));
    }
  };
  if (existsSync(PLAN)) scan(readFileSync(PLAN, "utf8"));
  if (existsSync(ARCHIVE_DIR)) {
    for (const f of readdirSync(ARCHIVE_DIR)) {
      if (f.endsWith(".md")) scan(readFileSync(`${ARCHIVE_DIR}/${f}`, "utf8"));
    }
  }
  return ids;
}

function nextId() {
  const ids = allIds();
  const max = ids.length ? Math.max(...ids) : 0;
  return `T-${String(max + 1).padStart(3, "0")}`;
}

function archive(overflow) {
  if (!overflow.length) return 0;
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  const month = today().slice(0, 7);
  const file = `${ARCHIVE_DIR}/${month}.md`;
  const head = existsSync(file)
    ? readFileSync(file, "utf8").replace(/\s+$/, "\n")
    : `# 计划归档 · ${month}\n\n> 由 \`tools/plan.mjs\` 自动追加。已完成任务超出保留上限（5 条）时移入此处。\n`;
  const added = overflow.map((t) => `- [x] ${t.id} ${t.title}${t.meta ? ` · ${t.meta}` : ""}`).join("\n");
  writeFileSync(file, `${head}\n${added}\n`, "utf8");
  return overflow.length;
}

function save(state) {
  const overflow = state.done.splice(KEEP_DONE);
  const n = archive(overflow);
  writeFileSync(PLAN, render(state), "utf8");
  return n;
}

function find(state, id) {
  const key = id.toUpperCase();
  for (const s of ["doing", "todo", "done"]) {
    const i = state[s].findIndex((t) => t.id === key);
    if (i !== -1) return { section: s, index: i };
  }
  return null;
}

const [cmd = "list", ...rest] = process.argv.slice(2);
const state = readPlan();

function requireTask(id) {
  const hit = find(state, id);
  if (!hit) {
    console.error(`✗ 找不到任务 ${id}（可能是已归档，用 node tools/plan.mjs show ${id} 去 git 历史里找）`);
    process.exit(1);
  }
  return hit;
}

if (cmd === "list") {
  console.log(render(state));
} else if (cmd === "add") {
  const title = rest.filter((a) => !a.startsWith("--"))[0];
  if (!title) {
    console.error('✗ 用法：node tools/plan.mjs add "任务标题"');
    process.exit(1);
  }
  const id = nextId();
  state.todo.push({ id, title, meta: `新增 ${today()}` });
  save(state);
  console.log(`✓ 已新增 ${id} ${title}`);
} else if (cmd === "start") {
  const { section, index } = requireTask(rest[0]);
  if (section === "doing") {
    console.log(`= ${rest[0]} 已在「进行中」`);
    process.exit(0);
  }
  const [task] = state[section].splice(index, 1);
  task.meta = `开始 ${today()}`;
  state.doing.push(task);
  save(state);
  console.log(`✓ ${task.id} 已移入「进行中」`);
} else if (cmd === "done") {
  const id = rest[0];
  const evIndex = rest.indexOf("--evidence");
  const evidence = evIndex === -1 ? "" : rest[evIndex + 1] ?? "";
  const { section, index } = requireTask(id);
  const [task] = state[section].splice(index, 1);
  task.meta = [`完成 ${today()}`, evidence ? `证据: ${evidence}` : ""].filter(Boolean).join(" · ");
  state.done.unshift(task);
  const archived = save(state);
  console.log(`✓ ${task.id} 已完成`);
  if (archived) console.log(`  已归档 ${archived} 条更早的完成任务 → docs/plan-archive/`);
} else if (cmd === "show") {
  const id = (rest[0] ?? "").toUpperCase();
  try {
    const out = execFileSync("git", ["log", "--oneline", "--all", `--grep=${id}`], { encoding: "utf8" });
    console.log(out.trim() || `（git 历史里没有提到 ${id} 的提交）`);
  } catch {
    console.error("✗ git 查询失败");
    process.exit(1);
  }
} else {
  console.error(`✗ 未知命令：${cmd}（可用：list / add / start / done / show）`);
  process.exit(1);
}
