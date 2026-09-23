import type { ApiUser } from "../types";

/**
 * 登录态存本机。
 *
 * 令牌是后端自签的长期会话（默认 30 天），日常打开不会撞到登录墙；
 * 这里只负责存取，不做自动续期——过期就是 401，页面会让用户重新登录。
 */
const KEY = "aq.session.v1";

export interface Session {
  token: string;
  user: ApiUser;
  savedAt: number;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    return parsed?.token && parsed?.user?.uid ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: ApiUser): Session {
  const session: Session = { token, user, savedAt: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* 隐私模式下写不进去；本次会话仍可用，只是刷新后要重新登录 */
  }
  return session;
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 忽略 */
  }
}

export function currentToken(): string {
  return loadSession()?.token ?? "";
}

export function isLoggedIn(): boolean {
  return currentToken().length > 0;
}
