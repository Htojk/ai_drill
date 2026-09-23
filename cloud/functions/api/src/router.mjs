import { fail, preflight } from "./http/response.mjs";

/**
 * 极简路由：只支持静态路径，并且用「路径后缀」匹配。
 *
 * 为什么是后缀：函数既可能挂在 https://<env>.service.tcloudbase.com/register，
 * 也可能挂在 .../api/register 或 .../v1/functions/api/register。
 * 后缀匹配让部署路径变了也不用改代码；代价是要求路径足够具体（如 /auth/login）。
 */
function matchPath(routePath, requestPath) {
  const route = routePath.startsWith("/") ? routePath : `/${routePath}`;
  const req = requestPath === "/" ? "/" : requestPath.replace(/\/+$/, "");
  // route 本身以 "/" 开头，所以 endsWith 已经隐含了「路径单元边界」，
  // 不会再出现 /unhealthy 命中 /health 这种误判。
  return req === route || req.endsWith(route);
}

export function createRouter(routes) {
  return {
    routes,
    async handle(req, ctx) {
      if (req.method === "OPTIONS") return preflight();
      const seen = [];
      for (const route of routes) {
        if (!matchPath(route.path, req.path)) continue;
        if (route.method !== req.method) {
          seen.push(route.method);
          continue;
        }
        const started = Date.now();
        try {
          const res = await route.handler(req, ctx);
          ctx.log.info("route.ok", { route: `${route.method} ${route.path}`, status: res.statusCode, ms: Date.now() - started });
          return res;
        } catch (err) {
          // 带 statusCode + code 的是业务错误（见 core/errors.mjs），按契约返回；
          // 其它异常一律往上抛，由入口记 error 日志并回 500，避免把内部细节漏出去。
          if (err && typeof err.statusCode === "number" && err.code) {
            ctx.log.warn("route.error", { route: `${route.method} ${route.path}`, code: err.code, message: err.message });
            return fail(err.statusCode, err.code, err.message, err.extra);
          }
          throw err;
        }
      }
      if (seen.length > 0) return fail(405, "METHOD_NOT_ALLOWED", `该路径只支持 ${seen.join(" / ")}`);
      return fail(404, "NOT_FOUND", `没有匹配的路由：${req.method} ${req.path}`);
    }
  };
}
