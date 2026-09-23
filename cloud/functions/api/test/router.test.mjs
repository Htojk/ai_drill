import assert from "node:assert/strict";
import { test } from "node:test";
import { createRouter } from "../src/router.mjs";
import { BadRequest } from "../src/core/errors.mjs";
import { silentLogger } from "./helpers/fakes.mjs";

const ctx = { log: silentLogger(), config: {} };
const routes = [
  { method: "GET", path: "/health", handler: async () => ({ statusCode: 200, body: "{}" }) },
  {
    method: "POST",
    path: "/auth/login",
    handler: async () => {
      throw new BadRequest("用户名不能为空", "username");
    }
  }
];

test("路径后缀匹配：部署前缀变化不影响路由", async () => {
  const router = createRouter(routes);
  for (const path of ["/health", "/api/health", "/v1/functions/api/health"]) {
    const res = await router.handle({ method: "GET", path, headers: {} }, ctx);
    assert.equal(res.statusCode, 200, path);
  }
});

test("后缀匹配不会误命中相似路径", async () => {
  const router = createRouter(routes);
  const res = await router.handle({ method: "GET", path: "/api/unhealthy", headers: {} }, ctx);
  assert.equal(res.statusCode, 404);
});

test("方法不匹配返回 405 而不是 404", async () => {
  const router = createRouter(routes);
  const res = await router.handle({ method: "DELETE", path: "/health", headers: {} }, ctx);
  assert.equal(res.statusCode, 405);
  assert.match(res.body, /METHOD_NOT_ALLOWED/);
});

test("OPTIONS 预检直接 204", async () => {
  const router = createRouter(routes);
  const res = await router.handle({ method: "OPTIONS", path: "/auth/login", headers: {} }, ctx);
  assert.equal(res.statusCode, 204);
});

test("BadRequest 会被翻译成 400 + field", async () => {
  const router = createRouter(routes);
  const res = await router.handle({ method: "POST", path: "/auth/login", headers: {}, body: {} }, ctx);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(JSON.parse(res.body), { error: "INVALID_PARAM", message: "用户名不能为空", field: "username" });
});

test("非业务异常继续上抛，交给入口兜底", async () => {
  const router = createRouter([
    {
      method: "GET",
      path: "/boom",
      handler: async () => {
        throw new Error("unexpected");
      }
    }
  ]);
  await assert.rejects(() => router.handle({ method: "GET", path: "/boom", headers: {} }, ctx), /unexpected/);
});
