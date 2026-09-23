import { createDb } from "./core/db.mjs";
import { createLogger } from "./core/log.mjs";
import { createRouter } from "./router.mjs";
import { healthRoutes } from "./routes/health-routes.mjs";
import { loadConfig } from "./core/config.mjs";

/**
 * 组装依赖：config / logger / 仓储 / 路由表。
 * 测试里可以用注入的假仓储直接建一个 app，不需要连云数据库。
 */
export function createApp({ env = process.env, log = createLogger("api"), db = null, repos = null } = {}) {
  const config = loadConfig(env);
  const database = db || createDb(config, log);

  const ctx = { config, log, db: database, ...repos };
  const routes = [...healthRoutes(ctx)];
  return { ctx, router: createRouter(routes), routes };
}
