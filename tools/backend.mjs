#!/usr/bin/env node
/**
 * 后端运维脚本：把「建表 / 生成密钥 / 部署 / 冒烟」串成一条命令。
 *
 *   node tools/backend.mjs secret     生成（或打印）会话密钥
 *   node tools/backend.mjs migrate    把 cloud/functions/api/schema.sql 同步到云数据库
 *   node tools/backend.mjs deploy     生成含密钥的本地配置并部署云函数
 *   node tools/backend.mjs smoke      请求 /health 做冒烟自检
 *   node tools/backend.mjs status     打印环境摘要（函数 / 数据库连接）
 *
 * 为什么要自己找 CLI 入口：Windows 上 execFileSync 拉不起 tcb.cmd（EINVAL），
 * 而用 shell 拼接 SQL 又容易被引号坑。直接 `node <cli>/bin/tcb` 两边都躲开。
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const CONFIG_PATH = join(ROOT, "cloudbaserc.json");
const LOCAL_CONFIG_PATH = join(ROOT, "cloudbaserc.local.json");
const SECRET_DIR = join(ROOT, ".secrets");
const SECRET_PATH = join(SECRET_DIR, "backend.env");
const SCHEMA_PATH = join(ROOT, "cloud/functions/api/schema.sql");
const FUNCTIONS_DIR = join(ROOT, "cloud/functions");

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const ENV_ID = process.env.DRILL_ENV_ID || config.envId;
const FUNCTIONS = config.functions ?? [];

/* ---------------------------- CLI 入口定位 ---------------------------- */

function resolveCliEntry() {
  if (process.env.TCB_CLI_ENTRY) return process.env.TCB_CLI_ENTRY;
  const require = createRequire(import.meta.url);
  const candidates = [];
  try {
    candidates.push(join(dirname(require.resolve("@cloudbase/cli/package.json")), "bin", "tcb"));
  } catch {
    /* 未装到 node_modules，继续找全局目录 */
  }
  try {
    // shell: true 是必须的：Windows 上 execFileSync 直接拉 npm.cmd 会 EINVAL。
    // 这里只传固定参数、不拼接外部输入，没有注入面。
    const globalRoot = execFileSync(npmCommand(), ["root", "-g"], { encoding: "utf8", shell: true }).trim();
    candidates.push(join(globalRoot, "@cloudbase/cli", "bin", "tcb"));
  } catch {
    /* npm 不可用也算正常 */
  }
  if (process.env.APPDATA) {
    candidates.push(join(process.env.APPDATA, "npm", "node_modules", "@cloudbase", "cli", "bin", "tcb"));
  }
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    console.error("✗ 找不到 CloudBase CLI。先装：npm i -g @cloudbase/cli");
    process.exit(1);
  }
  return found;
}

const npmCommand = () => (process.platform === "win32" ? "npm.cmd" : "npm");

function cli(args, { capture = false } = {}) {
  const options = { cwd: ROOT, stdio: capture ? "pipe" : "inherit", encoding: "utf8" };
  return execFileSync(process.execPath, [resolveCliEntry(), ...args], options);
}

/* ------------------------------ 密钥文件 ------------------------------ */

function readSecrets() {
  if (!existsSync(SECRET_PATH)) return {};
  const out = {};
  for (const line of readFileSync(SECRET_PATH, "utf8").split("\n")) {
    const at = line.indexOf("=");
    if (at > 0) out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return out;
}

function writeSecrets(values) {
  mkdirSync(SECRET_DIR, { recursive: true });
  const body = Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  writeFileSync(SECRET_PATH, `${body}\n`, "utf8");
}

function ensureSecret() {
  const secrets = readSecrets();
  if (!secrets.DRILL_TOKEN_SECRET) {
    secrets.DRILL_TOKEN_SECRET = execFileSync(
      process.execPath,
      ["-e", "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64url'))"],
      { encoding: "utf8" }
    );
    writeSecrets(secrets);
    console.log("✓ 已生成会话密钥 → .secrets/backend.env（已 gitignore，别外传）");
  }
  return secrets.DRILL_TOKEN_SECRET;
}

/* -------------------------------- 命令 -------------------------------- */

const commands = {
  secret() {
    const secret = ensureSecret();
    console.log(`DRILL_TOKEN_SECRET 长度：${secret.length}`);
    console.log(`存放位置：${SECRET_PATH}`);
  },

  migrate() {
    const sql = readFileSync(SCHEMA_PATH, "utf8");
    console.log(`• 执行 schema.sql（${sql.split("\n").length} 行）→ ${ENV_ID}`);
    cli(["db", "execute", "-e", ENV_ID, "--sql", sql]);
    commands.status();
  },

  deploy() {
    const secret = ensureSecret();
    const local = {
      ...config,
      functions: FUNCTIONS.map((fn) => ({
        ...fn,
        envVariables: { ...(fn.envVariables ?? {}), DRILL_TOKEN_SECRET: secret }
      }))
    };
    writeFileSync(LOCAL_CONFIG_PATH, `${JSON.stringify(local, null, 2)}\n`, "utf8");
    console.log(`• 已生成 ${LOCAL_CONFIG_PATH}（含密钥，已 gitignore）`);
    for (const fn of FUNCTIONS) {
      console.log(`• 部署云函数 ${fn.name}（${fn.runtime} / ${fn.type}）`);
      cli(["fn", "deploy", fn.name, "--force", "--config-file", LOCAL_CONFIG_PATH, "-e", ENV_ID]);
    }
  },

  smoke() {
    const base = process.env.DRILL_API_BASE || apiBaseCandidates()[0];
    console.log(`• 冒烟自检 ${base}/health`);
    cli(["fn", "invoke", FUNCTIONS[0]?.name ?? "api", "-e", ENV_ID, "--params", '{"method":"GET","path":"/health"}']);
    console.log(`  提示：HTTP 入口地址见 tcb fn detail api -e ${ENV_ID}`);
  },

  status() {
    console.log(`\n环境：${ENV_ID}`);
    console.log(`函数目录：${FUNCTIONS_DIR}`);
    console.log(`后端候选地址：\n  - ${apiBaseCandidates().join("\n  - ")}`);
    cli(["fn", "list", "-e", ENV_ID]);
    cli(["db", "execute", "-e", ENV_ID, "--sql", "select table_name from information_schema.tables where table_schema='public' order by 1"]);
  }
};

function apiBaseCandidates() {
  return [
    `https://${ENV_ID}.service.tcloudbase.com/api`,
    `https://${ENV_ID}.api.tcloudbasegateway.com/v1/functions/api`
  ];
}

const name = process.argv[2] || "status";
const command = commands[name];
if (!command) {
  console.error(`✗ 未知命令：${name}\n可用：${Object.keys(commands).join(" / ")}`);
  process.exit(1);
}
command();
