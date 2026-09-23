import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app.mjs";
import { createFakeRepos, silentLogger } from "./helpers/fakes.mjs";

const ENV = { DRILL_TOKEN_SECRET: "unit-test-secret", DRILL_ENV: "test-env" };

function makeApp(repos = createFakeRepos()) {
  return { app: createApp({ env: ENV, log: silentLogger(), repos }), repos };
}

const call = (app, method, path, { body, token } = {}) =>
  app.router.handle(
    { method, path, headers: token ? { authorization: `Bearer ${token}` } : {}, body },
    app.ctx
  );

const parse = (res) => ({ status: res.statusCode, json: JSON.parse(res.body || "null") });

async function register(app, username = "sam_92", password = "long-enough-pass") {
  const res = parse(await call(app, "POST", "/auth/register", { body: { username, password } }));
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json;
}

test("健康检查返回服务信息", async () => {
  const { app } = makeApp();
  const res = parse(await call(app, "GET", "/health"));
  assert.equal(res.status, 200);
  assert.equal(res.json.service, "ai-drill-api");
  assert.equal(res.json.registerOpen, true);
});

test("注册 → 登录 → /auth/me 全链路", async () => {
  const { app } = makeApp();
  const { token, user } = await register(app);
  assert.match(user.uid, /^uid-/);

  const login = parse(await call(app, "POST", "/auth/login", { body: { username: "SAM_92", password: "long-enough-pass" } }));
  assert.equal(login.status, 200, "用户名大小写不敏感");

  const me = parse(await call(app, "GET", "/auth/me", { token }));
  assert.equal(me.status, 200);
  assert.equal(me.json.user.username, "sam_92");
});

test("重复用户名返回 409；口令错误返回 401", async () => {
  const { app } = makeApp();
  await register(app);
  assert.equal(parse(await call(app, "POST", "/auth/register", { body: { username: "sam_92", password: "long-enough-pass" } })).status, 409);
  assert.equal(parse(await call(app, "POST", "/auth/login", { body: { username: "sam_92", password: "wrong-password" } })).status, 401);
  assert.equal(parse(await call(app, "POST", "/auth/login", { body: { username: "nobody", password: "long-enough-pass" } })).status, 401);
});

test("改密：旧密码不对 401，改完旧密码失效新密码可用", async () => {
  const { app } = makeApp();
  const { token } = await register(app);
  assert.equal(parse(await call(app, "POST", "/auth/password", { token, body: { currentPassword: "not-the-password", newPassword: "next-pass-123" } })).status, 401);
  assert.equal(parse(await call(app, "POST", "/auth/password", { token, body: { currentPassword: "long-enough-pass", newPassword: "next-pass-123" } })).status, 200);
  assert.equal(parse(await call(app, "POST", "/auth/login", { body: { username: "sam_92", password: "long-enough-pass" } })).status, 401);
  assert.equal(parse(await call(app, "POST", "/auth/login", { body: { username: "sam_92", password: "next-pass-123" } })).status, 200);
});

test("未登录访问受保护接口返回 401", async () => {
  const { app } = makeApp();
  assert.equal(parse(await call(app, "GET", "/progress")).status, 401);
  assert.equal(parse(await call(app, "GET", "/auth/me")).status, 401);
  assert.equal(parse(await call(app, "GET", "/auth/me", { token: "forged.token.value" })).status, 401);
});

test("进度：首次 PUT 建行，GET 能读回，两个账号互相看不见", async () => {
  const { app } = makeApp();
  const a = await register(app, "alice", "long-enough-pass");
  const b = await register(app, "bob", "long-enough-pass");

  assert.deepEqual(parse(await call(app, "GET", "/progress", { token: a.token })).json, { revision: 0, payload: null, updatedAt: null });

  const saved = parse(await call(app, "PUT", "/progress", { token: a.token, body: { baseRevision: 0, payload: { records: [1, 2] } } }));
  assert.equal(saved.status, 200);
  assert.equal(saved.json.revision, 1);

  const readA = parse(await call(app, "GET", "/progress", { token: a.token })).json;
  assert.deepEqual(readA.payload, { records: [1, 2] });
  assert.deepEqual(parse(await call(app, "GET", "/progress", { token: b.token })).json.payload, null);
});

test("进度：版本对不上返回 409 并带上服务端最新值", async () => {
  const { app } = makeApp();
  const { token } = await register(app);
  await call(app, "PUT", "/progress", { token, body: { baseRevision: 0, payload: { v: 1 } } });

  const conflict = parse(await call(app, "PUT", "/progress", { token, body: { baseRevision: 0, payload: { v: 2 } } }));
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error, "CONFLICT");
  assert.equal(conflict.json.server.revision, 1);
  assert.deepEqual(conflict.json.server.payload, { v: 1 });

  const ok = parse(await call(app, "PUT", "/progress", { token, body: { baseRevision: 1, payload: { v: 2 } } }));
  assert.equal(ok.json.revision, 2);
});

test("进度：payload 缺失或 baseRevision 非法一律 400", async () => {
  const { app } = makeApp();
  const { token } = await register(app);
  assert.equal(parse(await call(app, "PUT", "/progress", { token, body: { baseRevision: 0 } })).status, 400);
  assert.equal(parse(await call(app, "PUT", "/progress", { token, body: { payload: {} } })).status, 400);
  assert.equal(parse(await call(app, "PUT", "/progress", { token, body: { payload: {}, baseRevision: -1 } })).status, 400);
});

test("注册开关可以关掉（DRILL_ALLOW_REGISTER=off）", async () => {
  const app = createApp({ env: { ...ENV, DRILL_ALLOW_REGISTER: "off" }, log: silentLogger(), repos: createFakeRepos() });
  const res = await call(app, "POST", "/auth/register", { body: { username: "sam_92", password: "long-enough-pass" } });
  assert.equal(res.statusCode, 403);
});

test("入参不合法返回 400 且带 field，不会碰到数据库", async () => {
  const { app, repos } = makeApp();
  const res = parse(await call(app, "POST", "/auth/register", { body: { username: "a", password: "x" } }));
  assert.equal(res.status, 400);
  assert.equal(res.json.field, "username");
  assert.equal(repos._dump.accounts.size, 0);
});
