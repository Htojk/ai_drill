import { describe, expect, it } from "vitest";
import { checkPassphrase, decryptProgressCode, encryptProgressCode, isEncrypted } from "./crypto";

const CODE = "eyJ2ZXJzaW9uIjoxLCJyZWNvcmRzIjpbeyJpc0NvcnJlY3QiOnRydWV9XX0=";
const PASS = "quiz-2026";

describe("checkPassphrase", () => {
  it("太短的口令被拒绝", () => {
    expect(checkPassphrase("123")).toMatch(/至少 6 位/);
  });

  it("长度够就通过", () => {
    expect(checkPassphrase(PASS)).toBeNull();
  });
});

describe("isEncrypted", () => {
  it("加密前缀能识别，未加密的纯 base64 不能", () => {
    expect(isEncrypted("AQ1.abc.def.ghi")).toBe(true);
    expect(isEncrypted(CODE)).toBe(false);
  });

  it("容忍首尾空白", () => {
    expect(isEncrypted("  AQ1.abc  ")).toBe(true);
  });
});

describe("加密与解密", () => {
  it("同一口令能还原原文", async () => {
    const payload = await encryptProgressCode(CODE, PASS);
    expect(isEncrypted(payload)).toBe(true);
    expect(await decryptProgressCode(payload, PASS)).toBe(CODE);
  });

  it("密文里不含明文，每次盐值不同所以结果不同", async () => {
    const a = await encryptProgressCode(CODE, PASS);
    const b = await encryptProgressCode(CODE, PASS);
    expect(a).not.toBe(b);
    expect(a).not.toContain(CODE);
  });

  it("口令不对时报错，不返回原文", async () => {
    const payload = await encryptProgressCode(CODE, PASS);
    await expect(decryptProgressCode(payload, "wrong-pass")).rejects.toThrow(/口令不对/);
  });

  it("密文被篡改时报错（AES-GCM 认证）", async () => {
    const payload = await encryptProgressCode(CODE, PASS);
    const parts = payload.split(".");
    const tampered = [parts[0], parts[1], parts[2], parts[3].slice(0, -4) + "AAAA"].join(".");
    await expect(decryptProgressCode(tampered, PASS)).rejects.toThrow(/口令不对|格式/);
  });

  it("结构不对时报格式错误", async () => {
    await expect(decryptProgressCode("AQ1.onlyonepart", PASS)).rejects.toThrow(/格式/);
  });

  it("口令太短时拒绝加密", async () => {
    await expect(encryptProgressCode(CODE, "123")).rejects.toThrow(/至少 6 位/);
  });
});
