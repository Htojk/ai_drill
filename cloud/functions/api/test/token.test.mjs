import assert from "node:assert/strict";
import { test } from "node:test";
import { issueToken, verifyToken } from "../src/core/token.mjs";

const SECRET = "test-secret-value";
const NOW = 1_700_000_000_000;

test("签发后能验回同样的 uid / 用户名", () => {
  const token = issueToken({ uid: "u-1", username: "sam" }, SECRET, { now: NOW });
  const claims = verifyToken(token, SECRET, { now: NOW });
  assert.equal(claims.sub, "u-1");
  assert.equal(claims.name, "sam");
});

test("换密钥验不过（密钥只在云函数环境变量里）", () => {
  const token = issueToken({ uid: "u-1", username: "sam" }, SECRET, { now: NOW });
  assert.equal(verifyToken(token, "other-secret", { now: NOW }), null);
});

test("篡改载荷后签名对不上", () => {
  const token = issueToken({ uid: "u-1", username: "sam" }, SECRET, { now: NOW });
  const [header, , sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ sub: "u-2", exp: 9_999_999_999 })).toString("base64url");
  assert.equal(verifyToken(`${header}.${forged}.${sig}`, SECRET, { now: NOW }), null);
});

test("过期令牌验不过", () => {
  const token = issueToken({ uid: "u-1", username: "sam" }, SECRET, { ttlSeconds: 60, now: NOW });
  assert.equal(verifyToken(token, SECRET, { now: NOW + 61_000 }), null);
  assert.ok(verifyToken(token, SECRET, { now: NOW + 59_000 }));
});

test("格式不对的输入一律返回 null，不抛异常", () => {
  for (const bad of ["", "a.b", "a.b.c.d", "....", null, undefined, 42]) {
    assert.equal(verifyToken(bad, SECRET, { now: NOW }), null);
  }
});
