import { assertConfig } from "./src/core/config.mjs";
import { createApp } from "./src/app.mjs";
import { createLogger } from "./src/core/log.mjs";
import { normalizeRequest } from "./src/http/request.mjs";
import { fail, preflight } from "./src/http/response.mjs";

/**
 * 云函数入口（HTTP 触发）。职责只有四件事：
 * 适配事件 → 校验配置 → 交给路由 → 兜底错误。
 * 业务逻辑一律不放这里，方便测试时绕开平台。
 */

let cached = null;

function app(log) {
  if (!cached) cached = createApp({ log });
  return cached;
}

export async function main(event = {}, context = {}) {
  const log = createLogger("api", { requestId: event.requestId || context.request_id || "" });
  const req = normalizeRequest(event, context);
  const done = log.timer("request.end");

  if (req.method === "OPTIONS") return preflight();

  try {
    const instance = app(log);
    assertConfig(instance.ctx.config);
    const res = await instance.router.handle(req, instance.ctx);
    done({ method: req.method, path: req.path, status: res.statusCode, source: req.source });
    return res;
  } catch (err) {
    done({ method: req.method, path: req.path, status: 500, source: req.source });
    if (err?.code === "DB_ERROR") {
      log.error("request.db_failed", { message: err.message });
      return fail(503, "DB_UNAVAILABLE", "数据库暂时不可用，请稍后重试");
    }
    log.error("request.crash", { message: err?.message, hint: "多为环境变量缺失或依赖未随包安装" });
    return fail(500, "INTERNAL", "服务暂时不可用，请稍后重试");
  }
}
