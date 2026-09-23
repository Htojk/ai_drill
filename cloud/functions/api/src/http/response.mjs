/** 统一的响应构造：全部走 JSON，并带上 CORS（前端是另一个域名的静态站点）。 */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-max-age": "86400"
};

export function json(statusCode, payload, extraHeaders) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...(extraHeaders || {}) },
    body: JSON.stringify(payload ?? null)
  };
}

export function ok(payload) {
  return json(200, payload);
}

export function fail(statusCode, code, message, extra) {
  return json(statusCode, { error: code, message, ...(extra || {}) });
}

export function preflight() {
  return { statusCode: 204, headers: { ...CORS }, body: "" };
}

/** 兜底：handler 返回的不是平台格式时，包成 200 JSON。 */
export function toResponse(result) {
  if (result && typeof result.statusCode === "number") return result;
  return ok(result);
}
