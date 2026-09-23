import assert from "node:assert/strict";
import { test } from "node:test";
import { appOptions } from "../src/core/db.mjs";

const SYMBOL = "SYMBOL_CURRENT_ENV";

test("init 参数必须带上 API Key（否则网关只给 anon，读不了被 revoke 的表）", () => {
  const options = appOptions({ envId: "test-env", apiKey: "ak-1" }, SYMBOL);
  assert.equal(options.env, "test-env");
  assert.equal(options.accessKey, "ak-1");
});

test("没配 envId 时回退到「当前环境」符号", () => {
  assert.equal(appOptions({ apiKey: "ak-1" }, SYMBOL).env, SYMBOL);
});

test("没有 key 时不编造 accessKey（宁可在 assertConfig 处失败）", () => {
  const options = appOptions({ envId: "test-env" }, SYMBOL);
  assert.deepEqual(Object.keys(options).sort(), ["env"]);
});
