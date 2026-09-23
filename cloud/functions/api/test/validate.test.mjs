import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequest } from "../src/core/errors.mjs";
import { optionalObject, requirePassword, requireUsername } from "../src/core/validate.mjs";

test("用户名：3-32 位，只允许字母数字下划线短横线", () => {
  assert.equal(requireUsername({ username: "sam_92-x" }), "sam_92-x");
  for (const bad of ["ab", "a".repeat(33), "sam 92", "sam@host", "中文名"]) {
    assert.throws(() => requireUsername({ username: bad }), BadRequest, bad);
  }
});

test("口令：不做 trim、不限制字符集，只卡长度", () => {
  assert.equal(requirePassword({ password: " 1234567 " }), " 1234567 ");
  assert.throws(() => requirePassword({ password: "short" }), BadRequest);
  assert.throws(() => requirePassword({ password: "x".repeat(73) }), BadRequest);
  assert.throws(() => requirePassword({}), BadRequest);
});

test("requirePassword 支持自定义字段名（改密接口用 currentPassword/newPassword）", () => {
  assert.equal(requirePassword({ newPassword: "abcdefgh" }, "newPassword"), "abcdefgh");
  assert.throws(() => requirePassword({ password: "abcdefgh" }, "newPassword"), BadRequest);
});

test("optionalObject：缺省返回 null，数组和超大对象被拒", () => {
  assert.equal(optionalObject({}, "payload"), null);
  assert.deepEqual(optionalObject({ payload: { a: 1 } }, "payload"), { a: 1 });
  assert.throws(() => optionalObject({ payload: [] }, "payload"), BadRequest);
  assert.throws(() => optionalObject({ payload: { big: "x".repeat(300) } }, "payload", { maxBytes: 100 }), BadRequest);
});
