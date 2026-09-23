import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changePassword, friendlyMessage, login, logout, refreshMe, register } from "./account";
import { loadSession, saveSession } from "./session";
import { ApiError } from "./api";

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

function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

function stubFetch(handler: (url: string) => unknown) {
  (globalThis as { fetch?: unknown }).fetch = (url: string) => Promise.resolve(handler(url));
}

async function captureError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (err) {
    return err as ApiError;
  }
  throw new Error("预期会失败，但请求成功了");
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe("注册 / 登录 / 退出", () => {
  it("注册成功即写入本地会话", async () => {
    stubFetch(() => respond(201, { token: "tok-a", user: { uid: "u-1", username: "sam" } }));
    const user = await register("sam", "long-enough-pass");
    expect(user.uid).toBe("u-1");
    expect(loadSession()?.token).toBe("tok-a");
  });

  it("登录成功也写入本地会话", async () => {
    stubFetch(() => respond(200, { token: "tok-b", user: { uid: "u-2", username: "bob" } }));
    await login("bob", "long-enough-pass");
    expect(loadSession()?.user.username).toBe("bob");
  });

  it("登录失败不写会话，并把 401 抛给调用方", async () => {
    stubFetch(() => respond(401, { error: "UNAUTHORIZED", message: "用户名或密码不正确" }));
    await expect(login("bob", "wrong-password")).rejects.toBeInstanceOf(ApiError);
    expect(loadSession()).toBeNull();
  });

  it("退出登录清空会话", () => {
    saveSession("tok-c", { uid: "u-3", username: "carl" });
    logout();
    expect(loadSession()).toBeNull();
  });
});

describe("refreshMe", () => {
  it("没有本地会话时直接抛未登录", async () => {
    await expect(refreshMe()).rejects.toMatchObject({ code: "NO_SESSION" });
  });

  it("令牌有效时返回服务端身份并刷新本地缓存", async () => {
    saveSession("tok-d", { uid: "u-4", username: "old-name" });
    stubFetch(() => respond(200, { user: { uid: "u-4", username: "new-name" } }));
    const user = await refreshMe();
    expect(user.username).toBe("new-name");
    expect(loadSession()?.user.username).toBe("new-name");
  });

  it("令牌失效（401）时顺手清掉本地会话", async () => {
    saveSession("tok-e", { uid: "u-5", username: "dave" });
    stubFetch(() => respond(401, { error: "UNAUTHORIZED", message: "登录已失效" }));
    await expect(refreshMe()).rejects.toBeInstanceOf(ApiError);
    expect(loadSession()).toBeNull();
  });

  it("离线时保留本地会话（断网不能把人踢成未登录）", async () => {
    saveSession("tok-f", { uid: "u-6", username: "erin" });
    stubFetch(() => {
      throw new TypeError("failed to fetch");
    });
    const err = await captureError(refreshMe());
    expect(err.offline).toBe(true);
    expect(loadSession()?.token).toBe("tok-f");
  });
});

describe("改密与文案", () => {
  it("改密带上当前令牌", async () => {
    saveSession("tok-g", { uid: "u-7", username: "fred" });
    let authHeader = "";
    (globalThis as { fetch?: unknown }).fetch = (_url: string, init: RequestInit) => {
      authHeader = String((init.headers as Record<string, string>).authorization);
      return Promise.resolve(respond(200, { ok: true }));
    };
    await changePassword("old-pass-123", "new-pass-123");
    expect(authHeader).toBe("Bearer tok-g");
  });

  it("错误码翻译成人话：冲突 / 认证失败 / 离线", () => {
    expect(friendlyMessage(new ApiError(409, "CONFLICT", "冲突", { field: "username" }))).toContain("已经被占用");
    expect(friendlyMessage(new ApiError(401, "UNAUTHORIZED", "x"))).toContain("不正确");
    expect(friendlyMessage(new ApiError(403, "FORBIDDEN", "x"))).toContain("关闭注册");
    expect(friendlyMessage(new ApiError(0, "OFFLINE", "x"))).toContain("连不上服务器");
    expect(friendlyMessage(new Error("普通错误"))).toBe("普通错误");
    expect(friendlyMessage("字符串")).toContain("操作失败");
  });
});
