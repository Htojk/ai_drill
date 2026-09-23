import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeRequest } from "../src/http/request.mjs";

test("适配 API 网关事件（--httpFn 部署的正式形态）", () => {
  const req = normalizeRequest({
    httpMethod: "POST",
    path: "/api/auth/login",
    headers: { Authorization: "Bearer abc", "Content-Type": "application/json" },
    body: JSON.stringify({ username: "sam", password: "secret123" })
  });
  assert.equal(req.source, "gateway");
  assert.equal(req.method, "POST");
  assert.equal(req.path, "/api/auth/login");
  assert.equal(req.headers.authorization, "Bearer abc");
  assert.deepEqual(req.body, { username: "sam", password: "secret123" });
});

test("查询串会解析成对象，rawQueryString 优先", () => {
  const req = normalizeRequest({ httpMethod: "GET", rawPath: "/api/progress", rawQueryString: "a=1&b=2" });
  assert.deepEqual(req.query, { a: "1", b: "2" });
});

test("base64 请求体会被解码", () => {
  const raw = Buffer.from(JSON.stringify({ ok: true })).toString("base64");
  const req = normalizeRequest({ httpMethod: "PUT", path: "/progress", body: raw, isBase64Encoded: true });
  assert.deepEqual(req.body, { ok: true });
});

test("适配 functions-framework 事件（元信息在 httpContext）", () => {
  const req = normalizeRequest({ body: { hello: 1 } }, { httpContext: { url: "/api/health?x=1", httpMethod: "get" } });
  assert.equal(req.source, "framework");
  assert.equal(req.method, "GET");
  assert.equal(req.path, "/api/health");
  assert.deepEqual(req.query, { x: "1" });
  assert.deepEqual(req.body, { hello: 1 });
});

test("适配直接调用（tcb fn invoke / 本地测试）", () => {
  const req = normalizeRequest({ path: "/auth/me", method: "get", headers: {} });
  assert.equal(req.source, "direct");
  assert.equal(req.method, "GET");
  assert.equal(req.path, "/auth/me");
});

test("空请求体不会抛错，坏 JSON 也不会", () => {
  assert.equal(normalizeRequest({ httpMethod: "GET", path: "/x" }).body, null);
  assert.deepEqual(normalizeRequest({ httpMethod: "POST", path: "/x", body: "{oops" }).body, { __raw: "{oops" });
});
