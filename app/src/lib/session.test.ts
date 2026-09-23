import { beforeEach, describe, expect, it } from "vitest";
import { clearSession, currentToken, isLoggedIn, loadSession, saveSession } from "./session";

class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

describe("session", () => {
  it("没登录时返回 null，token 为空字符串", () => {
    expect(loadSession()).toBeNull();
    expect(currentToken()).toBe("");
    expect(isLoggedIn()).toBe(false);
  });

  it("存下来能读回，并带上保存时间", () => {
    const saved = saveSession("tok-1", { uid: "u-1", username: "sam" });
    expect(saved.savedAt).toBeGreaterThan(0);
    const loaded = loadSession();
    expect(loaded?.token).toBe("tok-1");
    expect(loaded?.user.username).toBe("sam");
    expect(currentToken()).toBe("tok-1");
    expect(isLoggedIn()).toBe(true);
  });

  it("退出登录会清掉本地令牌", () => {
    saveSession("tok-1", { uid: "u-1", username: "sam" });
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it("本地数据被写坏时当作未登录，而不是抛异常", () => {
    localStorage.setItem("aq.session.v1", "{ not json");
    expect(loadSession()).toBeNull();
    localStorage.setItem("aq.session.v1", JSON.stringify({ token: "t" }));
    expect(loadSession()).toBeNull();
  });
});
