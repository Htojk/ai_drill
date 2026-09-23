#!/usr/bin/env node
/**
 * 后端运维脚本：把「建表 / 生成密钥 / 部署 / 冒烟」串成一条命令。
 *
 *   node tools/backend.mjs secret     生成（或打印）会话密钥
 *   node tools/backend.mjs apikey     生成（或打印）访问数据库的 API Key
 *   node tools/backend.mjs migrate    把 cloud/functions/api/schema.sql 同步到云数据库
 *   node tools/backend.mjs deploy     生成含密钥的本地配置并部署云函数
 *   node tools/backend.mjs smoke      真实 HTTP 走一遍 健康 → 注册/登录 → 进度读写
 *   node tools/backend.mjs status     打印环境摘要（函数 / 数据库连接）
 *
 * 为什么要自己找 CLI 入口：Windows 上 execFileSync 拉不起 tcb.cmd（EINVAL），
 * 而用 shell 拼接 SQL 又容易被引号坑。直接 `node <cli>/bin/tcb` 两边都躲开。
 *
 * 为什么是「事件函数 + HTTP 访问服务」而不是 type: HTTP：
 * cloudbaserc 里的 type: HTTP 指 Web 云函数（需要自己写 scf_bootstrap 起 HTTP 服务），
 * 而我们的 handler 是事件形态。所以函数按 Event 部署，再用 HTTP 访问服务挂到 /api，
 * 得到 https://<env>.service.tcloudbase.com/api——事件形状恰好是适配层的 gateway 分支。
 */

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
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

/** HTTP 访问服务的路径；前端 lib/api.ts 的 base 就指向它。 */
const ACCESS_PATH = process.env.DRILL_ACCESS_PATH || "/api";

/** 服务端 API Key 的名字（列表里用来认人；key 本身只在创建时可见一次）。 */
const API_KEY_NAME = process.env.DRILL_API_KEY_NAME || "ai-drill-server";

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

/**
 * 访问云数据库用的 API Key（service_role）。
 *
 * 为什么必须自己造一个：云函数自带的 CAM 签名在网关里只会被判成 `anon` 角色，
 * 而 schema.sql 刻意 revoke 了 anon / authenticated 的所有权限——结果就是
 * 函数能起来、能过 /health，但一碰数据库就 `permission denied for table`。
 * 只有 API Key（JWT 里 role=service_role）能读写那两张表。
 *
 * key 只在创建时明文可见一次，所以和会话密钥一样落 .secrets/backend.env（已 gitignore）。
 */
function ensureApiKey() {
  const secrets = readSecrets();
  if (secrets.DRILL_API_KEY) return secrets.DRILL_API_KEY;

  console.log(`• 本地没有 API Key，创建：${API_KEY_NAME} → ${ENV_ID}`);
  const created = parseJsonBody(cli(["env", "apikey", "create", API_KEY_NAME, "-e", ENV_ID, "--json"], { capture: true }));
  const key = created?.data?.ApiKey;
  if (!key) {
    console.error("✗ 创建 API Key 失败（输出里没有 ApiKey）。手动创建：tcb env apikey create " + API_KEY_NAME + ` -e ${ENV_ID}`);
    process.exit(1);
  }
  writeSecrets({ ...secrets, DRILL_API_KEY: key, DRILL_API_KEY_ID: created.data.KeyId ?? "" });
  console.log(`✓ 已写入 ${SECRET_PATH}（KeyId=${created.data.KeyId ?? "?"}；作废：tcb env apikey delete <keyId>）`);
  return key;
}

/** CLI 加了 --json 也可能带上提示行，所以只截取第一个 { 到最后一个 }。 */
function parseJsonBody(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** 冒烟探针账号的口令：同样只生成一次，避免每次冒烟在账号表里堆新行。 */
function smokePassword() {
  const secrets = readSecrets();
  if (secrets.DRILL_SMOKE_PASSWORD) return secrets.DRILL_SMOKE_PASSWORD;
  const password = `smoke-${randomBytes(9).toString("base64url")}`;
  writeSecrets({ ...secrets, DRILL_SMOKE_PASSWORD: password });
  return password;
}

/* -------------------------------- 命令 -------------------------------- */

const commands = {
  secret() {
    const secret = ensureSecret();
    console.log(`DRILL_TOKEN_SECRET 长度：${secret.length}`);
    console.log(`存放位置：${SECRET_PATH}`);
  },

  apikey() {
    const key = ensureApiKey();
    console.log(`DRILL_API_KEY 长度：${key.length}`);
    console.log(`KeyId：${readSecrets().DRILL_API_KEY_ID || "(未记录)"}`);
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
    const apiKey = ensureApiKey();
    const local = {
      ...config,
      functions: FUNCTIONS.map((fn) => ({
        ...fn,
        envVariables: { ...(fn.envVariables ?? {}), DRILL_TOKEN_SECRET: secret, DRILL_API_KEY: apiKey }
      }))
    };
    writeFileSync(LOCAL_CONFIG_PATH, `${JSON.stringify(local, null, 2)}\n`, "utf8");
    console.log(`• 已生成 ${LOCAL_CONFIG_PATH}（含会话密钥与 API Key，已 gitignore）`);
    for (const fn of FUNCTIONS) {
      console.log(`• 部署云函数 ${fn.name}（${fn.runtime} / ${fn.type ?? "Event"}）`);
      // --path 顺带创建 HTTP 访问服务；已存在时平台会复用同一条路径。
      cli([
        "fn", "deploy", fn.name,
        "--force",
        "--path", ACCESS_PATH,
        "--config-file", LOCAL_CONFIG_PATH,
        "-e", ENV_ID
      ]);
    }
  },

  /**
   * 线上冒烟：**走真实 HTTP**，覆盖到数据库。
   *
   * 只打 /health 是不够的——那条路径不碰数据库，曾经因此让「函数能起来但读不了库」
   * 一路蒙混过关（云函数默认是 anon 角色，被 revoke 的表读不了）。
   * 所以这里必须把 注册/登录 → /auth/me → /progress 读写 全跑一遍。
   */
  async smoke() {
    const base = (process.env.DRILL_API_BASE || apiBaseCandidates()[0]).replace(/\/+$/, "");
    console.log(`• 线上冒烟 ${base}`);
    const steps = [];
    const check = (name, ok, detail = "") => steps.push({ name, ok, detail });
    const call = async (path, { method = "GET", body, token } = {}) => {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text.slice(0, 120) };
      }
      return { status: res.status, data };
    };

    try {
      const health = await call("/health");
      check("健康检查", health.status === 200 && health.data?.ok === true, `HTTP ${health.status}`);
      if (!health.ok && health.status >= 400) return reportSmoke(steps);

      const username = "drill_smoke";
      const password = smokePassword();
      let auth = await call("/auth/register", { method: "POST", body: { username, password } });
      if (auth.status === 409) auth = await call("/auth/login", { method: "POST", body: { username, password } });
      const hint = auth.status === 403 ? "（注册已关闭，且探针账号还没建过）" : `HTTP ${auth.status} ${JSON.stringify(auth.data).slice(0, 120)}`;
      check("注册/登录拿到令牌", auth.status < 300 && Boolean(auth.data?.token), hint);

      const token = auth.data?.token;
      if (!token) return reportSmoke(steps);

      const me = await call("/auth/me", { token });
      check("令牌换回本人账号", me.status === 200 && me.data?.user?.username === username, `HTTP ${me.status}`);

      const before = await call("/progress", { token });
      const baseRevision = before.data?.revision;
      check("读进度包（碰数据库）", before.status === 200 && Number.isInteger(baseRevision), `HTTP ${before.status} ${JSON.stringify(before.data).slice(0, 120)}`);
      if (!Number.isInteger(baseRevision)) return reportSmoke(steps);

      const stamp = new Date().toISOString();
      const put = await call("/progress", {
        method: "PUT",
        token,
        body: { payload: { smoke: stamp }, baseRevision }
      });
      check("写进度包（乐观并发）", put.status === 200 && put.data?.revision === baseRevision + 1, `HTTP ${put.status} revision=${put.data?.revision}`);

      const after = await call("/progress", { token });
      check("读回刚落盘的进度", after.data?.payload?.smoke === stamp, `revision=${after.data?.revision}`);
    } catch (err) {
      check("请求未抛错", false, err?.message ?? String(err));
      console.error("  刚部署完可能还在冷启动，等几秒重试；持续失败就查 tcb fn log api -e " + ENV_ID);
    }
    reportSmoke(steps);
  },

  status() {
    console.log(`\n环境：${ENV_ID}`);
    console.log(`函数目录：${FUNCTIONS_DIR}`);
    console.log(`HTTP 访问服务路径：${ACCESS_PATH}`);
    console.log(`API Key：${readSecrets().DRILL_API_KEY ? `已配置（KeyId=${readSecrets().DRILL_API_KEY_ID || "?"}）` : "✗ 未配置，先跑 apikey"}`);
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

function reportSmoke(steps) {
  for (const step of steps) console.log(`  ${step.ok ? "✓" : "✗"} ${step.name}${step.detail ? `  (${step.detail})` : ""}`);
  const failed = steps.filter((step) => !step.ok);
  if (failed.length > 0) {
    console.error(`✗ 线上冒烟未通过：${failed.length}/${steps.length} 步失败`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ 线上冒烟通过（${steps.length} 步）：健康 → 注册/登录 → 账号 → 进度读写`);
}

const name = process.argv[2] || "status";
const command = commands[name];
if (!command) {
  console.error(`✗ 未知命令：${name}\n可用：${Object.keys(commands).join(" / ")}`);
  process.exit(1);
}
await command();
