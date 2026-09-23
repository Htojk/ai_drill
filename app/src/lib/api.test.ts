import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiBase, authApi, progressApi, request } from "./api";

/** 只实现被测代码真正用到的部分：ok / status / text()。 */
function respond(status: number, body: string) {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

const calls: { url: string; init: RequestInit }[] = [];

/** 抓到被拒的原因并收窄成 ApiError（比 .catch(e => e as ApiError) 更不容易被 unknown 咬）。 */
async function captureError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (err) {
    return err as ApiError;
  }
  throw new Error("预期会失败，但请求成功了");
}

function stubFetch(handler: (url: string, init: RequestInit) => unknown) {
  (globalThis as { fetch?: unknown }).fetch = (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(handler(url, init));
  };
}

beforeEach(() => {
  calls.length = 0;
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe("apiBase", () => {
  it("默认指向自用环境的后端，且不带尾斜杠", () => {
    expect(apiBase()).toBe("https://test-d2gk9bnf2dc862288.service.tcloudbase.com/api");
    expect(apiBase().endsWith("/")).toBe(false);
  });
});

describe("request", () => {
  it("200 时返回解析后的 JSON", async () => {
    stubFetch(() => respond(200, JSON.stringify({ ok: true })));
    await expect(request("/health")).resolves.toEqual({ ok: true });
    expect(calls[0].url).toBe(`${apiBase()}/health`);
    expect(calls[0].init.method).toBe("GET");
  });

  it("带认证时附加 Bearer 头", async () => {
    stubFetch(() => respond(200, "{}"));
    await request("/auth/me", { token: "t-1" });
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer t-1");
  });

  it("非 2xx 时抛出带 code / field / server 的 ApiError", async () => {
    const server = { revision: 3, payload: null, updatedAt: null };
    stubFetch(() => respond(409, JSON.stringify({ error: "CONFLICT", message: "冲突", field: "baseRevision", server })));
    const err = await captureError(request("/progress", { method: "PUT", body: {} }));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe("CONFLICT");
    expect(err.field).toBe("baseRevision");
    expect(err.server).toEqual(server);
  });

  it("错误页返回 HTML 时也不丢状态码", async () => {
    stubFetch(() => respond(502, "<html>bad gateway</html>"));
    const err = await captureError(request("/health"));
    expect(err.status).toBe(502);
    expect(err.code).toBe("HTTP_502");
  });

  it("网络失败包成 status=0 且 offline 为真（上层据此走本地模式）", async () => {
    stubFetch(() => {
      throw new TypeError("failed to fetch");
    });
    const err = await captureError(request("/health"));
    expect(err.offline).toBe(true);
    expect(err.status).toBe(0);
  });
});

describe("接口封装", () => {
  it("登录发 POST 并把用户名密码放进 body", async () => {
    stubFetch(() => respond(200, JSON.stringify({ token: "t", user: { uid: "u", username: "sam" } })));
    const res = await authApi.login("sam", "long-enough-pass");
    expect(res.user.username).toBe("sam");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ username: "sam", password: "long-enough-pass" });
  });

  it("保存进度发 PUT，带上 baseRevision 与服务端对账", async () => {
    stubFetch(() => respond(200, JSON.stringify({ revision: 4, payload: {}, updatedAt: "now" })));
    const payload = { records: [], reviews: {}, profile: {}, bookmarks: [], reports: [], mastery: {}, tasks: {} };
    const res = await progressApi.put("t", payload as never, 3);
    expect(res.revision).toBe(4);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.baseRevision).toBe(3);
    expect(body.payload).toEqual(payload);
  });

  it("health 用于连接自检", async () => {
    const spy = vi.fn(() => respond(200, JSON.stringify({ ok: true, service: "ai-drill-api" })));
    (globalThis as { fetch?: unknown }).fetch = spy;
    await expect(authApi.health()).resolves.toMatchObject({ ok: true });
  });
});
