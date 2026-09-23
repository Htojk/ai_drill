import { Unauthorized } from "./errors.mjs";
import { verifyToken } from "./token.mjs";

export function bearerToken(req) {
  const header = req.headers?.authorization || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

/** 需要登录的路由统一走这里；失败即 401，不区分「没带」和「过期」。 */
export function requireAuth(req, ctx) {
  const claims = verifyToken(bearerToken(req), ctx.config.tokenSecret);
  if (!claims) throw new Unauthorized();
  return claims;
}
