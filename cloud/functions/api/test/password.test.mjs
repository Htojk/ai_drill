import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "../src/core/password.mjs";

test("同一个口令两次哈希结果不同（盐随机）", async () => {
  const a = await hashPassword("correct-horse-battery");
  const b = await hashPassword("correct-horse-battery");
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
});

test("正确口令校验通过，错误口令不通过", async () => {
  const { salt, hash } = await hashPassword("correct-horse-battery");
  assert.equal(await verifyPassword("correct-horse-battery", salt, hash), true);
  assert.equal(await verifyPassword("correct-horse-batterz", salt, hash), false);
});

test("盐或哈希缺失时一律不通过，不抛异常", async () => {
  assert.equal(await verifyPassword("x", "", ""), false);
  assert.equal(await verifyPassword("x", "abc", ""), false);
  assert.equal(await verifyPassword(undefined, "abc", "def"), false);
});

test("哈希长度不对时安全返回 false（而不是 timingSafeEqual 抛错）", async () => {
  const { salt } = await hashPassword("whatever123");
  assert.equal(await verifyPassword("whatever123", salt, "ab"), false);
});
