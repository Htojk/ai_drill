import type { ApiUser, ProgressPayload, ServerProgress } from "../types";

/**
 * 后端 HTTP 客户端。
 *
 * 只有一件事要特别注意：**网络失败必须能被区分出来**。后端不可达时上层要维持
 * 「本地优先」——照常答题、稍后再同步，而不是把用户挡在门外。
 * 所以这里把网络错误统一包成 status=0 的 ApiError，调用方看 err.offline 即可。
 */

/** 默认指向自用环境的 HTTP 函数入口；换环境时用 VITE_API_BASE 覆盖。 */
const DEFAULT_API_BASE = "https://test-d2gk9bnf2dc862288.service.tcloudbase.com/api";
const TIMEOUT_MS = 15000;

function envValue(key: string): string | undefined {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.[key];
}

export function apiBase(): string {
  return (envValue("VITE_API_BASE") || DEFAULT_API_BASE).replace(/\/+$/, "");
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field?: string;
  /** 409 冲突时后端会带回服务端最新进度，交给合并逻辑 */
  readonly server?: ServerProgress;

  constructor(status: number, code: string, message: string, extra: { field?: string; server?: ServerProgress } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = extra.field;
    this.server = extra.server;
  }

  /** 网络层失败（离线/超时/DNS）：调用方应继续本地流程，稍后重试同步。 */
  get offline(): boolean {
    return this.status === 0;
  }

  get unauthorized(): boolean {
    return this.status === 401;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "content-type": "application/json",
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // 中间页/网关错误页返回的是 HTML：不能因为解析不了 JSON 就把状态码丢掉
      data = null;
    }
    if (!res.ok) {
      const payload = (data ?? {}) as { error?: string; message?: string; field?: string; server?: ServerProgress };
      throw new ApiError(res.status, payload.error || `HTTP_${res.status}`, payload.message || `请求失败（${res.status}）`, {
        field: payload.field,
        server: payload.server
      });
    }
    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, "OFFLINE", "连不上服务器，已按本地模式继续");
  } finally {
    clearTimeout(timer);
  }
}

export const authApi = {
  health: () => request<{ ok: boolean; service: string }>("/health"),
  register: (username: string, password: string) =>
    request<{ token: string; user: ApiUser }>("/auth/register", { method: "POST", body: { username, password } }),
  login: (username: string, password: string) =>
    request<{ token: string; user: ApiUser }>("/auth/login", { method: "POST", body: { username, password } }),
  me: (token: string) => request<{ user: ApiUser }>("/auth/me", { token }),
  changePassword: (token: string, currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>("/auth/password", { method: "POST", token, body: { currentPassword, newPassword } })
};

export const progressApi = {
  get: (token: string) => request<ServerProgress>("/progress", { token }),
  put: (token: string, payload: ProgressPayload, baseRevision: number) =>
    request<ServerProgress>("/progress", { method: "PUT", token, body: { payload, baseRevision } })
};
