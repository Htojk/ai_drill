import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 自签会话令牌（HS256 形态的 JWT）。
 *
 * 为什么自己签而不是用平台的登录态：平台不允许「用户名 + 密码」自助注册
 * （官方原文：用户名密码创建用户，请前往云后台创建），而账号体系是本项目的
 * 硬需求。自签令牌让注册/登录完全在应用内闭环，且数据接口仍然按 uid 隔离。
 * 密钥只存在于云函数环境变量 DRILL_TOKEN_SECRET，不进仓库、不下发前端。
 */

const encode = (value) => Buffer.from(value).toString("base64url");
const decode = (text) => Buffer.from(text, "base64url");

function signature(secret, body) {
  return createHmac("sha256", secret).update(body).digest();
}

export const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 天：自用场景不折腾重复登录

export function issueToken({ uid, username }, secret, { ttlSeconds = DEFAULT_TTL_SECONDS, now = Date.now() } = {}) {
  if (!secret) throw new Error("token secret is required");
  const issuedAt = Math.floor(now / 1000);
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encode(JSON.stringify({ sub: uid, name: username, iat: issuedAt, exp: issuedAt + ttlSeconds }));
  const body = `${header}.${payload}`;
  return `${body}.${encode(signature(secret, body))}`;
}

export function verifyToken(token, secret, { now = Date.now() } = {}) {
  if (!secret || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, given] = parts;
  const expected = signature(secret, `${header}.${payload}`);
  const received = decode(given);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  let claims;
  try {
    claims = JSON.parse(decode(payload).toString("utf8"));
  } catch {
    return null;
  }
  if (!claims || typeof claims.sub !== "string" || typeof claims.exp !== "number") return null;
  if (claims.exp * 1000 <= now) return null;
  return claims;
}
