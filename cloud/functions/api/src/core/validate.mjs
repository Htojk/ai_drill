/** 入参校验：所有对外字段都在这里收口，路由层只负责调用。 */

import { BadRequest } from "./errors.mjs";

export { BadRequest };

/** 用户名规则：够短够严，避免和平台保留字、URL 转义、大小写歧义打架。 */
export const USERNAME_RE = /^[A-Za-z0-9_-]{3,32}$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export function requireString(body, field, { label, min = 1, max = 200, pattern } = {}) {
  const name = label || field;
  const value = body?.[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequest(`${name}不能为空`, field);
  }
  const text = value.trim();
  if (text.length < min) throw new BadRequest(`${name}至少 ${min} 个字符`, field);
  if (text.length > max) throw new BadRequest(`${name}最多 ${max} 个字符`, field);
  if (pattern && !pattern.test(text)) throw new BadRequest(`${name}格式不正确`, field);
  return text;
}

export function requireUsername(body) {
  return requireString(body, "username", { label: "用户名", min: 3, max: 32, pattern: USERNAME_RE });
}

/** 口令不做 trim、不做复杂度限制：长度达标的短语更可靠，也不该被静默改写。 */
export function requirePassword(body, field = "password") {
  const value = body?.[field];
  if (typeof value !== "string" || value === "") throw new BadRequest("密码不能为空", field);
  if (value.length < PASSWORD_MIN) throw new BadRequest(`密码至少 ${PASSWORD_MIN} 位`, field);
  if (value.length > PASSWORD_MAX) throw new BadRequest(`密码最多 ${PASSWORD_MAX} 位`, field);
  return value;
}

export function optionalObject(body, field, { maxBytes = 512 * 1024 } = {}) {
  const value = body?.[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new BadRequest(`${field} 必须是对象`, field);
  const size = Buffer.byteLength(JSON.stringify(value), "utf8");
  if (size > maxBytes) throw new BadRequest(`${field} 太大（${size} 字节，上限 ${maxBytes}）`, field);
  return value;
}
