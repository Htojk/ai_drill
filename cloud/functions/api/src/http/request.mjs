/**
 * 把平台传入的事件适配成统一请求：{ method, path, query, headers, body, source }
 *
 * 需要兼容三种形态（部署方式不同，事件形状不同）：
 *   1. gateway  —— API 网关 / SCF HTTP 触发（--httpFn 部署时的正式形态）
 *   2. framework —— @cloudbase/functions-framework 路由（元信息在 context.httpContext）
 *   3. direct   —— 直接调用（tcb fn invoke 或本地测试）
 */

const OPTIONS_PATHS = new Set(["", "/"]);

function normalizeHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    if (v === undefined || v === null) continue;
    out[String(k).toLowerCase()] = Array.isArray(v) ? v[0] : String(v);
  }
  return out;
}

function splitTarget(target) {
  const text = String(target || "/");
  const at = text.indexOf("?");
  if (at === -1) return { path: text, query: {} };
  const query = {};
  for (const [k, v] of new URLSearchParams(text.slice(at + 1))) query[k] = v;
  return { path: text.slice(0, at), query };
}

function parseBody(raw, isBase64) {
  if (raw === undefined || raw === null || raw === "") return null;
  const text = isBase64 ? Buffer.from(String(raw), "base64").toString("utf8") : String(raw);
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return { __raw: text };
  }
}

export function normalizeRequest(event = {}, context = {}) {
  const method = (value) => String(value || "get").toUpperCase();
  const http = event.httpContext || context.httpContext || null;

  if (event.httpMethod || event.requestContext) {
    const target = event.rawQueryString ? `${event.rawPath || event.path || "/"}?${event.rawQueryString}` : event.rawPath || event.path || "/";
    const { path, query } = splitTarget(target);
    return {
      source: "gateway",
      method: method(event.httpMethod),
      path: path || "/",
      query: { ...query, ...(event.queryStringParameters || {}) },
      headers: normalizeHeaders(event.headers),
      body: parseBody(event.body, event.isBase64Encoded)
    };
  }

  if (http && http.url) {
    const { path, query } = splitTarget(http.url);
    return {
      source: "framework",
      method: method(http.httpMethod || http.method),
      path: path || "/",
      query,
      headers: normalizeHeaders(http.headers),
      body: parseBody(typeof event.body === "string" ? event.body : event.body ? JSON.stringify(event.body) : null, false)
    };
  }

  const { path, query } = splitTarget(event.path || event.url || "/");
  return {
    source: "direct",
    method: method(event.method || event.httpMethod),
    path: path || "/",
    query: { ...query, ...(event.query || {}) },
    headers: normalizeHeaders(event.headers),
    body: event.body !== undefined ? event.body : event
  };
}

/** 健康检查/预检这类无路径请求，统一当成根路径。 */
export function isRootPath(path) {
  return OPTIONS_PATHS.has(String(path || ""));
}
