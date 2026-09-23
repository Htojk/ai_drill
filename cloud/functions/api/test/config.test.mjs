import assert from "node:assert/strict";
import { test } from "node:test";
import { assertConfig, loadConfig } from "../src/core/config.mjs";

const FULL = { DRILL_TOKEN_SECRET: "s", DRILL_API_KEY: "k", DRILL_ENV: "test-env" };

test("关键环境变量都从 env 里读出来", () => {
  const config = loadConfig({ ...FULL, DRILL_ALLOW_REGISTER: "off", DRILL_DB_SCHEMA: "app" });
  assert.equal(config.envId, "test-env");
  assert.equal(config.tokenSecret, "s");
  assert.equal(config.apiKey, "k");
  assert.equal(config.allowRegister, false);
  assert.equal(config.schema, "app");
});

test("缺少会话密钥或 API Key 时启动即失败，不静默降级", () => {
  assert.throws(() => assertConfig(loadConfig({ DRILL_API_KEY: "k" })), /DRILL_TOKEN_SECRET/);
  // 缺 API Key 是最隐蔽的一种：函数能起来、/health 也过，但一碰数据库就 permission denied
  assert.throws(() => assertConfig(loadConfig({ DRILL_TOKEN_SECRET: "s" })), /DRILL_API_KEY/);
  assert.throws(() => assertConfig(loadConfig({})), /DRILL_TOKEN_SECRET, DRILL_API_KEY/);
});

test("配置齐全时原样返回", () => {
  const config = loadConfig(FULL);
  assert.equal(assertConfig(config), config);
});
