import { ApiError, authApi } from "./api";
import * as session from "./session";
import type { ApiUser } from "../types";

/** 账号编排层：把 API 调用 + 本地会话存取绑成一步，页面只调这里。 */

export async function register(username: string, password: string): Promise<ApiUser> {
  const res = await authApi.register(username, password);
  session.saveSession(res.token, res.user);
  return res.user;
}

export async function login(username: string, password: string): Promise<ApiUser> {
  const res = await authApi.login(username, password);
  session.saveSession(res.token, res.user);
  return res.user;
}

export function logout(): void {
  session.clearSession();
}

/**
 * 用本地令牌换一次服务器上的身份：
 * - 返回用户 → 登录态有效
 * - 抛 401 → 令牌失效，本地会话已经顺手清掉
 * - 抛离线错误 → 原样抛出，调用方保持「离线期间也算登录着」
 */
export async function refreshMe(): Promise<ApiUser> {
  const token = session.currentToken();
  if (!token) throw new ApiError(401, "NO_SESSION", "尚未登录");
  try {
    const res = await authApi.me(token);
    session.saveSession(token, res.user);
    return res.user;
  } catch (err) {
    if (err instanceof ApiError && err.unauthorized) session.clearSession();
    throw err;
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await authApi.changePassword(session.currentToken(), currentPassword, newPassword);
}

/** 把后端错误码翻译成一句人话；页面不必认识状态码。 */
export function friendlyMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return err instanceof Error ? err.message : "操作失败，请重试";
  if (err.offline) return "连不上服务器：检查网络，或稍后再试。本地进度不受影响。";
  switch (err.code) {
    case "CONFLICT":
      return err.field === "username" ? "这个用户名已经被占用了。" : err.message;
    case "UNAUTHORIZED":
      return "用户名或密码不正确。";
    case "FORBIDDEN":
      return "服务器已关闭注册。";
    case "INVALID_PARAM":
      return err.message || "填写的内容不符合要求。";
    default:
      return err.message;
  }
}
